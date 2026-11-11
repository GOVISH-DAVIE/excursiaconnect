/** Algotech's module, assembled on the organisers module's repo and service, and the Deal Room's runCommand. */
import type { Db } from "@excursia/db";
import { createCommands } from "../dealroom/dealroom.commands";
import { createDealRoomRepo } from "../dealroom/dealroom.repo";
import type { OrganisersRepo } from "../organisers/organisers.repo";
import type { OrganisersService } from "../organisers/organisers.service";
import { createPlatformController } from "./platform.controller";
import { platformRoutes } from "./platform.routes";
import { createPlatformService } from "./platform.service";

export function platformModule(deps: { db: Db; repo: OrganisersRepo; organisers: OrganisersService; now: () => Date }) {
  const commands = createCommands({ repo: createDealRoomRepo(deps.db), now: deps.now });
  return platformRoutes(createPlatformController(createPlatformService({ repo: deps.repo, organisers: deps.organisers, commands, now: deps.now })));
}
