/**
 * The desk's endpoints, under /v1/scan (M2.2):
 * - the workspace (a staff session): the event's scanners, enrolling this device, retiring one, my PIN;
 * - the enrolled device (its cookie): who may sign in on it, and the PIN sign-in;
 * - the scanner (its own session, which opens nothing else): the badge list and the scans.
 */
import { Router } from "express";
import { requireSession } from "../../http/session";
import type { ScanningController } from "./scanning.controller";

export function scanningRoutes(c: ScanningController): Router {
  const r = Router();
  const staff = requireSession({ staff: true });
  const scanner = requireSession({ staff: true, scanner: "only" });
  r.put("/pin", staff, c.setPin);
  r.get("/device", c.home);
  r.post("/device/signin", c.signIn);
  r.get("/:eventId/devices", staff, c.devices);
  r.post("/:eventId/devices", staff, c.enrol);
  r.post("/:eventId/devices/:deviceId/retire", staff, c.retire);
  r.get("/:eventId/badges", scanner, c.badges);
  r.post("/:eventId/scans", scanner, c.scan);
  return r;
}
