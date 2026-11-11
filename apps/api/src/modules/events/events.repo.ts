/**
 * Reading organisers, events, tiers and delegates back. Rows come back by id; events.mapper.ts turns them into
 * the rules' records.
 */
import type { Db } from "@excursia/db";

export type EventsRepo = ReturnType<typeof createEventsRepo>;

export function createEventsRepo(db: Db) {
  return {
    /** The events named, with their organisers, tiers and delegates. */
    async load(eventIds: string[]) {
      const byId = { orderBy: { id: "asc" as const } };
      const events = await db.event.findMany({ where: { id: { in: eventIds } }, ...byId });
      const organiserIds = [...new Set(events.map((e) => e.organiserId))];
      const [organisers, tiers, delegates] = await Promise.all([
        db.organiser.findMany({ where: { id: { in: organiserIds } }, ...byId }),
        db.tier.findMany({ where: { eventId: { in: eventIds } }, ...byId }),
        db.delegate.findMany({ where: { eventId: { in: eventIds } }, ...byId }),
      ]);
      return { organisers, events, tiers, delegates };
    },
  };
}
