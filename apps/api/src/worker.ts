/**
 * The worker process (deploy.md, excursia-worker): sends the outbox, a batch every few seconds, as the worker
 * database role. Stops cleanly on SIGTERM, finishing the batch in hand.
 */
import { createDb } from "@excursia/db";
import { loadConfig } from "./config";
import { loadLocalEnv } from "./env";
import { mailerFor } from "./mail/mailer";
import { createOutboxRepo } from "./modules/outbox/outbox.repo";
import { createOutboxService } from "./modules/outbox/outbox.service";

loadLocalEnv();
const config = loadConfig({ ...process.env, DATABASE_URL: process.env.WORKER_DATABASE_URL ?? process.env.DATABASE_URL });
const db = createDb(config.DATABASE_URL, 3);
const outbox = createOutboxService({ repo: createOutboxRepo(db), mailer: mailerFor(config), web: config.WEB_ORIGINS[0] });

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
  if (!stopping) timer = setTimeout(tick, EVERY_MS);
}

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
