/**
 * The Deal Room in PostgreSQL: one event's aggregate read and written under that event's lock, the audit log, and
 * the list queries screens use (summary columns, never the whole aggregate).
 *
 * Writes go through `inEventLock` (backend-plan.md, "How a write runs on the server"): a transaction holding
 * pg_advisory_xact_lock for the event, so two writes to one Deal Room never interleave, while writes to different
 * events run side by side. Inside it, `load` reads the rows and `save` writes back only the rows that changed.
 */
import type { Db, Prisma } from "@excursia/db";
import type { CoreRows } from "../events/events.mapper";
import type { DrStaff } from "@excursia/domain/dealroom/types";
import type { BusyRow, DealRoomRows, DealRoomStored } from "./dealroom.mapper";

type Client = Db | Prisma.TransactionClient;

/** The rows of one event's aggregate: the Deal Room, and the core records its rules read. */
export type EventStored = { dealRoom: DealRoomStored; core: { organisers: { record: Prisma.JsonValue }[]; events: { record: Prisma.JsonValue }[]; tiers: { record: Prisma.JsonValue }[]; delegates: { record: Prisma.JsonValue }[] } };

/** What a command changed, worked out by comparing the rows before and after (dealroom.service.ts). */
export type Changes = {
  dealRoom: { [K in Exclude<keyof DealRoomRows, "config" | "busy">]: { upsert: DealRoomRows[K]; remove: string[] } } & {
    config: DealRoomRows["config"] | null;
    busy: { upsert: BusyRow[]; remove: string[] };
  };
  core: { delegates: { upsert: CoreRows["delegates"] }; badges: { upsert: CoreRows["badges"] } };
};

export type AuditRow = { actorKind: string; actorId: string | null; eventId: string; entity: string; entityId: string; action: string; detail: Prisma.InputJsonValue; ip: string | null };

async function loadWith(c: Client, eventId: string): Promise<EventStored | null> {
  const where = { eventId };
  const byId = { orderBy: { id: "asc" as const } };
  const config = await c.drConfig.findUnique({ where: { eventId } });
  const event = await c.event.findUnique({ where: { id: eventId } });
  if (!config || !event) return null;
  const [staff, apps, matches, meetings, sessions, opportunities, exceptions, incidents, consents, access, outbox, counters, organisers, tiers, delegates] = await Promise.all([
    c.drStaff.findMany({ where, ...byId }),
    c.drApplication.findMany({ where, ...byId }),
    c.drMatch.findMany({ where, ...byId }),
    c.drMeeting.findMany({ where, ...byId }),
    c.drSession.findMany({ where, ...byId }),
    c.drOpportunity.findMany({ where, ...byId }),
    c.drException.findMany({ where, ...byId }),
    c.drIncident.findMany({ where, ...byId }),
    c.drConsent.findMany({ where, ...byId }),
    c.drAccess.findMany({ where, ...byId }),
    c.outboxMessage.findMany({ where, ...byId }),
    c.drCounter.findMany({ where }),
    c.organiser.findMany({ where: { id: event.organiserId } }),
    c.tier.findMany({ where, ...byId }),
    c.delegate.findMany({ where, ...byId }),
  ]);
  return {
    dealRoom: { config, staff, apps, matches, meetings, sessions, opportunities, exceptions, incidents, consents, access, outbox, counters },
    core: { organisers, events: [event], tiers, delegates },
  };
}

/** Upserts by id; an application's version goes up with every save, for optimistic checks outside the lock. */
/** A Deal Room staff member's sign-in: the user behind their email, and the membership giving their role. */
export type StaffLink = { staffId: string; eventId: string; email: string; name: string; role: DrStaff["role"]; canDecide: boolean };

const MEMBERSHIP_ROLE = { Lead: "dr_lead", Reviewer: "dr_reviewer", Operations: "dr_operations", Coordinator: "dr_coordinator", Oversight: "dr_oversight" } as const;

/**
 * Gives each new staff member a sign-in: the staff account behind their email (made if there is none; it has no
 * password until they set one), linked to the staff record, with a membership for the role. Returns the emails it
 * refused: an applicant's account can't also be staff.
 */
