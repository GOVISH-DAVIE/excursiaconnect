/**
 * The Deal Room's wire shapes, shared by the web app and the API (docs/architecture.md, the worked example). The
 * first ones: the review queue, the team, and assigning a reviewer (backend-plan.md, M0.5).
 */
import { z } from "zod";

export const EventParams = z.object({ eventId: z.string().regex(/^ev_[a-z0-9_]+$/, "an event id") });

export const AppStatus = z.enum(["Lead", "Invited", "Draft", "Submitted", "In review", "Information requested", "Decided"]);

export const ApplicationsQuery = z.object({
  status: AppStatus.optional(),
  /** "me", "none", or a staff id */
  assignee: z.string().max(60).optional(),
});

export const ApplicationSummary = z.object({
  id: z.string(),
  ref: z.string().nullable(),
  type: z.enum(["seeker", "provider"]),
  org: z.string(),
  country: z.string().nullable(),
  status: AppStatus,
  assigneeId: z.string().nullable(),
  mission: z.string().nullable(),
  decision: z.string().nullable(),
  readiness: z.string().nullable(),
  /** bumped on every save */
  version: z.number().int(),
  updatedAt: z.string(),
});
export type ApplicationSummary = z.infer<typeof ApplicationSummary>;

export const StaffMember = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["Lead", "Reviewer", "Operations", "Coordinator", "Oversight"]),
  canDecide: z.boolean(),
  /** whether applications may be assigned to them */
  canReview: z.boolean(),
});
export type StaffMember = z.infer<typeof StaffMember>;

/** The signed-in person on this event's team, and what their role lets the screens offer. */
export const TeamView = z.object({ event: z.object({ id: z.string(), name: z.string() }), me: StaffMember, canAssign: z.boolean(), staff: z.array(StaffMember) });
export type TeamView = z.infer<typeof TeamView>;

export const AssignReviewerInput = z.object({
  appIds: z.array(z.string().min(1).max(60)).min(1, "choose at least one application").max(200),
  staffId: z.string().min(1).max(60),
});
export type AssignReviewerInput = z.infer<typeof AssignReviewerInput>;
