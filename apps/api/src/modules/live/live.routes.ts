/** The live board's endpoints, for the team, under /v1/live/:eventId. */
import { Router } from "express";
import { requireSession } from "../../http/session";
import type { LiveController } from "./live.controller";

export function liveRoutes(c: LiveController): Router {
  const r = Router();
  const staff = requireSession({ staff: true });
  r.get("/:eventId", staff, c.board);
  r.post("/:eventId/:meetingId/start", staff, c.start);
  r.post("/:eventId/:meetingId/outcome", staff, c.outcome);
  r.post("/:eventId/:meetingId/refill", staff, c.refill);
  return r;
}
