/** The Deal Room module, assembled: repo → commands and service → controller → routes. */
import type { Db } from "@excursia/db";
import type { Storage } from "../../storage/storage";
import { createCommands } from "./dealroom.commands";
import { createDealRoomController } from "./dealroom.controller";
import { createDealRoomRepo } from "./dealroom.repo";
import { dealRoomRoutes } from "./dealroom.routes";
import { createDealRoomService } from "./dealroom.service";

export function dealRoomModule(deps: { db: Db; now: () => Date; storage: Storage; allowUnscanned: boolean }) {
  const repo = createDealRoomRepo(deps.db);
  const commands = createCommands({ repo, now: deps.now });
  return dealRoomRoutes(createDealRoomController(createDealRoomService({ repo, commands, storage: deps.storage, now: deps.now, allowUnscanned: deps.allowUnscanned })));
}
