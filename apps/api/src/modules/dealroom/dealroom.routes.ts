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
  r.get("/:eventId/settings", requireSession({ staff: true }), c.settings);
  r.get("/:eventId/messages", requireSession({ staff: true }), c.messages);
  // the Deal Room at a glance, for anyone on the team (M3.6)
  r.get("/:eventId/overview", requireSession({ staff: true }), c.overview);
  r.put("/:eventId/settings", requireSession({ staff: true }), c.saveSettings);
  r.post("/:eventId/settings/retention", requireSession({ staff: true }), c.extendRetention);
  r.get("/:eventId/applications", requireSession({ staff: true }), c.applications);
  r.post("/:eventId/applications/assign", requireSession({ staff: true }), c.assignReviewer);
  // one application, for its reviewers (M1.3)
  r.get("/:eventId/applications/:appId", requireSession({ staff: true }), c.review);
  r.post("/:eventId/applications/:appId/start-review", requireSession({ staff: true }), c.startReview);
  r.post("/:eventId/applications/:appId/scores", requireSession({ staff: true }), c.score);
  r.post("/:eventId/applications/:appId/requests", requireSession({ staff: true }), c.requestInfo);
  r.post("/:eventId/applications/:appId/requests/expiry", requireSession({ staff: true }), c.rfiExpiry);
  r.get("/:eventId/applications/:appId/documents/:docId", requireSession({ staff: true }), c.documentLink);
  // decisions, readiness and verification (M1.6)
  const one = "/:eventId/applications/:appId";
  r.post(`${one}/recommendations`, requireSession({ staff: true }), c.recommend);
  r.post(`${one}/decisions`, requireSession({ staff: true }), c.decide);
  r.post(`${one}/decisions/confirm`, requireSession({ staff: true }), c.confirmSecond);
  r.post(`${one}/conditions/:conditionId/met`, requireSession({ staff: true }), c.meetCondition);
  r.post(`${one}/decision-maker/confirm`, requireSession({ staff: true }), c.confirmDecisionMaker);
  r.post(`${one}/readiness`, requireSession({ staff: true }), c.readiness);
  // the business's teaser, approved for the directory (M3.1)
  r.post(`${one}/teaser/approve`, requireSession({ staff: true }), c.approveTeaser);
  r.post(`${one}/kyc/check`, requireSession({ staff: true }), c.checkKyc);
  r.post(`${one}/sanctions`, requireSession({ staff: true }), c.sanctions);
  r.post(`${one}/verification`, requireSession({ staff: true }), c.verify);
  // the fee (M1.7): only the lead waives it; paying is the applicant's, settled by the provider
  r.post(`${one}/fee/waive`, requireSession({ staff: true }), c.waiveFee);
  // the badge, at the desk (M2.1): the lead, operations or a coordinator
  r.patch(`${one}/badge`, requireSession({ staff: true }), c.badgeDetails);
  r.post(`${one}/badge/reissue`, requireSession({ staff: true }), c.reissueBadge);
  return r;
}
