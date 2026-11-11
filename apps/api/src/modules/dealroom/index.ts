/** The Deal Room module, assembled: repo → service → controller → routes. */
import type { Db } from "@excursia/db";
import { createDealRoomController } from "./dealroom.controller";
import { createDealRoomRepo } from "./dealroom.repo";
import { dealRoomRoutes } from "./dealroom.routes";
import { createDealRoomService } from "./dealroom.service";

export function dealRoomModule(deps: { db: Db; now?: () => Date }) {
  return dealRoomRoutes(createDealRoomController(createDealRoomService({ repo: createDealRoomRepo(deps.db), now: deps.now })));
}
