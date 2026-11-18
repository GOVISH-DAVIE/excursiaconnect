/** The badge page's handlers: parse with the contracts, call the service, answer. Never cached: a badge is private. */
import type { RequestHandler } from "express";
import { BadgeDetailsInput, BadgeParams } from "@excursia/contracts/badge";
import { SlugParams } from "@excursia/contracts/apply";
import { sessionOf } from "../../http/session";
import type { BadgesService } from "./badges.service";

export function createBadgesController(service: BadgesService) {
  return {
    mine: (async (req, res) => {
      const { slug } = SlugParams.parse(req.params);
      res.set("Cache-Control", "private, no-store").json(await service.mine(sessionOf(res), slug));
    }) satisfies RequestHandler,

    details: (async (req, res) => {
      const { slug, appId } = BadgeParams.parse(req.params);
      res.set("Cache-Control", "private, no-store").json(await service.details(sessionOf(res), slug, appId, BadgeDetailsInput.parse(req.body), req.ip ?? null));
    }) satisfies RequestHandler,
  };
}
export type BadgesController = ReturnType<typeof createBadgesController>;
