/**
 * The Deal Room's rules as pure functions. The reducer enforces them; screens call the same
 * functions to explain a refusal before it happens. Nothing here reads the wall clock: "now" is
 * the demo clock on the slice.
 */
import { addDays, addMinutes, crosses, daysBetween, fromMin, toMin } from "../time";
import type {
  DealRoomState,
  DrApplication,
  DrConfig,
  DrDecisionEntry,
  DrMatch,
  DrMeeting,
  DrRfi,
  DrStaff,
  Decision,
  DocKind,
  MatchField,
  MeetingStatus,
  CloseReason,
  DrOpportunity,
  OppStage,
  OutcomeKind,
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
  // meetings: none without a both-accepted introduction, no room, table or person double-booked
  for (const cfg of Object.values(dr.configs)) {
    const occ = dr.meetings.filter((m) => m.eventId === cfg.eventId && occupies(m, cfg, dr.clock));
    for (const m of occ) {
      const mm = dr.matches.find((x) => x.id === m.matchId);
      if (!mm || !bothAccepted(mm)) problems.push(`Meeting ${m.start} has no both-accepted introduction`);
    }
    for (let i = 0; i < occ.length; i++)
      for (let j = i + 1; j < occ.length; j++) {
        const a = occ[i];
        const b = occ[j];
        if (!crosses(a.start, a.end, b.start, b.end, cfg.rules.bufferMin)) continue;
        const ma = dr.matches.find((x) => x.id === a.matchId);
        const mb = dr.matches.find((x) => x.id === b.matchId);
        if (a.roomId && a.roomId === b.roomId && a.table === b.table) problems.push(`Two meetings share ${a.roomId} table ${a.table} at ${a.start}`);
        if (ma && mb && (ma.seekerId === mb.seekerId || ma.providerId === mb.providerId)) problems.push(`A participant has two meetings at ${a.start}`);
      }
  }
  // conversion: won rests on a signed commitment, lost on a reason and a note, every one of them in the pack
  for (const o of dr.opportunities) {
    if (o.stage === "Closed – won" && !o.outcomes.some((x) => x.kind === "Commitment")) problems.push(`Opportunity ${o.id} is won without a signed commitment`);
    if (o.stage === "Closed – lost" && (!o.closed?.reason || !o.closed.note)) problems.push(`Opportunity ${o.id} is lost without a reason and a note`);
  }
  return problems;
}

/* ---------- Cut 2: matches, introductions, meetings ---------- */

export const bothAccepted = (m: DrMatch) => m.intro?.seeker?.response === "Accepted" && m.intro?.provider?.response === "Accepted";
export const introExpiresAt = (m: DrMatch, cfg: DrConfig) => (m.intro ? addDays(m.intro.sentAt, cfg.rules.introDays) : undefined);
/** An introduction neither side answered in time, derived from the clock (PRD Matching req. 8). */
export function introExpired(m: DrMatch, cfg: DrConfig, now: string) {
  if (!m.intro || bothAccepted(m) || m.intro.seeker?.response === "Declined" || m.intro.provider?.response === "Declined") return false;
  return introExpiresAt(m, cfg)! < now;
}

export type MatchStage = "Suggested" | "Deferred" | "Rejected" | "Approved" | "Introduced" | "Accepted" | "Declined" | "Expired";
export function matchStage(m: DrMatch, cfg: DrConfig, now: string): MatchStage {
  if (m.decision === "Suggested" || m.decision === "Deferred" || m.decision === "Rejected") return m.decision;
  if (!m.intro) return "Approved";
  if (m.intro.seeker?.response === "Declined" || m.intro.provider?.response === "Declined") return "Declined";
  if (bothAccepted(m)) return "Accepted";
  if (introExpired(m, cfg, now)) return "Expired";
  return "Introduced";
}

/** A pair that was rejected, declined or expired is not proposed again without the lead's override. */
export function blockedPair(dr: DealRoomState, seekerId: string, providerId: string, cfg: DrConfig) {
  const m = dr.matches.find((x) => x.seekerId === seekerId && x.providerId === providerId);
  if (!m || m.override) return undefined;
  const st = matchStage(m, cfg, dr.clock);
  return st === "Rejected" || st === "Declined" || st === "Expired" ? st : undefined;
}

