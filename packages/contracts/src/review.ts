/**
 * Reviewing an application (backend-plan.md, M1.3 and M1.6): the reviewer's view of one application, and review's
 * use cases — start, score against the rubric with evidence, request information, the lead's call on a request
 * that expired unanswered; then recommendations, decisions and the second decider, conditions, readiness, and a
 * provider's verification (KYC checked, sanctions screening, the decision-maker, verify or decline). The applicant's
 * side is in apply.ts.
 */
import { z } from "zod";
import { StaffBadge } from "./badge";
import { KycItem } from "./apply";
import { StaffMember } from "./dealroom";

export const AppIdParams = z.object({ eventId: z.string().regex(/^ev_[a-z0-9_]+$/), appId: z.string().regex(/^dr_[a-z0-9_]{2,60}$/) });
export const DocParams = AppIdParams.extend({ docId: z.string().regex(/^[a-z0-9_]{2,60}$/) });

/** The rules' application record, as reviewers see it in full (the staff screens read it with the domain's types). */
export const ReviewApplication = z.looseObject({ id: z.string(), eventId: z.string(), type: z.enum(["seeker", "provider"]), status: z.string() });

const Criterion = z.object({ id: z.string(), text: z.string() });

export const ReviewView = z.object({
  application: ReviewApplication,
  /** the rubric and the request window, from the event's Deal Room config */
  config: z.object({
    rubric: z.object({ eligibility: z.array(Criterion), assessment: z.array(Criterion.extend({ weight: z.number() })), readiness: z.array(Criterion) }),
    rfiDays: z.number(),
    missions: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
    tracks: z.array(z.object({ id: z.string(), code: z.string(), name: z.string(), missionId: z.string() })),
    /** when a decision needs a second, different decider: every decline, and asks above this many USD */
    secondReview: z.object({ decline: z.boolean(), askAbove: z.number() }),
  }),
  /** the time the rules take as now, so due dates read the same on the screen as on the server */
  now: z.string(),
  me: StaffMember,
  staff: z.array(StaffMember),
  /** the participant's badge, once issued (M2.1) */
  badge: StaffBadge.nullable(),
  can: z.object({ review: z.boolean(), assign: z.boolean(), decideExpiry: z.boolean(), decide: z.boolean(), readiness: z.boolean(), waiveFee: z.boolean(), badge: z.boolean() }),
});
export type ReviewView = z.infer<typeof ReviewView>;

export const ScoreInput = z.object({
  layer: z.enum(["eligibility", "assessment", "readiness"]),
  criterion: z.string().max(20),
  pass: z.boolean().optional(),
  score: z.number().int().min(0).max(100).optional(),
  docId: z.string().max(60).optional(),
  note: z.string().max(2000).optional(),
});
export type ScoreInput = z.infer<typeof ScoreInput>;

export const DOC_KINDS = ["Pitch deck", "Financial statements", "Registration certificate", "Feasibility study", "E&S study", "Beneficial owners", "Signatory ID", "Other"] as const;

export const RequestInfoInput = z.object({
  questions: z.array(z.string().trim().min(1).max(1000)).min(1, "ask at least one question").max(10),
  docs: z.array(z.enum(DOC_KINDS)).max(8),
});
export type RequestInfoInput = z.infer<typeof RequestInfoInput>;

export const RfiExpiryInput = z.object({ how: z.enum(["Extended", "Referred", "Declined", "Withdrawn"]), note: z.string().trim().min(1, "give a reason").max(1000) });
export type RfiExpiryInput = z.infer<typeof RfiExpiryInput>;

/** A short-lived link to open one document. */
export const DocumentLink = z.object({ url: z.string(), expiresAt: z.string() });
export type DocumentLink = z.infer<typeof DocumentLink>;

/* ---------- M1.6: decisions, readiness, verification ---------- */

export const DECISIONS = ["Qualified", "Conditional", "Referred", "Declined"] as const;
const Reason = z.string().trim().min(1, "give a reason").max(2000);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date, YYYY-MM-DD");

export const ConditionParams = AppIdParams.extend({ conditionId: z.string().regex(/^[a-z0-9_]{2,60}$/) });

/** A reviewer without the decide right recommends; a decider decides. */
export const RecommendInput = z.object({ decision: z.enum(DECISIONS), reason: Reason });
export type RecommendInput = z.infer<typeof RecommendInput>;

/** A decision, with its reason (shown to the applicant); a conditional one with what must be met, and by when. */
export const DecideInput = z.object({
  decision: z.enum(DECISIONS),
  reason: Reason,
  conditions: z.array(z.object({ text: z.string().trim().min(1, "say what must be met").max(500), due: Day })).max(10).default([]),
});
export type DecideInput = z.infer<typeof DecideInput>;

export const ReadinessInput = z.object({ readiness: z.enum(["Not ready", "In preparation", "Deal Room Ready"]) });
export type ReadinessInput = z.infer<typeof ReadinessInput>;

export const CheckKycInput = z.object({ item: KycItem });
export type CheckKycInput = z.infer<typeof CheckKycInput>;

/** The result of screening against the sanctions lists, entered by the reviewer who ran it. */
export const SanctionsInput = z.object({ result: z.enum(["Clear", "Match found"]), note: z.string().trim().max(1000).default("") });
export type SanctionsInput = z.infer<typeof SanctionsInput>;

export const VerifyInput = z.object({ outcome: z.enum(["Verified", "Declined"]), reason: Reason });
export type VerifyInput = z.infer<typeof VerifyInput>;

/** The lead waives an approved seeker's fee, a sponsored place say: always with a reason (M1.7). */
export const WaiveFeeInput = z.object({ reason: Reason });
export type WaiveFeeInput = z.infer<typeof WaiveFeeInput>;
