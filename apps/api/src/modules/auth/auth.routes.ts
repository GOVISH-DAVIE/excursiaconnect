/**
 * Sign-in's endpoints, under /v1. nginx adds a coarse per-address limit on /v1/auth/ (deploy.md); the service
 * counts the real ones in PostgreSQL.
 */
import { Router } from "express";
import { requireSession } from "../../http/session";
import type { AuthController } from "./auth.controller";

export function authRoutes(c: AuthController): Router {
  const r = Router();
  // applicants: a code by email
  r.post("/auth/code", c.requestCode);
  r.post("/auth/code/verify", c.verifyCode);
  // staff: password, then the authenticator
  r.post("/auth/staff/signin", c.staffSignIn);
  r.post("/auth/staff/password/code", c.requestPasswordCode);
  r.post("/auth/staff/password", c.setPassword);
  r.post("/auth/totp/setup", requireSession({ staff: true, pending: true }), c.startTotp);
  r.post("/auth/totp/confirm", requireSession({ staff: true, pending: true }), c.confirmTotp);
  r.post("/auth/totp/verify", requireSession({ staff: true, pending: true }), c.verifyTotp);
  // everyone
  r.post("/auth/signout", c.signOut);
  r.get("/session", requireSession({ pending: true }), c.session);
  return r;
}
