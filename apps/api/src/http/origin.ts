/**
 * The CSRF check on writes (backend-plan.md, Security model; architecture.md). SameSite cookies don't separate
 * sibling subdomains, and CORS only stops other sites reading answers, not sending requests. So every write must
 * name its origin, and the origin must be the web app's:
 * - an Origin header that isn't in WEB_ORIGINS is refused;
 * - a write carrying the session cookie with no Origin at all is refused (browsers always send one on a write).
 * A write with neither cookie nor Origin (curl, a server, later the apps with their own tokens) passes on, to be
 * judged by the route like any other unauthenticated request.
 */
import type { RequestHandler } from "express";
import type { Config } from "../config";
import { HttpError } from "./errors";
import { cookieName, readCookie } from "./session";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function originCheck(config: Config): RequestHandler {
  const allowed = new Set(config.WEB_ORIGINS);
  return (req, _res, next) => {
    if (SAFE.has(req.method)) return next();
    const origin = req.headers.origin;
    if (origin !== undefined && !allowed.has(origin)) throw new HttpError("forbidden", "This request came from a site that may not make changes here.");
    if (origin === undefined && readCookie(req, cookieName(config)) !== undefined)
      throw new HttpError("forbidden", "This request did not say which site it came from.");
    next();
  };
}
