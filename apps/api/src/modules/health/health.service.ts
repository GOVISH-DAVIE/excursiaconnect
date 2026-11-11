/**
 * What "healthy" means, without HTTP: the database answers within a deadline. The controller turns the answer
 * into a status code; nothing here knows about requests or responses, and the query itself is the repo's.
 */
import type { HealthRepo } from "./health.repo";

/** Longer than this and the database counts as down: ready must answer quickly even when Postgres does not. */
const DB_TIMEOUT_MS = 2000;

export type HealthService = {
  /** Whether PostgreSQL answered within the deadline. */
  databaseAnswers(): Promise<boolean>;
};

export function createHealthService(repo: HealthRepo, timeoutMs = DB_TIMEOUT_MS): HealthService {
  return {
    async databaseAnswers() {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      });
      try {
        return await Promise.race([repo.ping().then(() => true), timeout]);
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
