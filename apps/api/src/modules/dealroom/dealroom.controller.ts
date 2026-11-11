/**
 * The Deal Room's handlers: parse the path, query and body with the contracts, call the service, answer.
 */
import type { RequestHandler } from "express";
import { ApplicationsQuery, AssignReviewerInput, EventParams, type ApplicationSummary, type TeamView } from "@excursia/contracts/dealroom";
import { AppIdParams, DocParams, RequestInfoInput, RfiExpiryInput, ScoreInput } from "@excursia/contracts/review";
import { DealRoomSettingsInput } from "@excursia/contracts/onboarding";
import { sessionOf } from "../../http/session";
import type { DealRoomService } from "./dealroom.service";

export function createDealRoomController(service: DealRoomService) {
  const ip = (req: Parameters<RequestHandler>[0]) => req.ip ?? null;
  return {
    review: (async (req, res) => {
      const { eventId, appId } = AppIdParams.parse(req.params);
      res.set("Cache-Control", "private, no-store").json(await service.review(sessionOf(res), eventId, appId));
    }) satisfies RequestHandler,

    startReview: (async (req, res) => {
      const { eventId, appId } = AppIdParams.parse(req.params);
      res.json(await service.startReview(sessionOf(res), eventId, appId, ip(req)));
    }) satisfies RequestHandler,

    score: (async (req, res) => {
      const { eventId, appId } = AppIdParams.parse(req.params);
      res.json(await service.score(sessionOf(res), eventId, appId, ScoreInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    requestInfo: (async (req, res) => {
      const { eventId, appId } = AppIdParams.parse(req.params);
      res.json(await service.requestInfo(sessionOf(res), eventId, appId, RequestInfoInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    rfiExpiry: (async (req, res) => {
      const { eventId, appId } = AppIdParams.parse(req.params);
      res.json(await service.rfiExpiry(sessionOf(res), eventId, appId, RfiExpiryInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    documentLink: (async (req, res) => {
      const { eventId, appId, docId } = DocParams.parse(req.params);
      res.set("Cache-Control", "private, no-store").json(await service.documentLink(sessionOf(res), eventId, appId, docId, ip(req)));
    }) satisfies RequestHandler,

    settings: (async (req, res) => {
      const { eventId } = EventParams.parse(req.params);
      res.set("Cache-Control", "private, no-store").json(await service.settings(sessionOf(res), eventId));
    }) satisfies RequestHandler,

    saveSettings: (async (req, res) => {
      const { eventId } = EventParams.parse(req.params);
      res.json(await service.saveSettings(sessionOf(res), eventId, DealRoomSettingsInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    messages: (async (req, res) => {
      const { eventId } = EventParams.parse(req.params);
      res.set("Cache-Control", "private, no-store").json(await service.messages(sessionOf(res), eventId));
    }) satisfies RequestHandler,

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
