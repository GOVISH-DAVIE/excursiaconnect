/**
 * The worker process (deploy.md, excursia-worker), as the worker database role, every few seconds: sends the
 * outbox, scans new uploads for viruses, and deletes files past their retention date. Stops cleanly on SIGTERM,
 * finishing the batch in hand.
 */
import { createDb } from "@excursia/db";
import { loadConfig } from "./config";
import { loadLocalEnv } from "./env";
import { mailerFor } from "./mail/mailer";
import { createFilesRepo } from "./modules/files/files.repo";
import { SCAN_BATCH, createFilesService } from "./modules/files/files.service";
import { createOutboxRepo } from "./modules/outbox/outbox.repo";
import { createOutboxService } from "./modules/outbox/outbox.service";
import { clamdScanner, testScanner } from "./scan/scanner";
import { deriveKeys } from "./security/secrets";
import { createLocalStorage, uploadsDir } from "./storage/local";

loadLocalEnv();
const config = loadConfig({ ...process.env, DATABASE_URL: process.env.WORKER_DATABASE_URL ?? process.env.DATABASE_URL });
const db = createDb(config.DATABASE_URL, 3);
const outbox = createOutboxService({ repo: createOutboxRepo(db), mailer: mailerFor(config), web: config.WEB_ORIGINS[0] });
const scanner = config.CLAMD_ADDRESS ? clamdScanner(config.CLAMD_ADDRESS) : testScanner;
const files = createFilesService({ repo: createFilesRepo(db), storage: createLocalStorage({ dir: uploadsDir(config), key: deriveKeys(config.AUTH_SECRET).upload }), scanner });
/** How long one round may keep scanning while uploads are waiting; the outbox goes at its own, slower pace. */
const SCAN_BUDGET_MS = 2_500;
/** Retention is in days and months: looking once a minute is plenty. */
const PURGE_EVERY_MS = 60_000;
let purgedAt = 0;

const EVERY_MS = 3_000;
let stopping = false;
let timer: NodeJS.Timeout | undefined;

async function tick() {
  try {
    const r = await outbox.drain();
    if (r.claimed) console.log(`[worker] outbox: ${r.sent} sent, ${r.retrying} to retry, ${r.failed} failed`);
  } catch (e) {
    console.error("[worker] outbox batch failed", e);
  }
  try {
    // a full batch means more are waiting: keep scanning for a moment, so a burst of uploads (or a backlog after the
    // worker was down) clears in seconds rather than five files a round
    const s = { clean: 0, rejected: 0, dropped: 0, failed: 0 };
    const until = Date.now() + SCAN_BUDGET_MS;
    for (;;) {
      const r = await files.scan();
      s.clean += r.clean;
      s.rejected += r.rejected;
      s.dropped += r.dropped;
      s.failed += r.failed;
      if (stopping || r.claimed < SCAN_BATCH || r.failed || Date.now() > until) break;
    }
    if (s.clean || s.rejected || s.dropped || s.failed) console.log(`[worker] scan: ${s.clean} clean, ${s.rejected} rejected, ${s.dropped} abandoned, ${s.failed} to retry`);
    if (Date.now() - purgedAt > PURGE_EVERY_MS) {
      purgedAt = Date.now();
      const n = await files.purge();
      if (n) console.log(`[worker] retention: ${n} file${n === 1 ? "" : "s"} deleted`);
    }
  } catch (e) {
    console.error("[worker] file batch failed", e);
  }
  if (!stopping) timer = setTimeout(tick, EVERY_MS);
}

if (!config.CLAMD_ADDRESS) console.log("[worker] no CLAMD_ADDRESS: uploads are checked by the test scanner, which catches only the EICAR test file");
console.log(`[worker] sending the outbox every ${EVERY_MS / 1000} s (${config.MAIL_TRANSPORT}${config.MAIL_TRANSPORT === "smtp" && config.APP_ENV !== "production" ? `, real mail only to MAIL_ALLOW: ${config.MAIL_ALLOW.join(", ") || "nobody"}` : ""})`);
void tick();

async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  console.log(`[worker] ${signal}: stopping`);
  setTimeout(() => process.exit(1), 10_000).unref();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
