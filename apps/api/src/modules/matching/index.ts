/** The matching module, assembled: its repo and the Deal Room's, runCommand → service → controller → routes. */
import type { Db } from "@excursia/db";
import type { Storage } from "../../storage/storage";
import { createCommands } from "../dealroom/dealroom.commands";
import { createDealRoomRepo } from "../dealroom/dealroom.repo";
import { createMatchingController } from "./matching.controller";
import { createMatchingRepo } from "./matching.repo";
import { introductionsRoutes, matchingRoutes } from "./matching.routes";
import { createMatchingService } from "./matching.service";

export function matchingModule(deps: { db: Db; now: () => Date; storage: Storage; shareKey: Buffer; allowUnscanned: boolean }) {
  const drRepo = createDealRoomRepo(deps.db);
  const commands = createCommands({ repo: drRepo, now: deps.now });
  const controller = createMatchingController(
    createMatchingService({ repo: createMatchingRepo(deps.db), drRepo, commands, storage: deps.storage, shareKey: deps.shareKey, now: deps.now, allowUnscanned: deps.allowUnscanned }),
  );
  return { team: matchingRoutes(controller), participant: introductionsRoutes(controller) };
}
