/** Sessions' endpoints, for the team, under /v1/sessions/:eventId; participants answer from /v1/my-meetings. */
import { Router } from "express";
import { requireSession } from "../../http/session";
import type { SessionsController } from "./sessions.controller";

export function sessionsRoutes(c: SessionsController): Router {
  const r = Router();
  const staff = requireSession({ staff: true });
  r.get("/:eventId", staff, c.board);
  r.post("/:eventId", staff, c.plan);
  r.put("/:eventId/:sessionId", staff, c.update);
  r.get("/:eventId/:sessionId/invitable", staff, c.inviteOptions);
  r.post("/:eventId/:sessionId/invite", staff, c.invite);
  r.post("/:eventId/:sessionId/cancel", staff, c.cancel);
  r.post("/:eventId/:sessionId/attendance", staff, c.attend);
  r.post("/:eventId/:sessionId/outcomes", staff, c.outcome);
  return r;
}