async function linkStaffWith(tx: Prisma.TransactionClient, links: StaffLink[]): Promise<string[]> {
  const refused: string[] = [];
  for (const l of links) {
    const existing = await tx.user.findUnique({ where: { email: l.email }, select: { id: true, kind: true } });
    if (existing?.kind === "participant") {
      refused.push(l.email);
      continue;
    }
    const user = existing ?? (await tx.user.create({ data: { kind: "staff", email: l.email, name: l.name }, select: { id: true, kind: true } }));
    await tx.drStaff.update({ where: { id: l.staffId }, data: { userId: user.id } });
    const membership = { userId: user.id, role: MEMBERSHIP_ROLE[l.role], eventId: l.eventId, canDecide: l.canDecide, revokedAt: null };
    await tx.membership.upsert({ where: { id: `mem_${l.staffId}` }, create: { id: `mem_${l.staffId}`, ...membership }, update: membership });
  }
  return refused;
}

async function saveWith(tx: Prisma.TransactionClient, eventId: string, ch: Changes) {
  const d = ch.dealRoom;
  if (d.config) await tx.drConfig.update({ where: { eventId }, data: { record: d.config.record } });
  const each = async <T extends { id: string }>(rows: T[], up: (row: T) => Promise<unknown>) => {
    for (const row of rows) await up(row);
  };
  await each(d.staff.upsert, (r) => tx.drStaff.upsert({ where: { id: r.id }, create: r, update: r }));
  await each(d.apps.upsert, (r) => tx.drApplication.upsert({ where: { id: r.id }, create: r, update: { ...r, version: { increment: 1 } } }));
  await each(d.matches.upsert, (r) => tx.drMatch.upsert({ where: { id: r.id }, create: r, update: r }));
  await each(d.meetings.upsert, (r) => tx.drMeeting.upsert({ where: { id: r.id }, create: r, update: r }));
  await each(d.sessions.upsert, (r) => tx.drSession.upsert({ where: { id: r.id }, create: r, update: r }));
  await each(d.opportunities.upsert, (r) => tx.drOpportunity.upsert({ where: { id: r.id }, create: r, update: r }));
  await each(d.exceptions.upsert, (r) => tx.drException.upsert({ where: { id: r.id }, create: r, update: r }));
  await each(d.incidents.upsert, (r) => tx.drIncident.upsert({ where: { id: r.id }, create: r, update: r }));
  await each(d.consents.upsert, (r) => tx.drConsent.upsert({ where: { id: r.id }, create: r, update: r }));
  await each(d.access.upsert, (r) => tx.drAccess.upsert({ where: { id: r.id }, create: r, update: r }));
  await each(d.outbox.upsert, (r) => tx.outboxMessage.upsert({ where: { id: r.id }, create: r, update: r }));
  for (const c of d.counters.upsert)
    await tx.drCounter.upsert({ where: { eventId_kind: { eventId, kind: c.kind } }, create: c, update: { n: c.n } });

  const gone = { eventId };
  if (d.staff.remove.length) await tx.drStaff.deleteMany({ where: { ...gone, id: { in: d.staff.remove } } });
  if (d.apps.remove.length) await tx.drApplication.deleteMany({ where: { ...gone, id: { in: d.apps.remove } } });
  if (d.matches.remove.length) await tx.drMatch.deleteMany({ where: { ...gone, id: { in: d.matches.remove } } });
  if (d.meetings.remove.length) await tx.drMeeting.deleteMany({ where: { ...gone, id: { in: d.meetings.remove } } });
  if (d.sessions.remove.length) await tx.drSession.deleteMany({ where: { ...gone, id: { in: d.sessions.remove } } });
  if (d.opportunities.remove.length) await tx.drOpportunity.deleteMany({ where: { ...gone, id: { in: d.opportunities.remove } } });

  // busy slots: removed first, so a meeting moved to a new slot never clashes with its own old one
  if (d.busy.remove.length) await tx.$executeRaw`DELETE FROM dr_busy WHERE event_id = ${eventId} AND id = ANY(${d.busy.remove})`;
  for (const b of d.busy.upsert) {
    await tx.$executeRaw`INSERT INTO dr_busy (id, event_id, source, source_id, key, slot, active, confirm_by)
      VALUES (${b.id}, ${b.eventId}, ${b.source}::"BusySource", ${b.sourceId}, ${b.key}, tstzrange(${b.from}, ${b.to}), ${b.active}, ${b.confirmBy})
      ON CONFLICT (id) DO UPDATE SET slot = EXCLUDED.slot, active = EXCLUDED.active, confirm_by = EXCLUDED.confirm_by`;
  }

  await each(ch.core.delegates.upsert, (r) => tx.delegate.upsert({ where: { id: r.id }, create: r, update: r }));
  for (const b of ch.core.badges.upsert) await tx.badge.upsert({ where: { code: b.code }, create: b, update: b });
}

