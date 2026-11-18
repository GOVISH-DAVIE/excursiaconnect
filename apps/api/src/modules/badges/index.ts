/** The badges module, assembled: its repo and the shared runCommand → service → controller → routes. */
import type { Db } from "@excursia/db";
import { createCommands } from "../dealroom/dealroom.commands";
import { createDealRoomRepo } from "../dealroom/dealroom.repo";
import { createBadgesController } from "./badges.controller";
import { createBadgesRepo } from "./badges.repo";
import { badgesRoutes } from "./badges.routes";
import { createBadgesService } from "./badges.service";

export function badgesModule(deps: { db: Db; now: () => Date }) {
  const commands = createCommands({ repo: createDealRoomRepo(deps.db), now: deps.now });
  return badgesRoutes(createBadgesController(createBadgesService({ repo: createBadgesRepo(deps.db), commands })));
}
