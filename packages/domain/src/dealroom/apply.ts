/**
 * Applying to the Deal Room, as rules both sides share (backend-plan.md, M1.1).
 *
 * An applicant never sends a whole application: they send the fields they changed, by dotted path ("org.name"),
 * and the draft on record is patched with only the paths an applicant may write for that kind of application.
 * Everything else (status, reference, fee, decisions, reviewer, documents, the contact email that proves who owns
 * it) can't be set this way, so a crafted request can't award itself anything. Two devices editing different
 * fields both keep their edits; the same field twice, the later one wins.
 */
import { CHALLENGE_KINDS } from "./logic";
import type { DrApplication, DrChallenge } from "./types";

export type ApplyMode = "seeker" | "provider" | "challenge";

const COMMON = [
  "mission", "track", "source",
  "contact.name", "contact.phone",
  "decisionMaker.name", "decisionMaker.title", "decisionMaker.email", "decisionMaker.phone",
  "org.name", "org.regNo", "org.country", "org.sector", "org.founded", "org.website",
] as const;
const SEEKER = ["ownerKind", "ask.amount", "ask.currency", "ask.instrument", "ask.useOfFunds", "ask.stage", "traction.revenueBand", "traction.customers", "traction.metrics"] as const;
const PROVIDER = [
  "providerKind",
  "mandate.sectors", "mandate.countries", "mandate.stages", "mandate.ticketMin", "mandate.ticketMax", "mandate.currency", "mandate.instruments", "mandate.exclusions", "mandate.timeline",
] as const;
const CHALLENGE = (["title", "problem", "users", "constraints", "outcome", "budget", "route", "timeline", "decisionProcess"] as const).map((k) => `challenge.${k}` as const);

/** Every path an applicant may ever write; which apply to one application depends on its kind. */
export const DRAFT_PATHS = [...COMMON, ...SEEKER, ...PROVIDER, ...CHALLENGE] as const;
export type DraftPath = (typeof DRAFT_PATHS)[number];

export const modeOf = (app: Pick<DrApplication, "type" | "challenge">): ApplyMode => (app.type === "seeker" ? "seeker" : app.challenge ? "challenge" : "provider");

/** The paths this application's kind may write. */
export function writablePaths(app: Pick<DrApplication, "type" | "challenge">): ReadonlySet<string> {
  const mode = modeOf(app);
  return new Set<string>([...COMMON, ...(mode === "seeker" ? SEEKER : PROVIDER), ...(mode === "challenge" ? CHALLENGE : [])]);
}

/**
 * The draft with the changes applied. Paths this application can't write are left out and named in `refused`,
 * so the caller can say so; nothing else about the record changes.
 */
export function patchDraft(app: DrApplication, changes: Partial<Record<DraftPath, unknown>>): { app: DrApplication; refused: string[] } {
  const allowed = writablePaths(app);
  const refused: string[] = [];
  let next: DrApplication = app;
  for (const [path, value] of Object.entries(changes)) {
    if (!allowed.has(path)) {
      refused.push(path);
      continue;
    }
    // a challenge comes from a public institution or a corporate buyer, nobody else
    if (path === "providerKind" && app.challenge && !CHALLENGE_KINDS.includes(value as never)) {
      refused.push(path);
      continue;
    }
    const [group, field] = path.split(".");
    if (!field) {
      next = { ...next, [group]: value };
      continue;
    }
    const current = (next as unknown as Record<string, Record<string, unknown> | undefined>)[group] ?? {};
    next = { ...next, [group]: { ...current, [field]: value } };
  }
  return { app: next, refused };
}

const BLANK_CHALLENGE: DrChallenge = { title: "", problem: "", users: "", constraints: "", outcome: "", budget: "", route: "", timeline: "", decisionProcess: "" };

/** A new, empty application of one kind, owned by the email that started it. */
export function blankApplication(opts: { id: string; eventId: string; mode: ApplyMode; email: string; name?: string; phone?: string; now: string }): DrApplication {
  const { id, eventId, mode, email, now } = opts;
  const type = mode === "seeker" ? "seeker" : "provider";
  return {
    id,
    eventId,
    type,
    mission: "",
    source: "",
    owner: "st_lead",
    org: { name: "", regNo: "", country: "", sector: "" },
    contact: { name: opts.name ?? "", email, phone: opts.phone ?? "" },
    decisionMaker: { name: "", title: "", email: "", phone: "" },
    ask: type === "seeker" ? { amount: 0, currency: "USD", instrument: "Equity", useOfFunds: "", stage: "Growth" } : undefined,
    traction: type === "seeker" ? { revenueBand: "", customers: "", metrics: "" } : undefined,
    mandate:
      type === "provider"
        ? {
            sectors: [],
            countries: [],
            stages: [],
            ticketMin: 0,
            ticketMax: 0,
            currency: "USD",
            instruments: mode === "challenge" ? ["Procurement and contracts", "Pilots and deployment"] : [],
            exclusions: [],
            timeline: "",
          }
        : undefined,
    challenge: mode === "challenge" ? { ...BLANK_CHALLENGE } : undefined,
    documents: [],
    status: "Draft",
    statusAt: now,
    decisions: [],
    recommendations: [],
    assessments: [],
    readiness: "Not ready",
    rfis: [],
    history: [{ at: now, by: "applicant", what: "Started an application" }],
  };
}
