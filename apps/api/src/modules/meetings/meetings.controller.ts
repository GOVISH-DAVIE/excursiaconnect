/** Scheduling's handlers: parse with the contracts, call the service, answer. Never cached: all of it is private. */
import type { RequestHandler } from "express";
import {
  AnswerMoveInput, AskMoveInput, AutoProposeInput, MeetingParams, MoveInput, MyMeetingParams, MyMeetingsParams, MySessionParams, ProposeInput, ReasonInput, ScheduleParams, SlotsQuery, TimesQuery,
} from "@excursia/contracts/meetings";
import { RespondSessionInput } from "@excursia/contracts/sessions";
import { sessionOf } from "../../http/session";
import type { MeetingsService } from "./meetings.service";

const ip = (req: Parameters<RequestHandler>[0]) => req.ip ?? null;
const PRIVATE = { "Cache-Control": "private, no-store" };

export function createMeetingsController(service: MeetingsService) {
  return {
    /* ----- the team, under /v1/meetings/:eventId ----- */

    schedule: (async (req, res) => {
      const { eventId } = ScheduleParams.parse(req.params);
      res.set(PRIVATE).json(await service.schedule(sessionOf(res), eventId));
    }) satisfies RequestHandler,

    slots: (async (req, res) => {
      const { eventId } = ScheduleParams.parse(req.params);
      res.set(PRIVATE).json(await service.slots(sessionOf(res), eventId, SlotsQuery.parse(req.query)));
    }) satisfies RequestHandler,

    propose: (async (req, res) => {
      const { eventId } = ScheduleParams.parse(req.params);
      res.set(PRIVATE).json(await service.propose(sessionOf(res), eventId, ProposeInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    autoPropose: (async (req, res) => {
      const { eventId } = ScheduleParams.parse(req.params);
      res.set(PRIVATE).json(await service.autoPropose(sessionOf(res), eventId, AutoProposeInput.parse(req.body ?? {}).limit, ip(req)));
    }) satisfies RequestHandler,

    move: (async (req, res) => {
      const { eventId, meetingId } = MeetingParams.parse(req.params);
      res.set(PRIVATE).json(await service.move(sessionOf(res), eventId, meetingId, MoveInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    cancel: (async (req, res) => {
      const { eventId, meetingId } = MeetingParams.parse(req.params);
      res.set(PRIVATE).json(await service.cancel(sessionOf(res), eventId, meetingId, ReasonInput.parse(req.body).reason, ip(req)));
    }) satisfies RequestHandler,

    acceptChange: (async (req, res) => {
      const { eventId, meetingId } = MeetingParams.parse(req.params);
      res.set(PRIVATE).json(await service.acceptChange(sessionOf(res), eventId, meetingId, ip(req)));
    }) satisfies RequestHandler,

    declineChange: (async (req, res) => {
      const { eventId, meetingId } = MeetingParams.parse(req.params);
      res.set(PRIVATE).json(await service.declineChange(sessionOf(res), eventId, meetingId, ReasonInput.parse(req.body).reason, ip(req)));
    }) satisfies RequestHandler,

    /* ----- the participant, under /v1/my-meetings/:slug ----- */

    mine: (async (req, res) => {
      const { slug } = MyMeetingsParams.parse(req.params);
      res.set(PRIVATE).json(await service.mine(sessionOf(res), slug));
    }) satisfies RequestHandler,

    confirm: (async (req, res) => {
      const { slug, meetingId } = MyMeetingParams.parse(req.params);
      res.set(PRIVATE).json(await service.confirm(sessionOf(res), slug, meetingId, ip(req)));
    }) satisfies RequestHandler,

    times: (async (req, res) => {
      const { slug, meetingId } = MyMeetingParams.parse(req.params);
      res.set(PRIVATE).json(await service.times(sessionOf(res), slug, meetingId, TimesQuery.parse(req.query).day));
    }) satisfies RequestHandler,

    askMove: (async (req, res) => {
      const { slug, meetingId } = MyMeetingParams.parse(req.params);
      res.set(PRIVATE).json(await service.askMove(sessionOf(res), slug, meetingId, AskMoveInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    answerMove: (async (req, res) => {
      const { slug, meetingId } = MyMeetingParams.parse(req.params);
      res.set(PRIVATE).json(await service.answerMove(sessionOf(res), slug, meetingId, AnswerMoveInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    respondSession: (async (req, res) => {
      const { slug, sessionId } = MySessionParams.parse(req.params);
      res.set(PRIVATE).json(await service.respondSession(sessionOf(res), slug, sessionId, RespondSessionInput.parse(req.body).answer, ip(req)));
    }) satisfies RequestHandler,

    invite: (async (req, res) => {
      const { slug, meetingId } = MyMeetingParams.parse(req.params);
      const f = await service.invite(sessionOf(res), slug, meetingId);
      res
        .set({ ...PRIVATE, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${f.filename}"` })
        .send(f.body);
    }) satisfies RequestHandler,
  };
}
export type MeetingsController = ReturnType<typeof createMeetingsController>;
