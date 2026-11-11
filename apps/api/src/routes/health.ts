/**
 * Health checks for nginx, systemd and the deploy script (deploy.md, blue/green): live says the process answers;
 * ready also asks the database, so a new release only takes traffic once it can serve it.
 */
import { Router } from "express";
import type { Health } from "@excursia/contracts/http";
import type { Db } from "@excursia/db";

/** Longer than this and the database counts as down: ready must answer quickly even when Postgres does not. */
const DB_TIMEOUT_MS = 2000;

async function databaseAnswers(db: Db): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), DB_TIMEOUT_MS);
  });
  try {
    return await Promise.race([db.$queryRaw`SELECT 1`.then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function healthRoutes(db: Db): Router {
  const router = Router();

  router.get("/live", (_req, res) => {
    res.set("Cache-Control", "no-store").json({ status: "ok" } satisfies Health);
  });

  router.get("/ready", async (_req, res) => {
    const up = await databaseAnswers(db);
    const health: Health = up ? { status: "ok", db: "ok" } : { status: "unavailable", db: "down" };
    res.status(up ? 200 : 503).set("Cache-Control", "no-store").json(health);
  });

  return router;
}
