/**
 * The Deal Room's rules as pure functions. The reducer enforces them; screens call the same
 * functions to explain a refusal before it happens. Nothing here reads the wall clock: "now" is
 * the demo clock on the slice.
 */
import { addDays, crosses } from "../time";
import type {
  DealRoomState,
  DrApplication,
  DrConfig,
  DrDecisionEntry,
  DrRfi,
  DrStaff,
  Decision,
  DocKind,
  MatchField,
} from "./types";

export const EV_CA3 = "ev_ca3";
export const DR_TIER = "t_ca3_dr";
export const DR_ZONE = "z_ca3_dr";

/* ---------- people and permissions ---------- */

export type DrCap =
  | "configure"
  | "assign"
  | "import"
  | "review"
  | "decide"
  | "readiness"
  | "match"
  | "introduce"
  | "schedule"
  | "overrideCap"
  | "liveboard"
  | "outcome"
  | "conversion"
  | "grantSupport"
  | "export";

/** What a role may do (PRD Stakeholders and Reporting req. 5). The decide right also needs the person's own flag. */
const CAN: Record<DrStaff["role"], DrCap[]> = {
  Lead: ["configure", "assign", "import", "review", "decide", "readiness", "match", "introduce", "schedule", "overrideCap", "liveboard", "outcome", "conversion", "grantSupport", "export"],
  Reviewer: ["import", "review", "decide", "readiness", "match", "introduce", "outcome"],
  Operations: ["schedule", "overrideCap", "liveboard", "outcome"],
};

export function drCan(staff: DrStaff | undefined, cap: DrCap) {
  if (!staff || !staff.active) return false;
  if (cap === "decide") return staff.role === "Lead" || (staff.role === "Reviewer" && staff.canDecide);
  return CAN[staff.role].includes(cap);
}

export const acting = (dr: DealRoomState) => dr.staff.find((s) => s.id === dr.actingStaffId);
export const staffName = (dr: DealRoomState, id?: string) =>
  !id ? "–" : id === "applicant" ? "Applicant" : id === "system" ? "System" : id === "admin" ? "Algotech" : dr.staff.find((s) => s.id === id)?.name ?? id;

/** Sensitive notes and deal values: the lead, or the person who owns the record (PRD tier 4). */
export function canSeeInternal(staff: DrStaff | undefined, ownerId?: string) {
  return !!staff && staff.active && (staff.role === "Lead" || staff.id === ownerId);
}

/* ---------- the three seeker states ---------- */

/** The decision in force: the latest entry that does not wait for a second decider. */
export function decisionOf(app: DrApplication): DrDecisionEntry | undefined {
  return [...app.decisions].reverse().find((d) => !d.needsSecond || d.second);
}

/** A decision recorded by one decider that a second, different decider still has to confirm. */
export function pendingSecond(app: DrApplication): DrDecisionEntry | undefined {
  const last = app.decisions[app.decisions.length - 1];
  return last && last.needsSecond && !last.second ? last : undefined;
}

export const openConditions = (app: DrApplication) => (decisionOf(app)?.conditions ?? []).filter((c) => !c.met);

/** Qualified: an approved or conditional seeker, or a verified provider. The 150 target counts these. */
export function qualified(app: DrApplication) {
  if (app.type === "provider") return app.verification?.state === "Verified";
  const d = decisionOf(app)?.decision;
  return d === "Approved" || d === "Conditional";
}

/** Only these enter the match search (PRD Matching req. 1). */
export function matchable(app: DrApplication) {
  if (app.reReview) return false;
  if (app.type === "provider") return app.verification?.state === "Verified";
  return qualified(app) && openConditions(app).length === 0 && app.readiness === "Deal Room Ready";
}

