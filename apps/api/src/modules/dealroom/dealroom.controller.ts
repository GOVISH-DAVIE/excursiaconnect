/**
 * The Deal Room's handlers: parse the path, query and body with the contracts, call the service, answer.
 */
import type { RequestHandler } from "express";
import { ApplicationsQuery, AssignReviewerInput, EventParams, type ApplicationSummary, type TeamView } from "@excursia/contracts/dealroom";
import { sessionOf } from "../../http/session";
import type { DealRoomService } from "./dealroom.service";

export function createDealRoomController(service: DealRoomService) {
  return {
    team: (async (req, res) => {
      const { eventId } = EventParams.parse(req.params);
      res.set("Cache-Control", "private, no-store").json((await service.team(sessionOf(res), eventId)) satisfies TeamView);
    }) satisfies RequestHandler,

    applications: (async (req, res) => {
      const { eventId } = EventParams.parse(req.params);
      const query = ApplicationsQuery.parse(req.query);
      res.set("Cache-Control", "private, no-store").json((await service.applications(sessionOf(res), eventId, query)) satisfies ApplicationSummary[]);
    }) satisfies RequestHandler,

    assignReviewer: (async (req, res) => {
      const { eventId } = EventParams.parse(req.params);
      const input = AssignReviewerInput.parse(req.body);
      res.json((await service.assignReviewer(sessionOf(res), eventId, input, req.ip ?? null)) satisfies ApplicationSummary[]);
    }) satisfies RequestHandler,
  };
}
export type DealRoomController = ReturnType<typeof createDealRoomController>;
