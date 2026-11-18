/** Algotech's endpoints, under /v1/admin. Staff sessions only; the service checks the person is an Algotech admin. */
import { Router } from "express";
import { requireSession } from "../../http/session";
import type { PlatformController } from "./platform.controller";

export function platformRoutes(c: PlatformController): Router {
  const r = Router();
  const staff = requireSession({ staff: true });
  r.get("/queue", staff, c.queue);
  r.get("/team", staff, c.team);
  r.post("/team", staff, c.inviteAdmin);
  r.post("/team/:userId/level", staff, c.setAdminLevel);
  r.post("/team/:userId/remove", staff, c.removeAdmin);
  r.post("/organisers", staff, c.openOrganiser);
  r.post("/organisers/:organiserId/kyc", staff, c.decideKyc);
  r.put("/organisers/:organiserId/rate-card", staff, c.setRateCard);
  r.post("/events/:eventId/decision", staff, c.decideEvent);
  r.post("/events/:eventId/dealroom/staff", staff, c.addStaff);
  r.post("/events/:eventId/dealroom/staff/:staffId", staff, c.changeStaff);
  r.post("/events/:eventId/dealroom/staff/:staffId/remove", staff, c.removeStaff);
  return r;
}
