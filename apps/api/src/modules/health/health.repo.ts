/**
 * The health module's one query. Repositories are the only files that call the database (eslint.config.mjs).
 */
import type { Db } from "@excursia/db";

export type HealthRepo = {
  /** Resolves when PostgreSQL answers; rejects when it can't be reached. */
  ping(): Promise<void>;
};

export function createHealthRepo(db: Db): HealthRepo {
  return {
    async ping() {
      await db.$queryRaw`SELECT 1`;
    },
  };
}
