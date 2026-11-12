/**
 * Applying's own queries: the event behind a public address, an applicant's applications by their verified email,
 * and the files they upload. Changes to applications themselves go through runCommand (dealroom.commands.ts).
 */
import type { Db } from "@excursia/db";

export function createApplyRepo(db: Db) {
  return {
    /** The event at a public address, if it has a Deal Room. */
    async eventBySlug(slug: string) {
      const event = await db.event.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, record: true, drConfig: { select: { record: true } } } });
      return event?.drConfig ? { id: event.id, name: event.name, slug: event.slug, event: event.record, config: event.drConfig.record } : null;
    },

    /** An applicant's applications in one event: the ones started with, and owned by, their email. */
    mine: (eventId: string, email: string) =>
      db.drApplication.findMany({ where: { eventId, contactEmail: email }, orderBy: { id: "asc" }, select: { id: true, version: true, record: true } }),

    versionOf: async (id: string) => (await db.drApplication.findUnique({ where: { id }, select: { version: true } }))?.version ?? 0,

    /** A file waiting for its upload, in quarantine until the worker's scan, kept until its retention date. */
    addFile: (f: { id: string; eventId: string; appId: string; kind: string; storageKey: string; name: string; contentType: string; size: number; retentionUntil: Date }) =>
      db.file.create({
        data: {
          id: f.id, eventId: f.eventId, ownerKind: "dr_application", ownerId: f.appId, kind: f.kind, storageKey: f.storageKey, name: f.name,
          contentType: f.contentType, size: f.size, retentionUntil: f.retentionUntil,
        },
      }),

    /** Where each of the applications' files stands: in quarantine, clean, failed the scan, or deleted. */
    fileStates: async (appIds: string[]) =>
      new Map(
        (await db.file.findMany({ where: { ownerKind: "dr_application", ownerId: { in: appIds } }, select: { id: true, state: true, deletedAt: true } })).map((f) => [
          f.id,
          f.state === "rejected" ? ("failed" as const) : f.deletedAt ? ("deleted" as const) : f.state === "clean" ? ("clean" as const) : ("checking" as const),
        ]),
      ),

    fileOf: (id: string, appId: string) => db.file.findFirst({ where: { id, ownerKind: "dr_application", ownerId: appId } }),

    /** Files started for one application and not yet finished, to cap how many can be in flight. */
    pendingFiles: (appId: string, since: Date) => db.file.count({ where: { ownerKind: "dr_application", ownerId: appId, createdAt: { gt: since } } }),
  };
}
export type ApplyRepo = ReturnType<typeof createApplyRepo>;
