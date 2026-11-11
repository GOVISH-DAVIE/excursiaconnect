/**
 * Importing a real event's reference data (backend-plan.md, M0.3). Never onto demo data: if the file names an
 * organiser, event or staff email the demo seed made, the import stops and says so, so demo and real records are
 * never mixed in one database.
 */
import type { ReferenceRepo } from "./reference.repo";
import type { ReferenceFile } from "./reference.schema";

export class ReferenceRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceRefused";
  }
}

export function createReferenceService(repo: ReferenceRepo) {
  return {
    async importFile(file: ReferenceFile, now: string) {
      const c = await repo.conflicts(file);
      const problems = [
        c.demoOrganiser && `organiser ${file.organiser.id} is demo data`,
        c.demoEvent && `event ${file.event.id} is demo data`,
        c.demoUsers.length > 0 && `${c.demoUsers.length} staff email(s) belong to demo users`,
        c.slugTakenBy && `the slug ${file.event.slug} belongs to event ${c.slugTakenBy}`,
      ].filter(Boolean);
      if (problems.length) throw new ReferenceRefused(`Not imported: ${problems.join("; ")}. Remove the demo data first (npm run db:seed:demo -- --remove) or fix the file.`);
      return repo.importFile(file, now);
    },
  };
}
