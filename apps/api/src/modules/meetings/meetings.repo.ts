/**
 * Scheduling's own reads (M3.2): the event behind a public address, the applications a participant's email owns
 * there, one meeting's two parties, and which events have meetings the worker may need to act on. The aggregate
 * itself is the Deal Room's (dealroom.repo.ts), and every change goes through runCommand.
 */
import type { Db } from "@excursia/db";

export function createMeetingsRepo(db: Db) {
  return {
    /** The event at a public address, if it has a Deal Room. */
    eventBySlug: (slug: string) => db.event.findFirst({ where: { slug, drConfig: { isNot: null } }, select: { id: true, name: true, slug: true } }),

    /** The applications this email owns in the event. */
    appIdsOf: async (eventId: string, email: string) => (await db.drApplication.findMany({ where: { eventId, contactEmail: email }, select: { id: true } })).map((a) => a.id),

    /** One meeting's two parties, in this event. */
    pairOf: (eventId: string, meetingId: string) => db.drMeeting.findFirst({ where: { id: meetingId, eventId }, select: { seekerId: true, providerId: true } }),

    /** Events with a meeting still ahead that is proposed, confirmed or being moved: a lapse or a reminder may be due. */
    eventsWithMeetingsAhead: async (at: Date) =>
      (await db.drMeeting.findMany({ where: { startsAt: { gt: at }, status: { in: ["Proposed", "Change requested", "Confirmed"] } }, distinct: ["eventId"], select: { eventId: true } })).map((r) => r.eventId),
  };
}
export type MeetingsRepo = ReturnType<typeof createMeetingsRepo>;
