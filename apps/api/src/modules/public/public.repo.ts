/** Reading an event for its public pages: the event, its organiser's name, and its Deal Room's settings and applications. */
import type { Db } from "@excursia/db";

export function createPublicRepo(db: Db) {
  return {
    /** A real (not demo) event by its web address, with what its public pages show. */
    bySlug: (slug: string) =>
      db.event.findFirst({
        where: { slug, demo: false },
        select: { id: true, state: true, record: true, organiser: { select: { name: true } }, drConfig: { select: { record: true } } },
      }),

    /** The Deal Room's providers: the challenges among them are published once verified. */
    providers: (eventId: string) => db.drApplication.findMany({ where: { eventId, type: "provider" }, select: { record: true } }),
  };
}
export type PublicRepo = ReturnType<typeof createPublicRepo>;
