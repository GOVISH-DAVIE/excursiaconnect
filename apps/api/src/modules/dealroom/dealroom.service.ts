/**
 * The Deal Room's use cases, and `runCommand`, the one way any of them changes data (backend-plan.md, "How a write
 * runs on the server"; docs/architecture.md, step 4 of the worked example):
 *
 *   session → actor (deny by default: only this event's Deal Room team)
 *     → the event's lock → load its aggregate → ownership: every record named is in this event
 *     → apply(state, action, ctx), the same rule the prototype runs → refused? 409 with the rule's reason, nothing written
 *     → save only the rows that changed → audit each changed record → commit
 *
 * Action objects exist only here; the client sends use-case inputs (AssignReviewerInput), never actions.
 */
import { randomUUID } from "node:crypto";
import type { ApplicationSummary, AssignReviewerInput, StaffMember, TeamView } from "@excursia/contracts/dealroom";
import { apply, type Action } from "@excursia/domain/core/reducer";
import { nairobiNow, type Actor, type Ctx } from "@excursia/domain/ctx";
import { drCan } from "@excursia/domain/dealroom/logic";
import type { DrApplication, DrStaff } from "@excursia/domain/dealroom/types";
import type { AppState } from "@excursia/domain/types";
import { HttpError } from "../../http/errors";
import type { Resolved } from "../auth/auth.service";
import { coreFromRows, coreToRows } from "../events/events.mapper";
import { dealRoomFromRows, dealRoomToRows, type DealRoomRows } from "./dealroom.mapper";
import type { AuditRow, Changes, DealRoomRepo, EventStored } from "./dealroom.repo";

/** What the Deal Room's rules read beyond the Deal Room: the event's own core records. Rooms, zones and the
 *  programme join when the rules that read them move onto the server (M3.2, Phase 2). */
const EMPTY_CORE = {
  formFields: [], exceptions: [], campaigns: [], payoutsPaid: [], banners: {}, floorPlans: {}, galleries: {}, speakerProfiles: [], sponsors: [],
  team: [], shifts: [], grants: {}, zones: [], rooms: [], sessions: [], orders: [], messages: [],
  expo: { clock: "", actingMemberId: "", configs: {} },
};

function stateOf(eventId: string, stored: EventStored, now: string): AppState {
  const core = coreFromRows(stored.core);
  return { ...EMPTY_CORE, ...core, dealRoom: dealRoomFromRows(eventId, stored.dealRoom, now) } as unknown as AppState;
}

/** Rows that differ between before and after, by key; and keys that are gone. */
function diff<T>(before: T[], after: T[], key: (r: T) => string) {
  const was = new Map(before.map((r) => [key(r), JSON.stringify(r)]));
  const now = new Set(after.map(key));
  return { upsert: after.filter((r) => was.get(key(r)) !== JSON.stringify(r)), remove: [...was.keys()].filter((k) => !now.has(k)) };
}

const ENTITY: Partial<Record<keyof DealRoomRows, string>> = {
  staff: "dr_staff",
  apps: "dr_application",
  matches: "dr_match",
  meetings: "dr_meeting",
  sessions: "dr_session",
  opportunities: "dr_opportunity",
  exceptions: "dr_exception",
  incidents: "dr_incident",
};