/** Candidates for one participant, with the fit and the ordering rule applied (PRD Matching req. 3). */
export function candidates(dr: DealRoomState, cfg: DrConfig, who: DrApplication) {
  const others = dr.apps.filter((a) => a.eventId === who.eventId && a.type !== who.type && matchable(a));
  return others
    .map((o) => {
      const seeker = who.type === "seeker" ? who : o;
      const provider = who.type === "seeker" ? o : who;
      const f = fit(seeker, provider, cfg);
      const mandatoryMiss = f.missed.filter((x) => cfg.matching.find((y) => y.field === x)?.mandatory);
      return { other: o, seeker, provider, ...f, mandatoryMiss, readiness: readinessScore(seeker, cfg) ?? 0, existing: dr.matches.find((m) => m.seekerId === seeker.id && m.providerId === provider.id) };
    })
    .sort((a, b) => (cfg.ordering === "criteria" ? b.met.length - a.met.length || b.readiness - a.readiness : b.readiness - a.readiness || b.met.length - a.met.length));
}

/* meetings */

export const ACTIVE: MeetingStatus[] = ["Proposed", "Confirmed", "Change requested", "In progress", "Held", "No-show"];

/** When an unconfirmed slot lapses: the confirm window before the slot, but never sooner than two hours after it was proposed. */
export function confirmBy(m: DrMeeting, cfg: DrConfig) {
  const windowEnd = addMinutes(m.start, -cfg.rules.confirmHours * 60);
  const floor = addMinutes(m.proposedAt, 120);
  const by = windowEnd > floor ? windowEnd : floor;
  return by < m.start ? by : m.start;
}

/** A proposed slot that lapsed unconfirmed is released: derived from the clock, never stored. A slot both sides confirmed never lapses, even while one asks to move it. */
export const lapsed = (m: DrMeeting, cfg: DrConfig, now: string) => (m.status === "Proposed" || m.status === "Change requested") && !(m.confirm.seeker && m.confirm.provider) && confirmBy(m, cfg) < now;
export const occupies = (m: DrMeeting, cfg: DrConfig, now: string) => ACTIVE.includes(m.status) && !lapsed(m, cfg, now);

export const eventDay = (startDate: string, stamp: string) => daysBetween(startDate, stamp) + 1;

export type SlotRequest = { matchId: string; roomId?: string; table?: number; link?: string; start: string; flagged?: boolean; ignore?: string };

/** Every reason a slot cannot be booked; empty when it can. Caps are listed apart because operations may override them. */
/** The other half of the shared room rule: a programme session may not take a room a Deal Room meeting holds. */
export function meetingInRoom(dr: DealRoomState, eventStart: string, roomId: string, day: number, start: string, end: string): DrMeeting | undefined {
  const date = addDays(`${eventStart} 00:00`, day - 1).slice(0, 10);
  return dr.meetings.find((m) => m.roomId === roomId && m.start.slice(0, 10) === date && ACTIVE.includes(m.status) && toMin(m.start.slice(11)) < toMin(end) && toMin(m.end.slice(11)) > toMin(start));
}

