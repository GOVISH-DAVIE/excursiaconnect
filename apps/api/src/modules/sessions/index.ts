/** The sessions module, assembled: the Deal Room's repo, runCommand → service → controller → routes. */
import type { Db } from "@excursia/db";
import { createCommands } from "../dealroom/dealroom.commands";
import { createDealRoomRepo } from "../dealroom/dealroom.repo";
import { createSessionsController } from "./sessions.controller";
import { sessionsRoutes } from "./sessions.routes";
import { createSessionsService } from "./sessions.service";

export function sessionsModule(deps: { db: Db; now: () => Date }) {
  const drRepo = createDealRoomRepo(deps.db);
  return sessionsRoutes(createSessionsController(createSessionsService({ drRepo, commands: createCommands({ repo: drRepo, now: deps.now }), now: deps.now })));
}
