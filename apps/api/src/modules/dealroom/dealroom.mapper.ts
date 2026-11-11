/**
 * One event's Deal Room, between the rules' DealRoomState and rows (backend-plan.md, "Two storage styles").
 *
 * - The business records (applications, matches, meetings, sessions, opportunities, staff, exceptions, incidents)
 *   are stored whole in `record`, with summary columns worked out here by the rules' own selectors, so lists and
 *   dashboards can query them with SQL.
 * - Consents, access, the outbox and the counters are plain columns, with nothing left over.
 * - Busy slots are derived: every meeting that holds a room, a table or a person gets rows the database's
 *   exclusion constraints check. They are never read back; the meetings are the truth.
 * - What only the prototype has (the demo clock, the acting staff member, the scripted day, the offline queue)
 *   is not stored. The aggregate-wide extras with no table of their own (the live window, the archive date,
 *   support grants, the admin log) ride with the config.
 *
 * Reading back returns the same DealRoomState, apart from the order of arrays (rows come back by id) and the
 * prototype-only fields (tests/mappers.test.ts).
 */
import type { Prisma } from "@excursia/db";
import { confirmBy, decisionOf, occupies, pipelineOf, ACTIVE } from "@excursia/domain/dealroom/logic";
import type {
  DealRoomState,
  DrAccess,
  DrApplication,
  DrConfig,
  DrConsent,
  DrException,
  DrHistory,
  DrIncident,
  DrMatch,
  DrMeeting,
  DrMessage,
  DrOpportunity,
  DrSession,
  DrStaff,
  DrSupportGrant,
} from "@excursia/domain/dealroom/types";
import { addMinutes } from "@excursia/domain/time";
import { fromInstant, toInstant } from "../../persistence/time";
import { json } from "../events/events.mapper";

/** What dr_config.record holds: the config, and the aggregate's extras that have no table of their own. */
export type DrConfigRecord = {
  config: DrConfig;
  liveWindow?: DealRoomState["liveWindow"];
  archivedAt?: string;
  grants: DrSupportGrant[];
  adminLog: DrHistory[];
};

/** A slot a meeting holds. Written with SQL, since Prisma cannot write a tstzrange. */
export type BusyRow = {
  id: string;
  eventId: string;
  source: "meeting" | "session";
  sourceId: string;
  key: string;
  from: Date;
  to: Date;
  active: boolean;
  confirmBy: Date | null;
};

export type DealRoomRows = {
  config: Prisma.DrConfigCreateManyInput;
  staff: Prisma.DrStaffCreateManyInput[];
  apps: Prisma.DrApplicationCreateManyInput[];
  matches: Prisma.DrMatchCreateManyInput[];
  meetings: Prisma.DrMeetingCreateManyInput[];
  sessions: Prisma.DrSessionCreateManyInput[];
  opportunities: Prisma.DrOpportunityCreateManyInput[];
  exceptions: Prisma.DrExceptionCreateManyInput[];
  incidents: Prisma.DrIncidentCreateManyInput[];
  consents: Prisma.DrConsentCreateManyInput[];
  access: Prisma.DrAccessCreateManyInput[];
  outbox: Prisma.OutboxMessageCreateManyInput[];
  counters: Prisma.DrCounterCreateManyInput[];
  busy: BusyRow[];
};

const CHANNEL = { Email: "email", SMS: "sms", "Email and SMS": "email_and_sms" } as const;
const CHANNEL_BACK = { email: "Email", sms: "SMS", email_and_sms: "Email and SMS" } as const;
const OUTBOX_STATUS = { Queued: "queued", Delivered: "delivered", Sent: "sent", Failed: "failed" } as const;
// "sending" is the worker's own, while it holds the row; to the rules it is still waiting
const OUTBOX_STATUS_BACK = { queued: "Queued", sending: "Queued", delivered: "Delivered", sent: "Sent", failed: "Failed" } as const;

const feeState = (a: DrApplication) => (a.fee?.paid ? "paid" : a.fee?.waived ? "waived" : a.fee ? "owed" : null);

/**
 * One event's rows. `now` decides which proposals still hold their slot (a lapsed one does not), and the
 * pipeline's status: the demo clock for the demo seed, the server clock otherwise.
 */