export function slotProblems(
  state: { dealRoom: DealRoomState; events: { id: string; startDate: string; endDate: string }[]; rooms: { id: string; name: string; zoneId: string }[]; delegates: { id: string; sessions: string[] }[]; sessions: { id: string; day: number; start: string; end: string; title: string; eventId: string }[] },
  req: SlotRequest,
): { clashes: string[]; caps: string[]; end: string } {
  const dr = state.dealRoom;
  const match = dr.matches.find((m) => m.id === req.matchId);
  const clashes: string[] = [];
  const caps: string[] = [];
  if (!match) return { clashes: ["No such match"], caps, end: req.start };
  const cfg = dr.configs[match.eventId];
  const event = state.events.find((e) => e.id === match.eventId)!;
  const len = req.flagged ? cfg.rules.flaggedMin : cfg.rules.meetingMin;
  const end = addMinutes(req.start, len);
  const buf = cfg.rules.bufferMin;
  const now = dr.clock;
  if (!bothAccepted(match)) clashes.push("Both parties must accept the introduction first");
  const day = req.start.slice(0, 10);
  if (day < event.startDate || day > event.endDate) clashes.push("Outside summit week");
  if (req.start <= now) clashes.push("The slot has passed");
  const t0 = req.start.slice(11, 16);
  const t1 = end.slice(11, 16);
  if (t0 < cfg.rules.dayStart || t1 > cfg.rules.dayEnd) clashes.push(`Outside Deal Room hours, ${cfg.rules.dayStart} to ${cfg.rules.dayEnd}`);
  if (!req.link) {
    const room = state.rooms.find((r) => r.id === req.roomId);
    const rc = req.roomId ? cfg.rooms[req.roomId] : undefined;
    if (!room || !rc) clashes.push("Choose a Deal Room room or an online link");
    else {
      if (t0 < rc.from || t1 > rc.to) clashes.push(`${room.name} is open ${rc.from} to ${rc.to}`);
      if (!req.table || req.table < 1 || req.table > rc.tables) clashes.push(`${room.name} has ${rc.tables} table${rc.tables > 1 ? "s" : ""}`);
      const other = dr.meetings.find((m) => m.id !== req.ignore && m.roomId === req.roomId && m.table === req.table && occupies(m, cfg, now) && crosses(m.start, m.end, req.start, end, buf));
      if (other) clashes.push(`${room.name}${rc.tables > 1 ? `, table ${req.table}` : ""} is booked ${other.start.slice(11)} to ${other.end.slice(11)}`);
    }
  }
  const mine = (appId: string) =>
    dr.meetings.filter((m) => {
      if (m.id === req.ignore || !occupies(m, cfg, now)) return false;
      const mm = dr.matches.find((x) => x.id === m.matchId);
      return mm && (mm.seekerId === appId || mm.providerId === appId);
    });
  for (const [side, appId] of [["seeker", match.seekerId], ["provider", match.providerId]] as const) {
    const app = dr.apps.find((a) => a.id === appId)!;
    const theirs = mine(appId);
    const hit = theirs.find((m) => crosses(m.start, m.end, req.start, end, buf));
    if (hit) clashes.push(`${app.org.name} has a meeting ${hit.start.slice(11)} to ${hit.end.slice(11)}`);
    const d = state.delegates.find((x) => x.id === app.delegateId);
    const n = eventDay(event.startDate, req.start);
    const sess = d ? state.sessions.find((s) => d.sessions.includes(s.id) && s.eventId === event.id && s.day === n && s.start < t1 && t0 < s.end) : undefined;
    if (sess) clashes.push(`${app.org.name} is enrolled in "${sess.title}" ${sess.start} to ${sess.end}`);
    if (side === "seeker" && theirs.length >= cfg.rules.seekerCap) caps.push(`${app.org.name} has reached its cap of ${cfg.rules.seekerCap} meetings`);
    if (side === "provider") {
      const perDay = app.caps?.perDay ?? cfg.rules.providerCapDay;
      const perEvent = app.caps?.perEvent ?? perDay * 4;
      if (theirs.filter((m) => m.start.slice(0, 10) === day).length >= perDay) caps.push(`${app.org.name} has reached its cap of ${perDay} meetings that day`);
      if (theirs.length >= perEvent) caps.push(`${app.org.name} has reached its cap of ${perEvent} meetings in all`);
    }
  }
  return { clashes, caps, end };
}

/** The slot grid for a day: every start time from the day's opening, a meeting plus a buffer apart. */
export function slotTimes(cfg: DrConfig) {
  const out: string[] = [];
  const step = cfg.rules.meetingMin + cfg.rules.bufferMin;
  for (let t = toMin(cfg.rules.dayStart); t + cfg.rules.meetingMin <= toMin(cfg.rules.dayEnd); t += step) out.push(fromMin(t));
  return out;
}

/** Ready to schedule: both accepted, and no meeting holding or having held a slot. */
export function readyToSchedule(dr: DealRoomState, cfg: DrConfig) {
  return dr.matches.filter((m) => m.eventId === cfg.eventId && bothAccepted(m) && !dr.meetings.some((x) => x.matchId === m.id && (occupies(x, cfg, dr.clock) || x.status === "Held")));
}

/** Live-board flags derived from arrivals and the clock (Flow 4 steps 3 and 4). */
export function boardFlag(m: DrMeeting, cfg: DrConfig, now: string) {
  if (m.status === "In progress" && now >= m.end) return { kind: "outcome" as const, missing: [] as ("seeker" | "provider")[] };
  if (m.status !== "Confirmed") return undefined;
  const missing = (["seeker", "provider"] as const).filter((s) => !m.arrivals[s]);
  if (!missing.length) return undefined;
  if (now > addMinutes(m.start, cfg.rules.lateMin)) return { kind: "no-show" as const, missing };
  if (now >= addMinutes(m.start, -10)) return { kind: "late" as const, missing };
  return undefined;
}