function changesBetween(eventId: string, before: AppState, after: AppState, now: string): Changes {
  const b = dealRoomToRows(before.dealRoom, eventId, now);
  const a = dealRoomToRows(after.dealRoom, eventId, now);
  const id = (r: { id: string }) => r.id;
  const bc = coreToRows({ organisers: [], events: [], tiers: [], delegates: before.delegates }, { demo: false });
  const ac = coreToRows({ organisers: [], events: [], tiers: [], delegates: after.delegates }, { demo: false });
  return {
    dealRoom: {
      config: JSON.stringify(b.config) === JSON.stringify(a.config) ? null : a.config,
      staff: diff(b.staff, a.staff, id),
      apps: diff(b.apps, a.apps, id),
      matches: diff(b.matches, a.matches, id),
      meetings: diff(b.meetings, a.meetings, id),
      sessions: diff(b.sessions, a.sessions, id),
      opportunities: diff(b.opportunities, a.opportunities, id),
      exceptions: diff(b.exceptions, a.exceptions, id),
      incidents: diff(b.incidents, a.incidents, id),
      consents: diff(b.consents, a.consents, id),
      access: diff(b.access, a.access, id),
      outbox: diff(b.outbox, a.outbox, id),
      counters: diff(b.counters, a.counters, (c) => c.kind),
      busy: diff(b.busy, a.busy, id),
    },
    core: {
      delegates: { upsert: diff(bc.delegates, ac.delegates, id).upsert },
      badges: { upsert: diff(bc.badges, ac.badges, (x) => x.code).upsert },
    },
  };
}

/** The action as the audit log keeps it: small, and never a whole uploaded file. */
function auditDetail(action: Action) {
  const text = JSON.stringify(action);
  return text.length <= 4000 ? (JSON.parse(text) as object) : { type: action.type, truncated: true };
}

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

export type DealRoomDeps = { repo: DealRoomRepo; now?: () => Date; newId?: (prefix: string) => string };

export function createDealRoomService({ repo, now = () => new Date(), newId = (p) => `${p}_${randomUUID().replace(/-/g, "").slice(0, 12)}` }: DealRoomDeps) {
  /** Deny by default: the signed-in person must be on this event's Deal Room team. */
  async function staffActor(session: Resolved, eventId: string): Promise<{ actor: Actor; staff: DrStaff }> {
    const row = await repo.staffForUser(session.user.id, eventId);
    if (!row) throw new HttpError("forbidden", "You're not on this event's Deal Room team.");
    return { actor: { kind: "staff", id: row.id }, staff: row.record as unknown as DrStaff };
  }

  /**
   * The write path. `owned` checks every record the action names is in this event's aggregate (a record of another
   * event simply isn't there); the rule itself then decides whether this actor may do it.
   */
  async function runCommand(session: Resolved, eventId: string, action: Action, owned: (state: AppState) => void, ip: string | null) {
    const { actor } = await staffActor(session, eventId);
    return repo.inEventLock(eventId, async ({ stored, save, audit }) => {
      if (!stored) throw new HttpError("not_found", "This event has no Deal Room.");
      const at = nairobiNow(now());
      const ctx: Ctx = { now: at, newId, actor };
      const before = stateOf(eventId, stored, at);
      owned(before);
      const { state: after, refusal } = apply(before, action, ctx);
      if (refusal) throw new HttpError("conflict", refusal);
      const changes = changesBetween(eventId, before, after, at);
      await save(changes);
      const detail = auditDetail(action);
      const rows: AuditRow[] = Object.entries(ENTITY).flatMap(([k, entity]) =>
        (changes.dealRoom[k as keyof typeof ENTITY] as { upsert: { id: string }[] }).upsert.map((r) => ({
          actorKind: actor.kind,
          actorId: session.user.id,
          eventId,
          entity: entity!,
          entityId: r.id,
          action: action.type,
          detail,
          ip,
        })),
      );
      await audit(rows);
      return after;
    });
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
      await runCommand(
        session,
        eventId,
        { type: "dr/assign", appIds: ids, staffId: input.staffId },
        (state) => {
          const here = new Set(state.dealRoom.apps.map((a) => a.id));
          const missing = ids.filter((id) => !here.has(id));
          if (missing.length) throw new HttpError("not_found", `Not an application in this Deal Room: ${missing.join(", ")}`);
        },
        ip,
      );
      return (await repo.listApplications(eventId, { ids })).map(toSummary);
    },
  };
}
export type DealRoomService = ReturnType<typeof createDealRoomService>;
