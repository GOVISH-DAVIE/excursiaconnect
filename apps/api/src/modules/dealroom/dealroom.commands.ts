/**
 * `runCommand`: the one way the Deal Room changes data, for staff and applicants alike (backend-plan.md, "How a
 * write runs on the server"; docs/architecture.md, step 4 of the worked example).
 *
 *   the event's lock → load its aggregate → ownership: every record named is in this event
 *     → the actions, built from the state as it is now under the lock → apply(state, action, ctx) for each, in turn,
 *       with the prototype's own rules → any refused? 409 with the rule's reason, nothing written
 *     → save only the rows that changed → audit each changed record → commit
 *
 * Who the actor is, and that they may act at all, is the caller's to settle first (the team check for staff, the
 * owning email for an applicant). Action objects exist only on the server; clients send use-case inputs.
 */
import { randomUUID } from "node:crypto";
import { apply, type Action } from "@excursia/domain/core/reducer";
import { nairobiNow, type Actor, type Ctx } from "@excursia/domain/ctx";
import type { AppState } from "@excursia/domain/types";
import { HttpError } from "../../http/errors";
import { coreFromRows, coreToRows } from "../events/events.mapper";
import { dealRoomFromRows, dealRoomToRows, type DealRoomRows } from "./dealroom.mapper";
import type { AuditRow, Changes, DealRoomRepo, EventStored, StaffLink } from "./dealroom.repo";

/** What the Deal Room's rules read beyond the Deal Room: the event's own core records. Rooms, zones and the
 *  programme join when the rules that read them move onto the server (M3.2, Phase 2). */
const EMPTY_CORE = {
  formFields: [], exceptions: [], campaigns: [], payoutsPaid: [], banners: {}, floorPlans: {}, galleries: {}, speakerProfiles: [], sponsors: [],
  team: [], shifts: [], grants: {}, zones: [], rooms: [], sessions: [], orders: [], messages: [],
  expo: { clock: "", actingMemberId: "", configs: {} },
};

export function stateOf(eventId: string, stored: EventStored, now: string): AppState {
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

/** The action as the audit log keeps it: small, and never a whole application or file. */
function auditDetail(action: Action) {
  const text = JSON.stringify(action);
  return text.length <= 4000 ? (JSON.parse(text) as object) : { type: action.type, truncated: true };
}

export type Command = {
  eventId: string;
  actor: Actor;
  /** the signed-in user, for the audit log */
  userId: string;
  ip: string | null;
  /** Throws (404, 403) unless every record the input names is this actor's to touch, in this event. */
  owned?: (state: AppState) => void;
  /** The rule actions to run, in order, built from the state as it is under the lock. */
  actions: (state: AppState, ctx: Ctx) => Action[];
  /** Staff the command added, to give sign-ins to in the same transaction (Algotech provisioning, DA-2). */
  accounts?: (after: AppState) => StaffLink[];
};

export type CommandDeps = { repo: DealRoomRepo; now: () => Date; newId?: (prefix: string) => string };

export function createCommands({ repo, now, newId = (p) => `${p}_${randomUUID().replace(/-/g, "").slice(0, 12)}` }: CommandDeps) {
  return {
    newId,
    /** Runs a command; returns the state after it, as committed. */
    run(cmd: Command): Promise<AppState> {
      return repo.inEventLock(cmd.eventId, async ({ stored, save, audit, linkStaff }) => {
        if (!stored) throw new HttpError("not_found", "This event has no Deal Room.");
        const at = nairobiNow(now());
        const ctx: Ctx = { now: at, newId, actor: cmd.actor };
        const before = stateOf(cmd.eventId, stored, at);
        cmd.owned?.(before);
        let state = before;
        const actions = cmd.actions(before, ctx);
        for (const action of actions) {
          const r = apply(state, action, ctx);
          if (r.refusal) throw new HttpError("conflict", r.refusal);
          state = r.state;
        }
        const changes = changesBetween(cmd.eventId, before, state, at);
        await save(changes);
        if (cmd.accounts) {
          const refused = await linkStaff(cmd.accounts(state));
          if (refused.length) throw new HttpError("conflict", `${refused.join(", ")} is used to apply to a Deal Room, so it can't be a staff account too. Use a work email.`);
        }
        const rows: AuditRow[] = Object.entries(ENTITY).flatMap(([k, entity]) =>
          (changes.dealRoom[k as keyof typeof ENTITY] as { upsert: { id: string }[] }).upsert.map((r) => ({
            actorKind: cmd.actor.kind,
            actorId: cmd.userId,
            eventId: cmd.eventId,
            entity: entity!,
            entityId: r.id,
            action: actions.map((a) => a.type).join(" + "),
            detail: actions.length === 1 ? auditDetail(actions[0]) : { actions: actions.map(auditDetail) },
            ip: cmd.ip,
          })),
        );
        await audit(rows);
        return state;
      });
    },
  };
}
export type Commands = ReturnType<typeof createCommands>;