/** An .ics invite for a confirmed meeting. */
export function ics(m: DrMeeting, title: string, where: string) {
  // RFC 5545: local times carry the zone, the stamp is UTC (Nairobi is UTC+3), and commas in text are escaped
  const f = (s: string) => `${s.slice(0, 10).replace(/-/g, "")}T${s.slice(11, 16).replace(":", "")}00`;
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ExcursiaConnect//Deal Room//EN", "BEGIN:VEVENT", `UID:${m.id}@excursiaconnect`, `DTSTAMP:${f(addMinutes(m.proposedAt, -180))}Z`, `DTSTART;TZID=Africa/Nairobi:${f(m.start)}`, `DTEND;TZID=Africa/Nairobi:${f(m.end)}`, `SUMMARY:${esc(title)}`, `LOCATION:${esc(where)}`, "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:Deal Room meeting in 30 minutes", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

/* ---------- conversion (Cut 3) ---------- */

export const OPEN_STAGES: OppStage[] = ["Follow-up", "Diligence", "Negotiation"];
export const CLOSE_REASONS: CloseReason[] = ["No fit", "Timing", "Terms", "Diligence failed", "Other"];
/** What each stage needs before an opportunity may enter it (PRD Conversion, stages table). */
export const STAGE_EVIDENCE: Record<OppStage, string> = {
  "Follow-up": "The meeting outcome",
  Diligence: "A note or the provider's data request",
  Negotiation: "A term sheet or written proposal",
  "Closed – won": "A signed commitment, recorded as an outcome",
  "Closed – lost": "A close reason and a note",
};
export const OUTCOME_NEEDS: Record<OutcomeKind, string> = {
  Interest: "Date and how it was expressed",
  Promise: "Date and what was said or written; an amount if one was named",
  Commitment: "Amount, currency, instrument, date and the signed document",
  "Funds received": "Amount, currency, date and the disbursement evidence",
};

export const oppOpen = (o: DrOpportunity) => !o.closed && o.stage !== "Closed – won";
export const oppOverdue = (o: DrOpportunity, now: string) => oppOpen(o) && o.due < now.slice(0, 10);

/** The last thing that moved the opportunity: a stage, an outcome, an update or a new next action. Reviews and requests do not count. */
export function lastActivity(o: DrOpportunity) {
  const moves = o.history.filter((h) => !/^(Reviewed|Status update requested)/.test(h.what)).map((h) => h.at);
  return [...moves, ...o.updates.map((u) => u.at), ...o.outcomes.map((x) => x.at)].sort().pop() ?? o.stageDates["Follow-up"] ?? "";
}
/** Stalled: open with nothing moving for 30 days, the cue for the lead to reassign (DL-10). */
export const STALL_DAYS = 30;
export const oppStalled = (o: DrOpportunity, now: string) => oppOpen(o) && !!lastActivity(o) && daysBetween(lastActivity(o).slice(0, 10), now) > STALL_DAYS;
export const evidenceDate = (o: DrOpportunity) => [...o.outcomes.map((x) => x.date), ...o.updates.filter((u) => u.doc).map((u) => u.at.slice(0, 10))].sort().pop();
export const reviewedThisMonth = (o: DrOpportunity, now: string) => o.reviews.some((r) => r.month === now.slice(0, 7));

export function oppParties(dr: DealRoomState, o: DrOpportunity) {
  const match = dr.matches.find((m) => m.id === o.matchId);
  return { match, seeker: dr.apps.find((a) => a.id === match?.seekerId), provider: dr.apps.find((a) => a.id === match?.providerId) };
}

/** Value at the stage it is evidenced, per currency, so the four figures can never be added together (PRD Conversion req. 4). */
export function conversionValues(dr: DealRoomState, opps: DrOpportunity[]) {
  const t: Record<string, { sought: number; promised: number; committed: number; received: number }> = {};
  const add = (cur: string, k: "sought" | "promised" | "committed" | "received", n = 0) => {
    t[cur] ??= { sought: 0, promised: 0, committed: 0, received: 0 };
    t[cur][k] += n;
  };
  for (const o of opps) {
    const { seeker } = oppParties(dr, o);
    if (seeker?.ask && !o.closed) add(seeker.ask.currency, "sought", seeker.ask.amount);
    for (const x of o.outcomes) {
      const k = x.kind === "Promise" ? "promised" : x.kind === "Commitment" ? "committed" : x.kind === "Funds received" ? "received" : undefined;
      if (k && x.amount) add(x.currency ?? seeker?.ask?.currency ?? "USD", k, x.amount);
    }
  }
  return t;
}

/** Documents are deleted this long after the conversion end date unless the lead extends it (PRD Confidentiality req. 8). */
export function deletionDate(cfg: DrConfig) {
  const d = new Date(cfg.rules.conversionEnd + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + cfg.rules.retentionMonths);
  return d.toISOString().slice(0, 10);
}
