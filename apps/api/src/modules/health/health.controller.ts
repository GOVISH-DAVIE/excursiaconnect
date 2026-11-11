/**
 * The health endpoints' handlers: read the request, ask the service, shape the response. No paths here (that is
 * health.routes.ts) and no checks of their own (that is health.service.ts).
 */
import type { RequestHandler } from "express";
import type { Health } from "@excursia/contracts/http";
import type { HealthService } from "./health.service";

export type HealthController = {
  live: RequestHandler;
  ready: RequestHandler;
};

export function createHealthController(service: HealthService): HealthController {
  return {
    live: (_req, res) => {
      res.set("Cache-Control", "no-store").json({ status: "ok" } satisfies Health);
    },

    ready: async (_req, res) => {
      const up = await service.databaseAnswers();
      const health: Health = up ? { status: "ok", db: "ok" } : { status: "unavailable", db: "down" };
      res.status(up ? 200 : 503).set("Cache-Control", "no-store").json(health);
    },
  };
}
