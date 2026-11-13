/**
 * The worker's side of uploaded files: the scan queue, the scan's verdict, and deletion at the retention date.
 * Each change writes its audit row (and any email to the owner) in the same transaction.
 */
import { randomBytes } from "node:crypto";
import type { Db } from "@excursia/db";

export type Queued = { id: string; eventId: string | null; ownerKind: string; ownerId: string; kind: string | null; storageKey: string; name: string; size: number; createdAt: Date };
type Note = { to: string; subject: string; link: string };

const msgId = () => `msg_${randomBytes(8).toString("hex")}`;
/** How a row that the scanner failed on is marked (its scan note), until a scan succeeds. */
export const SCANNER_FAILED = "scanner failed: ";

export function createFilesRepo(db: Db) {
  /** One audited change to a file, with any emails it sends. */
  const change = (id: string, eventId: string | null, data: Parameters<Db["file"]["update"]>[0]["data"], action: string, detail: Record<string, unknown>, notes: Note[] = []) =>
    db.$transaction(async (tx) => {
      await tx.file.update({ where: { id }, data });
      await tx.auditEntry.create({ data: { actorKind: "system", actorId: null, eventId, entity: "file", entityId: id, action, detail: detail as never, ip: null } });
      if (notes.length) await tx.outboxMessage.createMany({ data: notes.map((n) => ({ id: msgId(), eventId, recipient: n.to, channel: "email" as const, subject: n.subject, link: n.link, status: "queued" as const })) });
    });

  return {
    /**
     * Up to `n` files in quarantine that are due a scan, oldest first. Each is leased for `leaseMs` (its next scan
     * moves past the lease), so another worker skips it and a crash mid-scan only delays it.
     */
    claim: (n: number, leaseMs: number) =>
      db.$queryRaw<Queued[]>`
        UPDATE file SET next_scan_at = now() + ${leaseMs} * interval '1 millisecond'
        WHERE id IN (
          SELECT id FROM file
          WHERE state = 'quarantine' AND deleted_at IS NULL AND (next_scan_at IS NULL OR next_scan_at <= now())
          ORDER BY created_at LIMIT ${n} FOR UPDATE SKIP LOCKED)
        RETURNING id, event_id AS "eventId", owner_kind AS "ownerKind", owner_id AS "ownerId", kind, storage_key AS "storageKey", name, size, created_at AS "createdAt"`,

    /** The upload hasn't arrived yet: look again shortly. */
    later: (id: string, ms: number) => db.file.update({ where: { id }, data: { nextScanAt: new Date(Date.now() + ms) } }),

    /** The scanner failed on it: try again later, and say why on the row, so the health check sees uploads stuck. */
    scannerFailed: (id: string, ms: number, why: string) =>
      db.file.update({ where: { id }, data: { nextScanAt: new Date(Date.now() + ms), scanNote: `${SCANNER_FAILED}${why}`.slice(0, 300) } }),

    /** An upload that never arrived, long after its link expired: nothing refers to it, so the row goes. */
    dropAbandoned: (id: string) => db.file.deleteMany({ where: { id, state: "quarantine" } }),

    clean: (f: Queued, scanner: string) => change(f.id, f.eventId, { state: "clean", scannedAt: new Date(), scanNote: scanner, nextScanAt: null }, "file/scan", { result: "clean", scanner, kind: f.kind }),

    /** Failed the scan: the bytes are already gone; the owner is told which document to upload again. */
    rejected: (f: Queued, scanner: string, signature: string, notes: Note[]) =>
      change(f.id, f.eventId, { state: "rejected", scannedAt: new Date(), scanNote: signature, nextScanAt: null, deletedAt: new Date() }, "file/scan", { result: "rejected", scanner, signature, kind: f.kind }, notes),

    /** Who hears about a document: an application's contact, or an organiser's owners. */
    async ownersOf(ownerKind: string, ownerId: string): Promise<string[]> {
      if (ownerKind === "dr_application") return [ownerId];
      if (ownerKind === "organiser")
        return (await db.membership.findMany({ where: { organiserId: ownerId, role: "owner", revokedAt: null }, select: { userId: true } })).map((m) => `user:${m.userId}`);
      return [];
    },

    /** The event's address, for a link back to its apply page. */
    slugOf: async (eventId: string | null) => (eventId ? ((await db.event.findUnique({ where: { id: eventId }, select: { slug: true } }))?.slug ?? null) : null),

    /** Files past their retention date whose bytes are still kept. */
    dueForDeletion: (n: number) =>
      db.file.findMany({ where: { retentionUntil: { lte: new Date() }, deletedAt: null }, orderBy: { retentionUntil: "asc" }, take: n, select: { id: true, eventId: true, storageKey: true, kind: true, retentionUntil: true } }),

    deleted: (f: { id: string; eventId: string | null; kind: string | null; retentionUntil: Date | null }) =>
      change(f.id, f.eventId, { deletedAt: new Date() }, "file/delete", { reason: "retention", retentionUntil: f.retentionUntil?.toISOString(), kind: f.kind }),
  };
}
export type FilesRepo = ReturnType<typeof createFilesRepo>;