export function dealRoomToRows(dr: DealRoomState, eventId: string, now: string): DealRoomRows {
  const config = dr.configs[eventId];
  if (!config) throw new Error(`No Deal Room config for ${eventId}`);
  const mine = <T extends { eventId: string }>(xs: T[]) => xs.filter((x) => x.eventId === eventId);

  const apps = mine(dr.apps);
  const appIds = new Set(apps.map((a) => a.id));
  const matches = mine(dr.matches);
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const meetings = mine(dr.meetings);
  const pair = (m: DrMeeting) => {
    const match = matchById.get(m.matchId);
    if (!match) throw new Error(`Meeting ${m.id} names match ${m.matchId}, which is not in ${eventId}`);
    return match;
  };

  const busy: BusyRow[] = meetings
    .filter((m) => ACTIVE.includes(m.status))
    .flatMap((m) => {
      const { seekerId, providerId } = pair(m);
      const keys = [...(m.roomId ? [`room:${m.roomId}:${m.table ?? 0}`] : []), `app:${seekerId}`, `app:${providerId}`];
      const unconfirmed = !(m.confirm.seeker && m.confirm.provider);
      return keys.map((key) => ({
        id: `${m.id}:${key}`,
        eventId,
        source: "meeting" as const,
        sourceId: m.id,
        key,
        from: toInstant(m.start),
        to: toInstant(addMinutes(m.end, config.rules.bufferMin)),
        active: occupies(m, config, now),
        confirmBy: unconfirmed ? toInstant(confirmBy(m, config)) : null,
      }));
    });

  const record: DrConfigRecord = { config, liveWindow: dr.liveWindow, archivedAt: dr.archivedAt, grants: dr.grants, adminLog: dr.adminLog };

  return {
    config: { eventId, record: json(record) },
    staff: mine(dr.staff).map((s) => ({ id: s.id, eventId, role: s.role, active: s.active, record: json(s) })),
    apps: apps.map((a) => {
      const pipeline = pipelineOf(dr, a, now);
      return {
        id: a.id,
        eventId,
        type: a.type,
        status: a.status,
        ref: a.ref ?? null,
        assigneeId: a.assignee ?? null,
        delegateId: a.delegateId ?? null,
        mission: a.mission || null,
        track: a.track ?? null,
        decision: decisionOf(a)?.decision ?? null,
        readiness: a.readiness ?? null,
        feeState: feeState(a),
        pipelineStatus: pipeline.status,
        pipelineSince: pipeline.since ? toInstant(pipeline.since) : null,
        contactEmail: a.contact.email || null,
        record: json(a),
      };
    }),
    matches: matches.map((m) => ({ id: m.id, eventId, seekerId: m.seekerId, providerId: m.providerId, decision: m.decision, record: json(m) })),
    meetings: meetings.map((m) => {
      const { seekerId, providerId } = pair(m);
      return {
        id: m.id,
        eventId,
        matchId: m.matchId,
        seekerId,
        providerId,
        roomId: m.roomId ?? null,
        tableNo: m.table ?? null,
        startsAt: toInstant(m.start),
        endsAt: toInstant(m.end),
        status: m.status,
        record: json(m),
      };
    }),
    sessions: mine(dr.sessions).map((s) => ({ id: s.id, eventId, roomId: s.roomId, startsAt: toInstant(s.start), endsAt: toInstant(s.end), cancelled: !!s.cancelled, record: json(s) })),
    opportunities: mine(dr.opportunities).map((o) => ({
      id: o.id,
      eventId,
      matchId: o.matchId,
      meetingId: o.meetingId || null,
      ownerId: o.owner,
      stage: o.stage,
      closed: !!o.closed,
      record: json(o),
    })),
    exceptions: mine(dr.exceptions).map((x) => ({ id: x.id, eventId, at: toInstant(x.at), record: json(x) })),
    // incidents, consents and access carry no event in the rules: the aggregate is one event's
    incidents: dr.incidents.map((i) => ({ id: i.id, eventId, at: toInstant(i.startedAt), record: json(i) })),
    consents: dr.consents
      .filter((c) => appIds.has(c.seekerId))
      .map((c) => ({ id: c.id, eventId, seekerId: c.seekerId, providerId: c.providerId, docId: c.docId, granted: c.granted, version: c.version, at: toInstant(c.at) })),
    access: dr.access
      .filter((x) => appIds.has(x.seekerId))
      .map((x) => ({ id: x.id, eventId, seekerId: x.seekerId, item: x.item, viewer: x.viewer, action: x.action, at: toInstant(x.at) })),
    outbox: mine(dr.outbox).map((o) => ({
      id: o.id,
      eventId,
      recipient: o.to,
      channel: CHANNEL[o.channel],
      subject: o.subject,
      link: o.link,
      status: OUTBOX_STATUS[o.status],
      createdAt: toInstant(o.at),
      sentAt: o.status === "Failed" || o.status === "Queued" ? null : toInstant(o.at),
    })),
    counters: [
      { eventId, kind: "cs", n: dr.seq.cs },
      { eventId, kind: "fp", n: dr.seq.fp },
    ],
    busy,
  };
}

