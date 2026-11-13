/**
 * The health module's one query. Repositories are the only files that call the database (eslint.config.mjs).
 */
import type { Db } from "@excursia/db";

export type QueueCounts = {
  outboxDue: number;
  outboxOldestDueSeconds: number;
  outboxFailedToday: number;
  scansDue: number;
  scansOldestDueSeconds: number;
  scansRejectedToday: number;
  /** uploads the scanner itself failed on (clamd down), and how long the oldest has waited since it arrived */
  scansFailing: number;
  scansFailingOldestSeconds: number;
  retentionOverdue: number;
};

export type HealthRepo = {
  /** Resolves when PostgreSQL answers; rejects when it can't be reached. */
  ping(): Promise<void>;
  /** What is waiting on the worker, and for how long. */
  queues(): Promise<QueueCounts>;
};

export function createHealthRepo(db: Db): HealthRepo {
  return {
    async ping() {
      await db.$queryRaw`SELECT 1`;
    },

    async queues() {
      // "due" is what the worker should already have taken: its next attempt or scan is in the past
      const [r] = await db.$queryRaw<Record<keyof QueueCounts, bigint | number>[]>`
        SELECT
          (SELECT count(*) FROM outbox_message WHERE status = 'queued' AND next_attempt_at <= now()) AS "outboxDue",
          (SELECT coalesce(extract(epoch FROM now() - min(next_attempt_at)), 0)::int FROM outbox_message WHERE status = 'queued' AND next_attempt_at <= now()) AS "outboxOldestDueSeconds",
          (SELECT count(*) FROM outbox_message WHERE status = 'failed' AND next_attempt_at > now() - interval '1 day') AS "outboxFailedToday",
          (SELECT count(*) FROM file WHERE state = 'quarantine' AND deleted_at IS NULL AND coalesce(next_scan_at, created_at) <= now()) AS "scansDue",
          (SELECT coalesce(extract(epoch FROM now() - min(coalesce(next_scan_at, created_at))), 0)::int FROM file WHERE state = 'quarantine' AND deleted_at IS NULL AND coalesce(next_scan_at, created_at) <= now()) AS "scansOldestDueSeconds",
          (SELECT count(*) FROM file WHERE state = 'rejected' AND scanned_at > now() - interval '1 day') AS "scansRejectedToday",
          (SELECT count(*) FROM file WHERE state = 'quarantine' AND deleted_at IS NULL AND scan_note LIKE 'scanner failed:%') AS "scansFailing",
          (SELECT coalesce(extract(epoch FROM now() - min(created_at)), 0)::int FROM file WHERE state = 'quarantine' AND deleted_at IS NULL AND scan_note LIKE 'scanner failed:%') AS "scansFailingOldestSeconds",
          (SELECT count(*) FROM file WHERE deleted_at IS NULL AND retention_until < now() - interval '1 day') AS "retentionOverdue"`;
      return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)])) as QueueCounts;
    },
  };
}