export function createDealRoomRepo(db: Db) {
  return {
    load: (eventId: string) => loadWith(db, eventId),

    /**
     * Runs `work` in one transaction holding the event's lock. `work` gets the aggregate's rows as they are now,
     * and a way to save what changed and to audit it; it all commits together, or not at all.
     */
    inEventLock<T>(
      eventId: string,
      work: (unit: { stored: EventStored | null; save: (ch: Changes) => Promise<void>; audit: (rows: AuditRow[]) => Promise<void>; linkStaff: (links: StaffLink[]) => Promise<string[]> }) => Promise<T>,
    ): Promise<T> {
      return db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dr:${eventId}`}, 0))`;
          const stored = await loadWith(tx, eventId);
          return work({
            stored,
            save: (ch) => saveWith(tx, eventId, ch),
            audit: async (rows) => {
              if (rows.length) await tx.auditEntry.createMany({ data: rows });
            },
            linkStaff: (links) => linkStaffWith(tx, links),
          });
        },
        { timeout: 15_000, maxWait: 5_000 },
      );
    },

    /** The Deal Room staff record behind a signed-in user, for one event; null if they aren't on its team. */
    staffForUser: (userId: string, eventId: string) =>
      db.drStaff.findFirst({ where: { userId, eventId, active: true }, select: { id: true, role: true, record: true } }),

    /** The review queue: summary columns plus the few record fields a list shows. */
    listApplications: (eventId: string, filter: { status?: string; assigneeId?: string | null; ids?: string[] }) =>
      db.drApplication.findMany({
        where: {
          eventId,
          ...(filter.ids ? { id: { in: filter.ids } } : filter.status ? { status: filter.status } : { status: { notIn: ["Lead", "Invited", "Draft"] } }),
          ...(filter.assigneeId !== undefined ? { assigneeId: filter.assigneeId } : {}),
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 500,
        select: { id: true, ref: true, type: true, status: true, assigneeId: true, mission: true, decision: true, readiness: true, version: true, updatedAt: true, record: true },
      }),

    /** The Deal Room's settings and its event, for the lead's settings screen. */
    settings: (eventId: string) =>
      db.drConfig.findUnique({ where: { eventId }, select: { record: true, event: { select: { id: true, name: true, slug: true, startDate: true, state: true } } } }),

    eventName: async (eventId: string) => (await db.event.findUnique({ where: { id: eventId }, select: { name: true } }))?.name ?? eventId,

    listStaff: (eventId: string) =>
      db.drStaff.findMany({ where: { eventId, active: true }, orderBy: { id: "asc" }, select: { id: true, role: true, record: true } }),

    /** One application's record and its event's config, for the reviewer's screen. */
    async forReview(eventId: string, appId: string) {
      const [app, cfg] = await Promise.all([
        db.drApplication.findFirst({ where: { id: appId, eventId }, select: { record: true } }),
        db.drConfig.findUnique({ where: { eventId }, select: { record: true } }),
      ]);
      return app && cfg ? { record: app.record, config: cfg.record } : null;
    },

    /** The stored file behind an application's document, if it has one (the demo seed's documents don't). */
    fileOf: (id: string, appId: string) => db.file.findFirst({ where: { id, ownerKind: "dr_application", ownerId: appId } }),

    /** Opening a document is recorded, like every change. */
    audit: (row: AuditRow) => db.auditEntry.create({ data: row }),

    auditFor: (entity: string, entityId: string) => db.auditEntry.findMany({ where: { entity, entityId }, orderBy: { at: "asc" } }),
  };
}
export type DealRoomRepo = ReturnType<typeof createDealRoomRepo>;
