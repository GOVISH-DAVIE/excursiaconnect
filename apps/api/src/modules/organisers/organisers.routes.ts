/**
 * Organisers and their events, under /v1. Signing up is open (an emailed code first); everything else needs a
 * staff session, and the service checks the person owns the organiser (or is an Algotech admin, for reading).
 */
import { Router } from "express";
import { requireSession } from "../../http/session";
import type { OrganisersController } from "./organisers.controller";

export function organisersRoutes(c: OrganisersController): Router {
  const r = Router();
  const staff = requireSession({ staff: true });
  r.post("/organisers/signup/code", c.signupCode);
  r.post("/organisers/signup", c.signUp);
  r.get("/organisers/mine", staff, c.mine);
  r.get("/organisers/:organiserId", staff, c.organiser);
  r.patch("/organisers/:organiserId/kyc", staff, c.saveKyc);
  r.post("/organisers/:organiserId/kyc/dpa", staff, c.signDpa);
  r.post("/organisers/:organiserId/kyc/submit", staff, c.submitKyc);
  r.post("/organisers/:organiserId/kyc/documents", staff, c.startKycDoc);
  r.post("/organisers/:organiserId/kyc/documents/:fileId/complete", staff, c.completeKycDoc);
  r.delete("/organisers/:organiserId/kyc/documents/:fileId", staff, c.removeKycDoc);
  r.get("/organisers/:organiserId/kyc/documents/:fileId", staff, c.kycDocLink);
  r.post("/organisers/:organiserId/events", staff, c.createEvent);
  r.get("/events/:eventId", staff, c.event);
  r.put("/events/:eventId", staff, c.saveEvent);
  r.post("/events/:eventId/submit", staff, c.submitEvent);
  r.post("/events/:eventId/publish", staff, c.publishEvent);
  return r;
}
