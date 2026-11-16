/**
 * Matching's endpoints. The team's under /v1/matching/:eventId (staff, then the service checks the team and the
 * rules the role); the participant's under /v1/introductions/:slug (signed in, their own introductions only). A
 * stamped copy's link carries its own permission, like an upload's, so it needs no session.
 */
import { Router } from "express";
import { requireSession } from "../../http/session";
import type { MatchingController } from "./matching.controller";

export function matchingRoutes(c: MatchingController): Router {
  const r = Router();
  const staff = requireSession({ staff: true });
  r.get("/:eventId", staff, c.board);
  r.get("/:eventId/candidates/:appId", staff, c.candidates);
  r.post("/:eventId/decisions", staff, c.decide);
  r.get("/:eventId/matches/:matchId", staff, c.view);
  r.put("/:eventId/matches/:matchId/brief", staff, c.brief);
  r.post("/:eventId/matches/:matchId/introduce", staff, c.introduce);
  return r;
}

export function introductionsRoutes(c: MatchingController): Router {
  const r = Router();
  r.get("/files/:token", c.shared);
  r.get("/:slug", requireSession(), c.mine);
  r.post("/:slug/:matchId/respond", requireSession(), c.respond);
  r.put("/:slug/:matchId/documents/:docId/consent", requireSession(), c.consent);
  r.post("/:slug/:matchId/profile", requireSession(), c.profile);
  r.post("/:slug/:matchId/documents/:docId/open", requireSession(), c.openDocument);
  return r;
}
