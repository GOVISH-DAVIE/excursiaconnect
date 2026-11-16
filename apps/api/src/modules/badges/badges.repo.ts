/**
 * The badge page's reads: the event behind a public address, and a participant's badges there, through the
 * applications their email owns. Changes go through runCommand (dealroom.commands.ts).
 */
import type { Db } from "@excursia/db";

export function createBadgesRepo(db: Db) {
  return {
    /** The event at a public address, if it has a Deal Room, whatever its state: a badge outlives applying. */
    eventBySlug: (slug: string) => db.event.findFirst({ where: { slug, drConfig: { isNot: null } }, select: { id: true, record: true } }),

    /** Each application of this email's in the event that holds a badge, with the badge's delegate and tier. */
    async mine(eventId: string, email: string) {
      const apps = await db.drApplication.findMany({ where: { eventId, contactEmail: email }, orderBy: { id: "asc" }, select: { id: true, ref: true, record: true } });
      const ids = apps.map((a) => (a.record as { delegateId?: string }).delegateId).filter((id): id is string => !!id);
      if (!ids.length) return [];
      const delegates = await db.delegate.findMany({ where: { eventId, id: { in: ids } }, select: { id: true, record: true, tier: { select: { name: true } } } });
      return apps.flatMap((a) => {
        const d = delegates.find((x) => x.id === (a.record as { delegateId?: string }).delegateId);
        return d ? [{ appId: a.id, ref: a.ref, delegate: d.record, tier: d.tier.name }] : [];
      });
    },
  };
}
export type BadgesRepo = ReturnType<typeof createBadgesRepo>;
