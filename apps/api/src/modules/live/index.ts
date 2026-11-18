/** The live board module, assembled; and the worker's 19:00 report round. */
import type { Db } from "@excursia/db";
import { createCommands } from "../dealroom/dealroom.commands";
import { createDealRoomRepo } from "../dealroom/dealroom.repo";
import { createLiveController } from "./live.controller";
import { createLiveRepo } from "./live.repo";
import { liveRoutes } from "./live.routes";
import { createDailyReports, createLiveService } from "./live.service";

export function liveModule(deps: { db: Db; now: () => Date }) {
  const drRepo = createDealRoomRepo(deps.db);
  return liveRoutes(createLiveController(createLiveService({ repo: createLiveRepo(deps.db), drRepo, commands: createCommands({ repo: drRepo, now: deps.now }), now: deps.now })));
}

/** The worker's round: each summit evening's report to the lead at 19:00, once. */
export function dailyReports(deps: { db: Db; now: () => Date }) {
  const drRepo = createDealRoomRepo(deps.db);
  const events = async () => (await deps.db.drConfig.findMany({ select: { eventId: true } })).map((c) => c.eventId);
  return createDailyReports({ drRepo, commands: createCommands({ repo: drRepo, now: deps.now }), now: deps.now, events });
}
