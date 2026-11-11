/**
 * The Deal Room's endpoints, under /v1/dealroom/:eventId. Staff only; the service then checks the person is on
 * this event's team, and the rules check their role.
 */
import { Router } from "express";
import { requireSession } from "../../http/session";
import type { DealRoomController } from "./dealroom.controller";

export function dealRoomRoutes(c: DealRoomController): Router {
  const r = Router({ mergeParams: true });
  r.get("/:eventId/team", requireSession({ staff: true }), c.team);
  r.get("/:eventId/applications", requireSession({ staff: true }), c.applications);
  r.post("/:eventId/applications/assign", requireSession({ staff: true }), c.assignReviewer);
  // one application, for its reviewers (M1.3)
  r.get("/:eventId/applications/:appId", requireSession({ staff: true }), c.review);
  r.post("/:eventId/applications/:appId/start-review", requireSession({ staff: true }), c.startReview);
  r.post("/:eventId/applications/:appId/scores", requireSession({ staff: true }), c.score);
  r.post("/:eventId/applications/:appId/requests", requireSession({ staff: true }), c.requestInfo);
  r.post("/:eventId/applications/:appId/requests/expiry", requireSession({ staff: true }), c.rfiExpiry);
  r.get("/:eventId/applications/:appId/documents/:docId", requireSession({ staff: true }), c.documentLink);
  return r;
}
