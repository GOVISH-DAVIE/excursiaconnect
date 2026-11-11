/** The Deal Room module, assembled: repo → commands and service → controller → routes. */
import type { Db } from "@excursia/db";
import { createCommands } from "./dealroom.commands";
import { createDealRoomController } from "./dealroom.controller";
import { createDealRoomRepo } from "./dealroom.repo";
import { dealRoomRoutes } from "./dealroom.routes";
import { createDealRoomService } from "./dealroom.service";

export function dealRoomModule(deps: { db: Db; now: () => Date }) {
  const repo = createDealRoomRepo(deps.db);
  return dealRoomRoutes(createDealRoomController(createDealRoomService({ repo, commands: createCommands({ repo, now: deps.now }) })));
}