/** The rows of one event as Prisma reads them back. */
type WithRecord = { record: Prisma.JsonValue };
export type DealRoomStored = {
  config: WithRecord;
  staff: WithRecord[];
  apps: WithRecord[];
  matches: WithRecord[];
  meetings: WithRecord[];
  sessions: WithRecord[];
  opportunities: WithRecord[];
  exceptions: WithRecord[];
  incidents: WithRecord[];
  consents: { id: string; seekerId: string; providerId: string; docId: string; granted: boolean; version: number; at: Date }[];
  access: { id: string; seekerId: string; item: string; viewer: string; action: string; at: Date }[];
  outbox: { id: string; eventId: string | null; recipient: string; channel: keyof typeof CHANNEL_BACK | "push"; subject: string; link: string; status: string; createdAt: Date }[];
  counters: { kind: string; n: number }[];
};

const records = <T>(rows: WithRecord[]) => rows.map((r) => r.record as unknown as T);

/**
 * The rules' state for one event, from its rows. `clock` is the time the rules should take as now (the server's
 * Nairobi time, or a staging override); the prototype-only fields start empty.
 */
export function dealRoomFromRows(eventId: string, rows: DealRoomStored, clock: string): DealRoomState {
  const cfg = rows.config.record as unknown as DrConfigRecord;
  const counter = (kind: string) => rows.counters.find((c) => c.kind === kind)?.n ?? 0;
  return {
    clock,
    actingStaffId: "",
    configs: { [eventId]: cfg.config },
    staff: records<DrStaff>(rows.staff),
    apps: records<DrApplication>(rows.apps),
    matches: records<DrMatch>(rows.matches),
    consents: rows.consents.map((c): DrConsent => ({ id: c.id, seekerId: c.seekerId, providerId: c.providerId, docId: c.docId, granted: c.granted, at: fromInstant(c.at), version: c.version })),
    access: rows.access.map((x): DrAccess => ({ id: x.id, seekerId: x.seekerId, item: x.item, viewer: x.viewer, action: x.action as DrAccess["action"], at: fromInstant(x.at) })),
    meetings: records<DrMeeting>(rows.meetings),
    sessions: records<DrSession>(rows.sessions),
    opportunities: records<DrOpportunity>(rows.opportunities),
    exceptions: records<DrException>(rows.exceptions),
    grants: cfg.grants,
    outbox: rows.outbox
      .filter((o) => o.channel !== "push")
      .map(
        (o): DrMessage => ({
          id: o.id,
          eventId: o.eventId ?? eventId,
          at: fromInstant(o.createdAt),
          to: o.recipient,
          channel: CHANNEL_BACK[o.channel as keyof typeof CHANNEL_BACK],
          subject: o.subject,
          link: o.link,
          status: OUTBOX_STATUS_BACK[o.status as keyof typeof OUTBOX_STATUS_BACK] ?? "Sent",
        }),
      ),
    queue: [],
    conflicts: [],
    incidents: records<DrIncident>(rows.incidents),
    offline: false,
    liveWindow: cfg.liveWindow,
    archivedAt: cfg.archivedAt,
    seq: { cs: counter("cs"), fp: counter("fp") },
    adminLog: cfg.adminLog,
  };
}

const ROLE = { Lead: "dr_lead", Reviewer: "dr_reviewer", Operations: "dr_operations", Coordinator: "dr_coordinator", Oversight: "dr_oversight" } as const;

/**
 * The sign-in behind each staff member: a user (no password until M0.4 sets one) and a membership giving the
 * Deal Room role for this event. `userIdOf` names the user for a staff member: a fixed id for the demo seed, or
 * the user already holding that email for a reference import.
 */
export function staffAccounts(staff: DrStaff[], opts: { demo: boolean; userIdOf: (s: DrStaff) => string }) {
  return {
    users: staff.map((s): Prisma.UserCreateManyInput => ({ id: opts.userIdOf(s), kind: "staff", email: s.email, name: s.name, demo: opts.demo })),
    memberships: staff.map(
      (s): Prisma.MembershipCreateManyInput => ({
        id: `mem_${s.id}`,
        userId: opts.userIdOf(s),
        role: ROLE[s.role],
        eventId: s.eventId,
        canDecide: s.canDecide,
        revokedAt: s.revokedAt ? toInstant(s.revokedAt) : null,
      }),
    ),
  };
}
