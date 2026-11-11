/**
 * Applying's endpoints, under /v1/apply/:slug (the event's public address). The form's settings are public; the
 * rest is for a signed-in applicant, on their own applications only.
 */
import { Router } from "express";
import { requireSession } from "../../http/session";
import type { ApplyController } from "./apply.controller";

export function applyRoutes(c: ApplyController): Router {
  const r = Router();
  const signedIn = requireSession();
  r.get("/:slug/form", c.form);
  r.get("/:slug/mine", signedIn, c.mine);
  r.post("/:slug/mine", signedIn, c.start);
  r.get("/:slug/mine/:appId", signedIn, c.get);
  r.patch("/:slug/mine/:appId", signedIn, c.save);
  r.post("/:slug/mine/:appId/submit", signedIn, c.submit);
  r.post("/:slug/mine/:appId/documents", signedIn, c.startUpload);
  r.post("/:slug/mine/:appId/documents/:fileId/complete", signedIn, c.completeUpload);
  return r;
}
