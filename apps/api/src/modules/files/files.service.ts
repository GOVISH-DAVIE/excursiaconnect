/**
 * The worker's file jobs (backend-plan.md, M1.2):
 * - `scan`: each upload that arrived is scanned; a clean one may then be opened, an infected one is deleted at once
 *   and its owner told to upload a clean copy. An upload still on its way is looked at again shortly; one that never
 *   came, long after its link expired, is forgotten.
 * - `purge`: files past their retention date lose their bytes; the row stays, so the record shows what was there.
 */
import type { Scanner } from "../../scan/scanner";
import type { Storage } from "../../storage/storage";
import type { FilesRepo } from "./files.repo";

const BATCH = 5;
/** How long a scan may hold a file before another worker may try it. */
const LEASE_MS = 10 * 60_000;
/** How soon to look again for an upload that hasn't arrived. */
const AGAIN_MS = 15_000;
/** Upload links last 15 minutes; an upload not here after an hour isn't coming. */
const ABANDONED_MS = 60 * 60_000;
/** How soon to try again when the scanner itself fails (clamd down, say). */
const SCANNER_DOWN_MS = 60_000;

export function createFilesService({ repo, storage, scanner, log = console }: { repo: FilesRepo; storage: Storage; scanner: Scanner; log?: Pick<Console, "error"> }) {
  return {
    async scan() {
      const out = { clean: 0, rejected: 0, waiting: 0, dropped: 0, failed: 0 };
      for (const f of await repo.claim(BATCH, LEASE_MS)) {
        const bytes = await storage.read(f.storageKey);
        if (!bytes || bytes.length !== f.size) {
          if (Date.now() - f.createdAt.getTime() > ABANDONED_MS) {
            if (bytes) await storage.remove(f.storageKey);
            await repo.dropAbandoned(f.id);
            out.dropped++;
          } else {
            await repo.later(f.id, AGAIN_MS);
            out.waiting++;
          }
          continue;
        }
        let result;
        try {
          result = await scanner.scan(bytes);
        } catch (e) {
          log.error(`[worker] scan of ${f.id} failed`, e);
          await repo.later(f.id, SCANNER_DOWN_MS);
          out.failed++;
          continue;
        }
        if (!result.infected) {
          await repo.clean(f, scanner.name);
          out.clean++;
          continue;
        }
        // nobody may open it, so its bytes go now; the row keeps what was found
        await storage.remove(f.storageKey);
        const link = f.ownerKind === "organiser" ? "/team/organisation" : `/e/${(await repo.slugOf(f.eventId)) ?? ""}/deal-room/apply`;
        const subject = `${f.kind ?? "A document"} (${f.name}) failed the virus check: please upload a clean copy`;
        const notes = (await repo.ownersOf(f.ownerKind, f.ownerId)).map((to) => ({ to, subject, link }));
        await repo.rejected(f, scanner.name, result.signature, notes);
        out.rejected++;
      }
      return out;
    },

    async purge() {
      let deleted = 0;
      for (const f of await repo.dueForDeletion(50)) {
        await storage.remove(f.storageKey);
        await repo.deleted(f);
        deleted++;
      }
      return deleted;
    },
  };
}
export type FilesService = ReturnType<typeof createFilesService>;
