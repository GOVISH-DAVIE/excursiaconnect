/** The participant's badge, under /v1/badges/:slug: signed in, and only their own. */
import { Router } from "express";
import { requireSession } from "../../http/session";
import type { BadgesController } from "./badges.controller";

export function badgesRoutes(c: BadgesController): Router {
  const r = Router();
  r.get("/:slug", requireSession(), c.mine);
  r.patch("/:slug/:appId", requireSession(), c.details);
  return r;
}
