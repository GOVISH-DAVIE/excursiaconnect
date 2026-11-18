/**
 * What "healthy" means, without HTTP: the database answers within a deadline. The controller turns the answer
 * into a status code; nothing here knows about requests or responses, and the query itself is the repo's.
 */
import type { HealthRepo, QueueCounts } from "./health.repo";

/** Longer than this and the database counts as down: ready must answer quickly even when Postgres does not. */
const DB_TIMEOUT_MS = 2000;
/** The worker looks every 3 seconds: anything due for longer than this means it has stopped or can't keep up. */
const STUCK_SECONDS = 120;
/** More failed emails than this in a day is worth a look (a mail server refusing, a bad address list). */
const FAILED_EMAILS_A_DAY = 20;

/** What is wrong with the worker's queues, in words; empty when all is well. */
export function queueProblems(q: QueueCounts): string[] {
  const out: string[] = [];
  if (q.outboxOldestDueSeconds > STUCK_SECONDS) out.push(`${q.outboxDue} email${q.outboxDue === 1 ? "" : "s"} waiting, the oldest for ${q.outboxOldestDueSeconds} s: is the worker running?`);
  if (q.scansOldestDueSeconds > STUCK_SECONDS) out.push(`${q.scansDue} upload${q.scansDue === 1 ? "" : "s"} waiting for the virus scan, the oldest for ${q.scansOldestDueSeconds} s: is the worker or clamd running?`);
  // the scanner's own failures push each retry a minute on, so they never look overdue: count them by age instead
  if (q.scansFailingOldestSeconds > STUCK_SECONDS) out.push(`${q.scansFailing} upload${q.scansFailing === 1 ? "" : "s"} the virus scanner failed on, the oldest waiting ${q.scansFailingOldestSeconds} s: is clamd running?`);
  if (q.outboxFailedToday > FAILED_EMAILS_A_DAY) out.push(`${q.outboxFailedToday} emails failed in the last day: check the mail server`);
  if (q.retentionOverdue) out.push(`${q.retentionOverdue} file${q.retentionOverdue === 1 ? "" : "s"} past their retention date not deleted`);
  return out;
}

export type HealthService = {
  /** Whether PostgreSQL answered within the deadline. */
  databaseAnswers(): Promise<boolean>;
  /** The worker's queues, and what is wrong with them. */
  queues(): Promise<{ counts: QueueCounts; problems: string[] }>;
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

    async queues() {
      const counts = await repo.queues();
      return { counts, problems: queueProblems(counts) };
    },
  };
}
