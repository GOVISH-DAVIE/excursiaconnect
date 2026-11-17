/** The scheduling module, assembled: its repo and the Deal Room's, runCommand → service → controller → routes. */
import type { Db } from "@excursia/db";
import { createCommands } from "../dealroom/dealroom.commands";
import { createDealRoomRepo } from "../dealroom/dealroom.repo";
import { createMeetingsController } from "./meetings.controller";
import { createMeetingsRepo } from "./meetings.repo";
import { meetingsRoutes, myMeetingsRoutes } from "./meetings.routes";
import { createMeetingJobs, createMeetingsService } from "./meetings.service";

export function meetingsModule(deps: { db: Db; now: () => Date }) {
  const drRepo = createDealRoomRepo(deps.db);
  const controller = createMeetingsController(createMeetingsService({ repo: createMeetingsRepo(deps.db), drRepo, commands: createCommands({ repo: drRepo, now: deps.now }), now: deps.now }));
  return { team: meetingsRoutes(controller), participant: myMeetingsRoutes(controller) };
}

/** The worker's round: lapsed proposals told once, and the reminders before each confirmed meeting. */
export function meetingJobs(deps: { db: Db; now: () => Date }) {
  const drRepo = createDealRoomRepo(deps.db);
  return createMeetingJobs({ repo: createMeetingsRepo(deps.db), drRepo, commands: createCommands({ repo: drRepo, now: deps.now }), now: deps.now });
}
