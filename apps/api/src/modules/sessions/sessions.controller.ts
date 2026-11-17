/** Sessions' handlers: parse with the contracts, call the service, answer. Never cached: all of it is private. */
import type { RequestHandler } from "express";
import { AttendInput, CancelSessionInput, InviteInput, OutcomeInput, SessionInput, SessionParams, SessionsParams } from "@excursia/contracts/sessions";
import { sessionOf } from "../../http/session";
import type { SessionsService } from "./sessions.service";

const ip = (req: Parameters<RequestHandler>[0]) => req.ip ?? null;
const PRIVATE = { "Cache-Control": "private, no-store" };

export function createSessionsController(service: SessionsService) {
  return {
    board: (async (req, res) => {
      const { eventId } = SessionsParams.parse(req.params);
      res.set(PRIVATE).json(await service.board(sessionOf(res), eventId));
    }) satisfies RequestHandler,

    plan: (async (req, res) => {
      const { eventId } = SessionsParams.parse(req.params);
      res.set(PRIVATE).json(await service.plan(sessionOf(res), eventId, SessionInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    update: (async (req, res) => {
      const { eventId, sessionId } = SessionParams.parse(req.params);
      res.set(PRIVATE).json(await service.update(sessionOf(res), eventId, sessionId, SessionInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    inviteOptions: (async (req, res) => {
      const { eventId, sessionId } = SessionParams.parse(req.params);
      res.set(PRIVATE).json(await service.inviteOptions(sessionOf(res), eventId, sessionId));
    }) satisfies RequestHandler,

    invite: (async (req, res) => {
      const { eventId, sessionId } = SessionParams.parse(req.params);
      res.set(PRIVATE).json(await service.invite(sessionOf(res), eventId, sessionId, InviteInput.parse(req.body).appIds, ip(req)));
    }) satisfies RequestHandler,

    cancel: (async (req, res) => {
      const { eventId, sessionId } = SessionParams.parse(req.params);
      res.set(PRIVATE).json(await service.cancel(sessionOf(res), eventId, sessionId, CancelSessionInput.parse(req.body).reason, ip(req)));
    }) satisfies RequestHandler,

    attend: (async (req, res) => {
      const { eventId, sessionId } = SessionParams.parse(req.params);
      const b = AttendInput.parse(req.body);
      res.set(PRIVATE).json(await service.attend(sessionOf(res), eventId, sessionId, b.appId, b.present, ip(req)));
    }) satisfies RequestHandler,

    outcome: (async (req, res) => {
      const { eventId, sessionId } = SessionParams.parse(req.params);
      res.set(PRIVATE).json(await service.outcome(sessionOf(res), eventId, sessionId, OutcomeInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,
  };
}
export type SessionsController = ReturnType<typeof createSessionsController>;
