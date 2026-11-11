/** The public pages' handler: anyone may read; a minute's public caching keeps a busy page off the database. */
import type { RequestHandler } from "express";
import { SlugParams, type PublicEvent } from "@excursia/contracts/public";
import type { PublicService } from "./public.service";

export function createPublicController(service: PublicService) {
  return {
    event: (async (req, res) => {
      const { slug } = SlugParams.parse(req.params);
      // looked up first: only a found event is cached, so a newly published one isn't held back by a cached 404
      const event: PublicEvent = await service.event(slug);
      res.set("Cache-Control", "public, max-age=60").json(event);
    }) satisfies RequestHandler,
  };
}
export type PublicController = ReturnType<typeof createPublicController>;