/** Why a seeker cannot be Deal Room Ready yet; empty when it can (PRD Qualification req. 6). */
export function readinessBlockers(app: DrApplication, cfg: DrConfig): string[] {
  const out: string[] = [];
  if (!qualified(app)) out.push("Not approved");
  for (const c of cfg.rubric.readiness) if (latestScore(app, "readiness", c.id)?.score === undefined) out.push(`No score: ${c.text}`);
  if (!app.decisionMaker.confirmed) out.push("Decision-maker not confirmed");
  if (openConditions(app).length) out.push(`${openConditions(app).length} open condition${openConditions(app).length > 1 ? "s" : ""}`);
  if (app.reReview) out.push("Under re-review");
  return out;
}

/** What a provider still needs before it can be verified (PRD Qualification req. 8). */
export function verificationBlockers(app: DrApplication): string[] {
  const v = app.verification;
  const out: string[] = [];
  for (const k of ["Registration", "Beneficial owners", "Signatory ID"] as const) {
    if (!v?.kyc[k]) out.push(`${k} not uploaded`);
    else if (!v.kyc[k]!.checked) out.push(`${k} not checked`);
  }
  if (!v?.sanctions) out.push("Sanctions screening not entered");
  else if (v.sanctions.result !== "Clear") out.push("Sanctions screening found a match");
  if (!v?.nda) out.push("NDA not signed");
  if (!app.decisionMaker.confirmed) out.push("Decision-maker not confirmed");
  return out;
}

/* ---------- scoring ---------- */

export function latestScore(app: DrApplication, layer: "eligibility" | "assessment" | "readiness", criterion: string) {
  return [...app.assessments].reverse().find((a) => a.layer === layer && a.criterion === criterion);
}

export function eligibility(app: DrApplication, cfg: DrConfig) {
  const rows = cfg.rubric.eligibility.map((c) => ({ c, a: latestScore(app, "eligibility", c.id) }));
  return { rows, passed: rows.filter((r) => r.a?.pass === true).length, failed: rows.filter((r) => r.a?.pass === false).length, missing: rows.filter((r) => !r.a).length };
}

/** The weighted assessment score, 0 to 100; undefined until every criterion is scored. */
export function weighted(app: DrApplication, cfg: DrConfig) {
  let total = 0;
  for (const c of cfg.rubric.assessment) {
    const s = latestScore(app, "assessment", c.id)?.score;
    if (s === undefined) return undefined;
    total += (s * c.weight) / 100;
  }
  return Math.round(total);
}

export function readinessScore(app: DrApplication, cfg: DrConfig) {
  const s = cfg.rubric.readiness.map((c) => latestScore(app, "readiness", c.id)?.score);
  if (s.some((x) => x === undefined)) return undefined;
  return Math.round((s as number[]).reduce((a, b) => a + b, 0) / s.length);
}

/* ---------- forms ---------- */

export const SEEKER_FIELDS: { key: string; label: string; get: (a: DrApplication) => unknown }[] = [
  { key: "org.name", label: "Legal name", get: (a) => a.org.name },
  { key: "org.regNo", label: "Registration number", get: (a) => a.org.regNo },
  { key: "org.country", label: "Country", get: (a) => a.org.country },
  { key: "org.sector", label: "Sector", get: (a) => a.org.sector },
  { key: "org.website", label: "Website", get: (a) => a.org.website },
  { key: "ask.amount", label: "Amount sought", get: (a) => a.ask?.amount },
  { key: "ask.instrument", label: "Instrument", get: (a) => a.ask?.instrument },
  { key: "ask.useOfFunds", label: "Use of funds", get: (a) => a.ask?.useOfFunds },
  { key: "ask.stage", label: "Stage", get: (a) => a.ask?.stage },
  { key: "traction.revenueBand", label: "Revenue band", get: (a) => a.traction?.revenueBand },
  { key: "traction.customers", label: "Customers", get: (a) => a.traction?.customers },
  { key: "decisionMaker", label: "Decision-maker", get: (a) => a.decisionMaker.name && a.decisionMaker.email && a.decisionMaker.phone && a.decisionMaker.title },
  { key: "mission", label: "Mission", get: (a) => a.mission },
  { key: "source", label: "How you heard of the Deal Room", get: (a) => a.source },
];

