/**
 * Writing and removing the demo data. Everything the demo seed made is found through the `demo` flag on its
 * organisers, events and users, and every event-scoped row goes with its event. One transaction each way, so a
 * failed load leaves the database as it was.
 */
import type { Db, Prisma } from "@excursia/db";
import type { DealRoomRows } from "../dealroom/dealroom.mapper";
import type { CoreRows } from "../events/events.mapper";

export type SeedRows = {
  core: CoreRows;
  dealRooms: DealRoomRows[];
  users: Prisma.UserCreateManyInput[];
  memberships: Prisma.MembershipCreateManyInput[];
};

export type DemoCounts = { organisers: number; events: number; users: number };

export type SeedRepo = {
  /** Events not made by the demo seed: real reference data, or anything else someone loaded. */
  realEvents(): Promise<{ id: string; name: string }[]>;
  demoCounts(): Promise<DemoCounts>;
  /** Removes any earlier demo data, then writes these rows. */
  replaceDemo(rows: SeedRows): Promise<void>;
  removeDemo(): Promise<void>;
};

type Tx = Prisma.TransactionClient;

async function removeDemoRows(tx: Tx) {
  const eventIds = (await tx.event.findMany({ where: { demo: true }, select: { id: true } })).map((e) => e.id);
  const inEvents = { eventId: { in: eventIds } };
  if (eventIds.length) {
    await tx.$executeRaw`DELETE FROM dr_busy WHERE event_id = ANY(${eventIds})`;
    await tx.drCounter.deleteMany({ where: inEvents });
    await tx.drConsent.deleteMany({ where: inEvents });
    await tx.drAccess.deleteMany({ where: inEvents });
    await tx.outboxMessage.deleteMany({ where: inEvents });
    await tx.drIncident.deleteMany({ where: inEvents });
    await tx.drException.deleteMany({ where: inEvents });
    await tx.drOpportunity.deleteMany({ where: inEvents });
    await tx.drSession.deleteMany({ where: inEvents });
    await tx.drMeeting.deleteMany({ where: inEvents });
    await tx.drMatch.deleteMany({ where: inEvents });
    await tx.drApplication.deleteMany({ where: inEvents });
    await tx.drStaff.deleteMany({ where: inEvents });
    await tx.drConfig.deleteMany({ where: inEvents });
    await tx.membership.deleteMany({ where: inEvents });
    await tx.badge.deleteMany({ where: inEvents });
    await tx.delegate.deleteMany({ where: inEvents });
    await tx.tier.deleteMany({ where: inEvents });
    await tx.event.deleteMany({ where: { id: { in: eventIds } } });
  }
  await tx.organiser.deleteMany({ where: { demo: true } });
  await tx.user.deleteMany({ where: { demo: true } }); // their sessions and memberships cascade
}

async function insertBusy(tx: Tx, rows: DealRoomRows["busy"]) {
  // Prisma cannot write a tstzrange; the exclusion constraints check every row as it goes in
  for (const b of rows) {
    await tx.$executeRaw`INSERT INTO dr_busy (id, event_id, source, source_id, key, slot, active, confirm_by)
      VALUES (${b.id}, ${b.eventId}, ${b.source}::"BusySource", ${b.sourceId}, ${b.key}, tstzrange(${b.from}, ${b.to}), ${b.active}, ${b.confirmBy})`;
  }
}

export function createSeedRepo(db: Db): SeedRepo {
  return {
    realEvents: () => db.event.findMany({ where: { demo: false }, select: { id: true, name: true }, orderBy: { id: "asc" } }),

    async demoCounts() {
      const [organisers, events, users] = await Promise.all([
        db.organiser.count({ where: { demo: true } }),
        db.event.count({ where: { demo: true } }),
        db.user.count({ where: { demo: true } }),
      ]);
      return { organisers, events, users };
    },

    async replaceDemo({ core, dealRooms, users, memberships }) {
      await db.$transaction(
        async (tx) => {
          await removeDemoRows(tx);
          await tx.organiser.createMany({ data: core.organisers });
          await tx.event.createMany({ data: core.events });
          await tx.tier.createMany({ data: core.tiers });
          await tx.delegate.createMany({ data: core.delegates });
          await tx.badge.createMany({ data: core.badges });
          await tx.user.createMany({ data: users });
          await tx.membership.createMany({ data: memberships });
          for (const dr of dealRooms) {
            await tx.drConfig.create({ data: dr.config });
            await tx.drStaff.createMany({ data: dr.staff });
            await tx.drApplication.createMany({ data: dr.apps });
            await tx.drMatch.createMany({ data: dr.matches });
            await tx.drMeeting.createMany({ data: dr.meetings });
            await tx.drSession.createMany({ data: dr.sessions });
            await tx.drOpportunity.createMany({ data: dr.opportunities });
            await tx.drException.createMany({ data: dr.exceptions });
            await tx.drIncident.createMany({ data: dr.incidents });
            await tx.drConsent.createMany({ data: dr.consents });
            await tx.drAccess.createMany({ data: dr.access });
            await tx.outboxMessage.createMany({ data: dr.outbox });
            await tx.drCounter.createMany({ data: dr.counters });
            await insertBusy(tx, dr.busy);
          }
        },
        { timeout: 60_000 },
      );
    },

    removeDemo: () => db.$transaction((tx) => removeDemoRows(tx), { timeout: 60_000 }),
  };
}
