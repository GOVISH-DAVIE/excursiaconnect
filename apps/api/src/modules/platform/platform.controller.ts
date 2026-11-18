/** Algotech's handlers: parse with the contracts, call the service, answer. */
import type { Request, RequestHandler } from "express";
import { AdminInvite, AdminLevel, DealRoomStaffChange, OpenOrganiser, RateCard, StaffParams, DealRoomStaffInput, EventDecisionInput, EventIdParams, KycDecision, OrganiserParams, UserParams, type AdminQueue } from "@excursia/contracts/onboarding";
import { sessionOf } from "../../http/session";
import type { PlatformService } from "./platform.service";

const ip = (req: Request) => req.ip ?? null;

export function createPlatformController(service: PlatformService) {
  return {
    queue: (async (_req, res) => {
      res.set("Cache-Control", "private, no-store").json((await service.queue(sessionOf(res))) satisfies AdminQueue);
    }) satisfies RequestHandler,

    team: (async (_req, res) => {
      res.set("Cache-Control", "private, no-store").json(await service.team(sessionOf(res)));
    }) satisfies RequestHandler,

    inviteAdmin: (async (req, res) => {
      res.status(201).json(await service.inviteAdmin(sessionOf(res), AdminInvite.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    setAdminLevel: (async (req, res) => {
      const { userId } = UserParams.parse(req.params);
      res.json(await service.setAdminLevel(sessionOf(res), userId, AdminLevel.parse(req.body).superAdmin, ip(req)));
    }) satisfies RequestHandler,

    removeAdmin: (async (req, res) => {
      const { userId } = UserParams.parse(req.params);
      res.json(await service.removeAdmin(sessionOf(res), userId, ip(req)));
    }) satisfies RequestHandler,

    openOrganiser: (async (req, res) => {
      res.status(201).json(await service.openOrganiser(sessionOf(res), OpenOrganiser.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    setRateCard: (async (req, res) => {
      const { organiserId } = OrganiserParams.parse(req.params);
      res.json(await service.setRateCard(sessionOf(res), organiserId, RateCard.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    decideKyc: (async (req, res) => {
      const { organiserId } = OrganiserParams.parse(req.params);
      res.json(await service.decideKyc(sessionOf(res), organiserId, KycDecision.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    decideEvent: (async (req, res) => {
      const { eventId } = EventIdParams.parse(req.params);
      res.json(await service.decideEvent(sessionOf(res), eventId, EventDecisionInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    changeStaff: (async (req, res) => {
      const { eventId, staffId } = StaffParams.parse(req.params);
      res.json(await service.changeStaff(sessionOf(res), eventId, staffId, DealRoomStaffChange.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    removeStaff: (async (req, res) => {
      const { eventId, staffId } = StaffParams.parse(req.params);
      res.json(await service.removeStaff(sessionOf(res), eventId, staffId, ip(req)));
    }) satisfies RequestHandler,

    addStaff: (async (req, res) => {
      const { eventId } = EventIdParams.parse(req.params);
      res.status(201).json(await service.addStaff(sessionOf(res), eventId, DealRoomStaffInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,
  };
}
export type PlatformController = ReturnType<typeof createPlatformController>;
