/**
 * Reviewing an application (backend-plan.md, M1.3): the reviewer's view of one application, and the first half of
 * review's use cases — start, score against the rubric with evidence, request information, and the lead's call on
 * a request that expired unanswered. The applicant's answer is in apply.ts.
 */
import { z } from "zod";
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
  }),
  /** the time the rules take as now, so due dates read the same on the screen as on the server */
  now: z.string(),
  me: StaffMember,
  staff: z.array(StaffMember),
  can: z.object({ review: z.boolean(), assign: z.boolean(), decideExpiry: z.boolean() }),
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
