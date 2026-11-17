/**
 * Scheduling's endpoints. The team's under /v1/meetings/:eventId (staff, then the service checks the team and that
 * the role schedules); the participant's under /v1/my-meetings/:slug (signed in, their own meetings only).
 */
import { Router } from "express";
import { requireSession } from "../../http/session";
import type { MeetingsController } from "./meetings.controller";

export function meetingsRoutes(c: MeetingsController): Router {
  const r = Router();
  const staff = requireSession({ staff: true });
  r.get("/:eventId", staff, c.schedule);
  r.get("/:eventId/slots", staff, c.slots);
  r.post("/:eventId/proposals", staff, c.propose);
  r.post("/:eventId/auto-propose", staff, c.autoPropose);
  r.post("/:eventId/:meetingId/move", staff, c.move);
  r.post("/:eventId/:meetingId/cancel", staff, c.cancel);
  r.post("/:eventId/:meetingId/change/accept", staff, c.acceptChange);
  r.post("/:eventId/:meetingId/change/decline", staff, c.declineChange);
  return r;
}

export function myMeetingsRoutes(c: MeetingsController): Router {
  const r = Router();
  const signedIn = requireSession();
  r.get("/:slug", signedIn, c.mine);
  r.post("/:slug/:meetingId/confirm", signedIn, c.confirm);
  r.get("/:slug/:meetingId/times", signedIn, c.times);
  r.post("/:slug/:meetingId/move", signedIn, c.askMove);
  r.post("/:slug/:meetingId/move/answer", signedIn, c.answerMove);
  r.get("/:slug/:meetingId/invite.ics", signedIn, c.invite);
  return r;
}