export const PROVIDER_FIELDS: { key: string; label: string; get: (a: DrApplication) => unknown }[] = [
  { key: "org.name", label: "Organisation", get: (a) => a.org.name },
  { key: "providerKind", label: "Provider type", get: (a) => a.providerKind },
  { key: "org.country", label: "Headquarters", get: (a) => a.org.country },
  { key: "mandate.sectors", label: "Sectors", get: (a) => a.mandate?.sectors.length },
  { key: "mandate.countries", label: "Countries", get: (a) => a.mandate?.countries.length },
  { key: "mandate.stages", label: "Stages", get: (a) => a.mandate?.stages.length },
  { key: "mandate.ticket", label: "Ticket range", get: (a) => a.mandate && a.mandate.ticketMax > 0 && a.mandate.ticketMax >= a.mandate.ticketMin },
  { key: "mandate.instruments", label: "Instruments", get: (a) => a.mandate?.instruments.length },
  { key: "mandate.exclusions", label: "Exclusions", get: (a) => a.mandate?.exclusions.length },
  { key: "mandate.timeline", label: "Decision timeline", get: (a) => a.mandate?.timeline },
  { key: "decisionMaker", label: "Decision-maker", get: (a) => a.decisionMaker.name && a.decisionMaker.email && a.decisionMaker.phone && a.decisionMaker.title },
  { key: "mission", label: "Mission", get: (a) => a.mission },
  { key: "source", label: "How you heard of the Deal Room", get: (a) => a.source },
];

export const SEEKER_DOCS: { kind: DocKind; key: string }[] = [
  { kind: "Pitch deck", key: "doc.deck" },
  { kind: "Financial statements", key: "doc.financials" },
  { kind: "Registration certificate", key: "doc.registration" },
  { kind: "Feasibility study", key: "doc.feasibility" },
  { kind: "E&S study", key: "doc.es" },
];

/** What blocks submission (required) and what is only flagged (advisory), each named (PRD Applications req. 6). */
export function formGaps(app: DrApplication, cfg: DrConfig) {
  const fields = app.type === "seeker" ? SEEKER_FIELDS : PROVIDER_FIELDS;
  const missing: string[] = [];
  const advisory: string[] = [];
  for (const f of fields) {
    const v = f.get(app);
    const empty = v === undefined || v === "" || v === 0 || v === false;
    if (!empty) continue;
    (cfg.fields[f.key] === "advisory" ? advisory : missing).push(f.label);
  }
  if (app.type === "seeker") {
    for (const d of SEEKER_DOCS) {
      if (app.documents.some((x) => x.kind === d.kind)) continue;
      (cfg.fields[d.key] === "required" ? missing : advisory).push(d.kind);
    }
  }
  return { missing, advisory };
}

/** A change to these after approval sends the record back for re-review (PRD Qualification req. 7). */
export const MATERIAL = { seeker: ["ask.amount", "ask.currency", "ask.instrument"], provider: ["mandate.ticketMin", "mandate.ticketMax", "mandate.sectors", "mandate.exclusions", "mandate.instruments"] };

/* ---------- deadlines (derived from the clock, never stored) ---------- */

export const rfiDue = (rfi: DrRfi, cfg: DrConfig) => addDays(rfi.at, cfg.rules.rfiDays);
export const rfiExpired = (rfi: DrRfi, cfg: DrConfig, now: string) => !rfi.response && !rfi.expiry && rfiDue(rfi, cfg) < now;
export const openRfi = (app: DrApplication) => app.rfis.find((r) => !r.response && !r.expiry);

