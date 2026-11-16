/**
 * Matching's own reads (M3.1): the event behind a public address, the applications a participant's email owns
 * there, one pair's two sides, and the stored file behind a document. The aggregate itself is the Deal Room's
 * (dealroom.repo.ts), and every change goes through runCommand.
 */
import type { Db } from "@excursia/db";

export function createMatchingRepo(db: Db) {
  return {
    /** The event at a public address, if it has a Deal Room. */
    eventBySlug: (slug: string) => db.event.findFirst({ where: { slug, drConfig: { isNot: null } }, select: { id: true, name: true, slug: true } }),

    eventName: async (eventId: string) => (await db.event.findUnique({ where: { id: eventId }, select: { name: true } }))?.name ?? eventId,

    /** The applications this email owns in the event. */
    appIdsOf: async (eventId: string, email: string) => (await db.drApplication.findMany({ where: { eventId, contactEmail: email }, select: { id: true } })).map((a) => a.id),

    /** One pair's two sides, in this event. */
    pairOf: (eventId: string, matchId: string) => db.drMatch.findFirst({ where: { id: matchId, eventId }, select: { seekerId: true, providerId: true } }),

    /** The stored file behind a seeker's document, if it has one (the demo seed's documents don't). */
    fileOf: (id: string, appId: string) => db.file.findFirst({ where: { id, ownerKind: "dr_application", ownerId: appId } }),
  };
}
export type MatchingRepo = ReturnType<typeof createMatchingRepo>;
