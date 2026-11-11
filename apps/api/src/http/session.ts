/**
 * The session cookie, and the middleware every route uses to know who is asking (docs/architecture.md, "Sessions
 * and cookies across the two subdomains").
 *
 * The cookie: `__Secure-sid` in production (`sid` over plain http locally), HttpOnly, Secure, Path=/, scoped to
 * COOKIE_DOMAIN so the web app's server components see it too; SameSite=Strict for staff, Lax for applicants (an
 * applicant arriving from a link in an email must stay signed in). It expires with the session's absolute limit;
 * the idle limit is the server's to enforce.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Config } from "../config";
import type { AuthService, Issued, Resolved } from "../modules/auth/auth.service";
import { HttpError } from "./errors";

export type SessionLocals = { auth: Resolved | null };

export const cookieName = (config: Config) => (config.NODE_ENV === "production" ? "__Secure-sid" : "sid");

/** The value of one cookie from the Cookie header; no library needed for one name. */
export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function setSessionCookie(res: Response, config: Config, issued: Issued, now = new Date()) {
  res.cookie(cookieName(config), issued.token, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: issued.staff ? "strict" : "lax",
    path: "/",
    domain: config.COOKIE_DOMAIN,
    maxAge: Math.max(0, issued.expiresAt.getTime() - now.getTime()),
  });
}

export function clearSessionCookie(res: Response, config: Config) {
  res.clearCookie(cookieName(config), { httpOnly: true, secure: config.NODE_ENV === "production", path: "/", domain: config.COOKIE_DOMAIN });
}

/** Looks up the cookie's session once per request and leaves it in res.locals.auth (null if none or ended). */
export function loadSession(config: Config, auth: AuthService): RequestHandler {
  return async (req, res, next) => {
    res.locals.auth = await auth.resolve(readCookie(req, cookieName(config)));
    next();
  };
}

/**
 * Lets the request through only with a session of the kind asked for.
 * - `staff`: staff or admin, not an applicant.
 * - `pending`: also accepts a staff session that is still to give its authenticator code (the TOTP routes only).
 */
export function requireSession(opts: { staff?: boolean; pending?: boolean } = {}): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    const auth = (res.locals as SessionLocals).auth;
    if (!auth) throw new HttpError("unauthenticated", "Sign in first.");
    if (auth.pending && !opts.pending) throw new HttpError("unauthenticated", "Finish signing in with the code from your authenticator.");
    if (opts.staff && auth.user.kind === "participant") throw new HttpError("forbidden", "This is for staff only.");
    next();
  };
}

/** The session a requireSession route was given. */
export const sessionOf = (res: Response): Resolved => {
  const auth = (res.locals as SessionLocals).auth;
  if (!auth) throw new HttpError("unauthenticated", "Sign in first.");
  return auth;
};
