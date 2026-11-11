/**
 * Health checks for nginx, systemd and the deploy script (deploy.md, blue/green): live says the process answers;
 * ready also asks the database, so a new release only takes traffic once it can serve it.
 *
 * Paths and middleware only: each path names its controller handler, and nothing else happens here.
 */
import { Router } from "express";
import type { HealthController } from "./health.controller";

export function healthRoutes(controller: HealthController): Router {
  const router = Router();
  router.get("/live", controller.live);
  router.get("/ready", controller.ready);
  return router;
}
