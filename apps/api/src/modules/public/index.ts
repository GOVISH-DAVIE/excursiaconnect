/** The public module, assembled: repo → service → controller → routes. */
import type { Db } from "@excursia/db";
import { createPublicController } from "./public.controller";
import { createPublicRepo } from "./public.repo";
import { publicRoutes } from "./public.routes";
import { createPublicService } from "./public.service";

export function publicModule(deps: { db: Db; now: () => Date }) {
  return publicRoutes(createPublicController(createPublicService({ repo: createPublicRepo(deps.db), now: deps.now })));
}
