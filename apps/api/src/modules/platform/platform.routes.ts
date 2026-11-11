/** Algotech's endpoints, under /v1/admin. Staff sessions only; the service checks the person is an Algotech admin. */
import { Router } from "express";
import { requireSession } from "../../http/session";
import type { PlatformController } from "./platform.controller";

export function platformRoutes(c: PlatformController): Router {
  const r = Router();
  const staff = requireSession({ staff: true });
  r.get("/queue", staff, c.queue);
  r.post("/organisers/:organiserId/kyc", staff, c.decideKyc);
  r.post("/events/:eventId/decision", staff, c.decideEvent);
  r.post("/events/:eventId/dealroom/staff", staff, c.addStaff);
  return r;
}
