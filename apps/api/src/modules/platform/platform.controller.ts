/** Algotech's handlers: parse with the contracts, call the service, answer. */
import type { Request, RequestHandler } from "express";
import { DealRoomStaffInput, EventDecisionInput, EventIdParams, KycDecision, OrganiserParams, type AdminQueue } from "@excursia/contracts/onboarding";
import { sessionOf } from "../../http/session";
import type { PlatformService } from "./platform.service";

const ip = (req: Request) => req.ip ?? null;

export function createPlatformController(service: PlatformService) {
  return {
    queue: (async (_req, res) => {
      res.set("Cache-Control", "private, no-store").json((await service.queue(sessionOf(res))) satisfies AdminQueue);
    }) satisfies RequestHandler,

    decideKyc: (async (req, res) => {
      const { organiserId } = OrganiserParams.parse(req.params);
      res.json(await service.decideKyc(sessionOf(res), organiserId, KycDecision.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    decideEvent: (async (req, res) => {
      const { eventId } = EventIdParams.parse(req.params);
      res.json(await service.decideEvent(sessionOf(res), eventId, EventDecisionInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    addStaff: (async (req, res) => {
      const { eventId } = EventIdParams.parse(req.params);
      res.status(201).json(await service.addStaff(sessionOf(res), eventId, DealRoomStaffInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,
  };
}
export type PlatformController = ReturnType<typeof createPlatformController>;
