/** The apply module, assembled: its repo and the shared runCommand → service → controller → routes. */
import type { Db } from "@excursia/db";
import type { Storage } from "../../storage/storage";
import { createCommands } from "../dealroom/dealroom.commands";
import { createDealRoomRepo } from "../dealroom/dealroom.repo";
import { createApplyController } from "./apply.controller";
import { createApplyRepo } from "./apply.repo";
import { applyRoutes } from "./apply.routes";
import { createApplyService } from "./apply.service";

export function applyModule(deps: { db: Db; now: () => Date; storage: Storage; uploadMaxBytes: number }) {
  const commands = createCommands({ repo: createDealRoomRepo(deps.db), now: deps.now });
  const service = createApplyService({ repo: createApplyRepo(deps.db), commands, storage: deps.storage, uploadMaxBytes: deps.uploadMaxBytes });
  return applyRoutes(createApplyController(service));
}
