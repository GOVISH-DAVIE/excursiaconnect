/**
 * The Deal Room team's use cases. Deny by default: the signed-in person must be on this event's Deal Room team; the
 * rules then check their role. Every change goes through runCommand (dealroom.commands.ts).
 */
import type { ApplicationSummary, AssignReviewerInput, StaffMember, TeamView } from "@excursia/contracts/dealroom";
import type { Actor } from "@excursia/domain/ctx";
import { drCan } from "@excursia/domain/dealroom/logic";
import type { DrApplication, DrStaff } from "@excursia/domain/dealroom/types";
import { HttpError } from "../../http/errors";
import type { Resolved } from "../auth/auth.service";
import type { Commands } from "./dealroom.commands";
import type { DealRoomRepo } from "./dealroom.repo";

const toStaff = (s: DrStaff): StaffMember => ({ id: s.id, name: s.name, role: s.role, canDecide: s.canDecide, canReview: s.active && s.role !== "Operations" });

type AppRow = Awaited<ReturnType<DealRoomRepo["listApplications"]>>[number];
const toSummary = (r: AppRow): ApplicationSummary => {
  const app = r.record as unknown as DrApplication;
  return {
    id: r.id,
    ref: r.ref,
    type: r.type as ApplicationSummary["type"],
    org: app.org?.name ?? "(no name yet)",
    country: app.org?.country || null,
    status: r.status as ApplicationSummary["status"],
    assigneeId: r.assigneeId,
    mission: r.mission,
    decision: r.decision,
    readiness: r.readiness,
    version: r.version,
    updatedAt: r.updatedAt.toISOString(),
  };
};

export type DealRoomDeps = { repo: DealRoomRepo; commands: Commands };

export function createDealRoomService({ repo, commands }: DealRoomDeps) {
  /** Deny by default: the signed-in person must be on this event's Deal Room team. */
  async function staffActor(session: Resolved, eventId: string): Promise<{ actor: Actor; staff: DrStaff }> {
    const row = await repo.staffForUser(session.user.id, eventId);
    if (!row) throw new HttpError("forbidden", "You're not on this event's Deal Room team.");
    return { actor: { kind: "staff", id: row.id }, staff: row.record as unknown as DrStaff };
  }

  return {
    async team(session: Resolved, eventId: string): Promise<TeamView> {
      const { staff } = await staffActor(session, eventId);
      const [all, name] = await Promise.all([repo.listStaff(eventId), repo.eventName(eventId)]);
      return { event: { id: eventId, name }, me: toStaff(staff), canAssign: drCan(staff, "assign"), staff: all.map((s) => toStaff(s.record as unknown as DrStaff)) };
    },

    async applications(session: Resolved, eventId: string, query: { status?: string; assignee?: string }): Promise<ApplicationSummary[]> {
      const { staff } = await staffActor(session, eventId);
      const assigneeId = query.assignee === "me" ? staff.id : query.assignee === "none" ? null : query.assignee;
      return (await repo.listApplications(eventId, { status: query.status, assigneeId })).map(toSummary);
    },

    /** The worked example (docs/architecture.md): assign applications to a reviewer. */
    async assignReviewer(session: Resolved, eventId: string, input: AssignReviewerInput, ip: string | null): Promise<ApplicationSummary[]> {
      const ids = [...new Set(input.appIds)];
      const { actor } = await staffActor(session, eventId);
      await commands.run({
        eventId,
        actor,
        userId: session.user.id,
        ip,
        owned: (state) => {
          const here = new Set(state.dealRoom.apps.map((a) => a.id));
          const missing = ids.filter((id) => !here.has(id));
          if (missing.length) throw new HttpError("not_found", `Not an application in this Deal Room: ${missing.join(", ")}`);
        },
        actions: () => [{ type: "dr/assign", appIds: ids, staffId: input.staffId }],
      });
      return (await repo.listApplications(eventId, { ids })).map(toSummary);
    },
  };
}
export type DealRoomService = ReturnType<typeof createDealRoomService>;