/** Five working days after approval by default. */
export function profileDeadline(app: DrApplication, cfg: DrConfig) {
  const d = decisionOf(app);
  if (!d) return undefined;
  let at = d.second?.at ?? d.at;
  let left = cfg.rules.profileDays;
  while (left > 0) {
    at = addDays(at, 1);
    const wd = new Date(at.slice(0, 10) + "T12:00:00Z").getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return at.slice(0, 10);
}

export const profileComplete = (app: DrApplication) => !!app.profileCompletedAt;

/* ---------- money and labels ---------- */

export function compact(amount: number, currency = "USD") {
  if (amount >= 1_000_000) return `${currency} ${(amount / 1_000_000).toFixed(amount % 1_000_000 ? 1 : 0)}m`;
  if (amount >= 1_000) return `${currency} ${Math.round(amount / 1_000)}k`;
  return `${currency} ${amount}`;
}

export function askBand(amount: number) {
  if (amount < 500_000) return "Under USD 500k";
  if (amount < 2_000_000) return "USD 0.5m to 2m";
  if (amount < 10_000_000) return "USD 2m to 10m";
  return "USD 10m and over";
}

export const refNo = (type: "seeker" | "provider", n: number) => `CA3-${type === "seeker" ? "CS" : "FP"}-${n.toString().padStart(5, "0")}`;

export const missionName = (cfg: DrConfig, id: string) => cfg.missions.find((m) => m.id === id)?.name ?? id;

/** What the applicant sees: a status, its date, and what is open. */
export function publicStatus(app: DrApplication) {
  if (app.status !== "Decided") return app.status;
  if (app.type === "provider") return app.verification?.state === "Verified" ? "Verified" : app.verification?.state === "Declined" ? "Declined" : "Decided";
  return decisionOf(app)?.decision ?? "Decided";
}

/* ---------- visibility: the four tiers (PRD Confidentiality) ---------- */

export type Resource =
  | { kind: "directory" }
  | { kind: "teaser"; seekerId: string }
  | { kind: "profile"; seekerId: string }
  | { kind: "doc"; seekerId: string; docId: string };

/** Whether a participant may see a resource. Unapproved applicants see only their own application. */
export function canSee(dr: DealRoomState, viewer: DrApplication, r: Resource): { ok: boolean; reason?: string } {
  if (viewer.type === "seeker") {
    if ("seekerId" in r && r.seekerId === viewer.id) return { ok: true };
    return { ok: false, reason: "Seekers see only their own file." };
  }
  if (viewer.verification?.state !== "Verified") return { ok: false, reason: "Opens once your organisation is verified: mandate reviewed, KYC checked and the NDA signed." };
  if (r.kind === "directory") return { ok: true };
  const seeker = dr.apps.find((a) => a.id === r.seekerId);
  if (!seeker) return { ok: false, reason: "Not found." };
  if (r.kind === "teaser") return seeker.teaser?.approved && matchable(seeker) ? { ok: true } : { ok: false, reason: "This teaser is not published." };
  const match = dr.matches.find((m) => m.seekerId === seeker.id && m.providerId === viewer.id && m.intro);
  if (!match?.intro) return { ok: false, reason: "Opens with an introduction from the Deal Room team." };
  if (r.kind === "profile") return { ok: true };
  const both = match.intro.seeker?.response === "Accepted" && match.intro.provider?.response === "Accepted";
  if (!both) return { ok: false, reason: "Documents open once both of you accept the introduction." };
  if (!match.intro.items.includes(r.docId)) return { ok: false, reason: "Not part of this introduction." };
  if (!consentGranted(dr, seeker.id, viewer.id, r.docId)) return { ok: false, reason: "The seeker has not consented to share this document with you." };
  return { ok: true };
}

/** The latest consent entry for a document and a named provider decides. */
export function consentGranted(dr: DealRoomState, seekerId: string, providerId: string, docId: string) {
  const last = [...dr.consents].reverse().find((c) => c.seekerId === seekerId && c.providerId === providerId && c.docId === docId);
  return !!last?.granted;
}

/* ---------- matching (Cut 2) ---------- */

export const MATCH_LABEL: Record<MatchField, string> = { sector: "Sector", country: "Country", stage: "Stage", ticket: "Ticket size", instrument: "Instrument", exclusions: "Exclusions" };

/** Which matching fields a pair meets and misses; an exclusion hit is named, not hidden (PRD Matching req. 2). */
export function fit(seeker: DrApplication, provider: DrApplication, cfg: DrConfig) {
  const m = provider.mandate;
  const met: MatchField[] = [];
  const missed: MatchField[] = [];
  let exclusionHit: string | undefined;
  for (const { field } of cfg.matching) {
    let ok = false;
    if (!m || !seeker.ask) ok = false;
    else if (field === "sector") ok = m.sectors.includes(seeker.org.sector);
    else if (field === "country") ok = m.countries.includes(seeker.org.country);
    else if (field === "stage") ok = m.stages.includes(seeker.ask.stage);
    else if (field === "ticket") ok = seeker.ask.currency === m.currency && seeker.ask.amount >= m.ticketMin && seeker.ask.amount <= m.ticketMax;
    else if (field === "instrument") ok = m.instruments.includes(seeker.ask.instrument);
    else if (field === "exclusions") {
      const hay = `${seeker.org.sector} ${seeker.ask.useOfFunds} ${seeker.traction?.metrics ?? ""}`.toLowerCase();
      exclusionHit = m.exclusions.find((x) => hay.includes(x.toLowerCase()));
      ok = !exclusionHit;
    }
    (ok ? met : missed).push(field);
  }
  return { met, missed, exclusionHit };
}

/* ---------- scheduling (Cut 2) ---------- */

export function sameSlot(aStart: string, aEnd: string, bStart: string, bEnd: string, buffer: number) {
  return crosses(aStart, aEnd, bStart, bEnd, buffer);
}

export const DECISIONS: Decision[] = ["Approved", "Conditional", "Waitlisted", "Declined"];

/* ---------- queue filters shared by the dashboard and the queue ---------- */

export type FlagKey = "unassigned" | "second" | "expired" | "rereview" | "teaser" | "kyc" | "profile" | "leads" | "qualified" | "ready" | "submitted" | "decided";

/** Named slices of the applications, each a drill-down from a dashboard number. */
export const FLAGS: Record<FlagKey, { label: string; test: (a: DrApplication, cfg: DrConfig, now: string) => boolean }> = {
  leads: { label: "Leads and invitations", test: (a) => a.status === "Lead" || a.status === "Invited" },
  submitted: { label: "Submitted", test: (a) => !!a.ref },
  decided: { label: "Decided", test: (a) => a.status === "Decided" },
  qualified: { label: "Qualified", test: (a) => qualified(a) },
  ready: { label: "Deal Room Ready", test: (a) => a.type === "seeker" && a.readiness === "Deal Room Ready" && qualified(a) },
  unassigned: { label: "Not assigned", test: (a) => !a.assignee && ["Submitted", "In review", "Information requested"].includes(a.status) },
  second: { label: "Waiting for a second decider", test: (a) => !!pendingSecond(a) },
  expired: { label: "Information request expired", test: (a, cfg, now) => a.rfis.some((r) => rfiExpired(r, cfg, now)) },
  rereview: { label: "Changed after a decision", test: (a) => !!a.reReview },
  teaser: { label: "Teaser to approve", test: (a) => a.type === "seeker" && !!a.teaser && !a.teaser.approved && qualified(a) },
  kyc: { label: "KYC to check", test: (a) => a.type === "provider" && a.verification?.state === "Verification pending" && Object.values(a.verification.kyc).some((k) => k && !k.checked) },
  profile: { label: "Profile past its deadline", test: (a, cfg, now) => a.type === "seeker" && qualified(a) && !a.profileCompletedAt && (profileDeadline(a, cfg) ?? "9999") < now.slice(0, 10) },
};

/** The lead's funnel against Bouer's targets (PRD Reporting). Later cuts add matches, meetings and conversion. */
export function funnel(dr: DealRoomState, eventId: string) {
  const apps = dr.apps.filter((a) => a.eventId === eventId);
  const seekers = apps.filter((a) => a.type === "seeker");
  const providers = apps.filter((a) => a.type === "provider");
  const count = (arr: DrApplication[], f: (a: DrApplication) => boolean) => arr.filter(f).length;
  return {
    leads: count(apps, (a) => a.status === "Lead" || a.status === "Invited"),
    invited: count(apps, (a) => a.status === "Invited"),
    started: count(apps, (a) => a.status !== "Lead" && a.status !== "Invited"),
    drafts: count(apps, (a) => a.status === "Draft"),
    submitted: count(apps, (a) => !!a.ref),
    inReview: count(apps, (a) => a.status === "Submitted" || a.status === "In review"),
    infoRequested: count(apps, (a) => a.status === "Information requested"),
    decided: count(apps, (a) => a.status === "Decided"),
    approved: count(seekers, (a) => decisionOf(a)?.decision === "Approved"),
    conditional: count(seekers, (a) => decisionOf(a)?.decision === "Conditional"),
    waitlisted: count(seekers, (a) => decisionOf(a)?.decision === "Waitlisted"),
    declined: count(seekers, (a) => decisionOf(a)?.decision === "Declined") + count(providers, (a) => a.verification?.state === "Declined"),
    verified: count(providers, (a) => a.verification?.state === "Verified"),
    ndaSigned: count(providers, (a) => !!a.verification?.nda),
    kycPending: count(providers, (a) => a.verification?.state === "Verification pending"),
    qualifiedSeekers: count(seekers, qualified),
    qualified: count(apps, qualified),
    ready: count(seekers, (a) => qualified(a) && a.readiness === "Deal Room Ready"),
    seekers: seekers.length,
    providers: providers.length,
  };
}

/** Median whole days between two stamps over a set, or undefined. */
export function medianDays(pairs: [string | undefined, string | undefined][]) {
  const d = pairs.filter(([a, b]) => a && b).map(([a, b]) => (new Date(b!.replace(" ", "T") + ":00Z").getTime() - new Date(a!.replace(" ", "T") + ":00Z").getTime()) / 86400000).sort((x, y) => x - y);
  if (!d.length) return undefined;
  return Math.round(d[Math.floor(d.length / 2)] * 10) / 10;
}

/* ---------- invariants: what must always hold, checked on Settings ---------- */

export function validateDealRoom(state: { dealRoom: DealRoomState; delegates: { id: string; cancelled?: boolean; status: string }[] }) {
  const dr = state.dealRoom;
  const problems: string[] = [];
  const refs = new Map<string, number>();
  for (const a of dr.apps) if (a.ref) refs.set(a.ref, (refs.get(a.ref) ?? 0) + 1);
  for (const [ref, n] of refs) if (n > 1) problems.push(`Reference ${ref} is used ${n} times`);
  for (const a of dr.apps) {
    const cfg = dr.configs[a.eventId];
    if (qualified(a)) {
      const d = state.delegates.find((x) => x.id === a.delegateId);
      if (!d || d.cancelled) problems.push(`${a.ref ?? a.id} is qualified but has no live badge`);
    }
    if (a.type === "seeker" && a.readiness === "Deal Room Ready" && qualified(a) && cfg) {
      const b = readinessBlockers(a, cfg).filter((x) => x !== "Under re-review");
      if (b.length) problems.push(`${a.ref} is Deal Room Ready but ${b[0].toLowerCase()}`);
    }
    if (a.status === "Decided" && a.type === "seeker" && !decisionOf(a) && !a.rfis.some((r) => r.expiry?.how === "Withdrawn")) problems.push(`${a.ref} is Decided with no decision in force`);
    for (const x of a.decisions) if (x.second && x.second.by === x.by) problems.push(`${a.ref}: the same person decided and confirmed`);
  }
  return problems;
}
