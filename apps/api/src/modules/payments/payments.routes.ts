/**
 * Paying's endpoints. Under /v1/pay/:slug/:appId, for the signed-in applicant (nginx limits their rate). Under
 * /v1/hooks, the providers' callbacks: no cookie and no Origin, so they're mounted before the Origin check, and each
 * is verified in the service (Daraja's by the token in its path, then by the worker's status check).
 */
import { Router } from "express";
import { requireSession } from "../../http/session";
import type { PaymentsController } from "./payments.controller";

export function payRoutes(c: PaymentsController): Router {
  const r = Router();
  r.get("/:slug/:appId", requireSession(), c.latest);
  r.post("/:slug/:appId/mpesa", requireSession(), c.startMpesa);
  return r;
}

export function hookRoutes(c: PaymentsController): Router {
  const r = Router();
  r.post("/mm/:token", c.mpesaCallback);
  return r;
}
