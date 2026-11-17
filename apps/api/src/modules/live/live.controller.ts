/**
 * The live board's handlers. The board answers a poll with 304 when its version hasn't changed, so phones polling
 * every 3 seconds cost a fingerprint query, not a load of the Deal Room.
 */
import type { RequestHandler } from "express";
import { LiveMeetingParams, LiveParams, LiveQuery, OutcomeEntry, RefillInput } from "@excursia/contracts/live";
import { sessionOf } from "../../http/session";
import type { LiveService } from "./live.service";

const ip = (req: Parameters<RequestHandler>[0]) => req.ip ?? null;
const PRIVATE = { "Cache-Control": "private, no-cache" };
const tag = (v: string) => `W/"${v}"`;

export function createLiveController(service: LiveService) {
  return {
    board: (async (req, res) => {
      const { eventId } = LiveParams.parse(req.params);
      const { day } = LiveQuery.parse(req.query);
      const seen = req.get("If-None-Match");
      if (seen) {
        const v = await service.version(sessionOf(res), eventId, day);
        if (seen === tag(v)) {
          res.set({ ...PRIVATE, ETag: tag(v) }).status(304).end();
          return;
        }
      }
      const board = await service.board(sessionOf(res), eventId, day);
      res.set({ ...PRIVATE, ETag: tag(board.version) }).json(board);
    }) satisfies RequestHandler,

    start: (async (req, res) => {
      const { eventId, meetingId } = LiveMeetingParams.parse(req.params);
      const board = await service.start(sessionOf(res), eventId, meetingId, LiveQuery.parse(req.query).day, ip(req));
      res.set({ ...PRIVATE, ETag: tag(board.version) }).json(board);
    }) satisfies RequestHandler,

    outcome: (async (req, res) => {
      const { eventId, meetingId } = LiveMeetingParams.parse(req.params);
      const board = await service.outcome(sessionOf(res), eventId, meetingId, OutcomeEntry.parse(req.body), LiveQuery.parse(req.query).day, ip(req));
      res.set({ ...PRIVATE, ETag: tag(board.version) }).json(board);
    }) satisfies RequestHandler,

    refill: (async (req, res) => {
      const { eventId, meetingId } = LiveMeetingParams.parse(req.params);
      const board = await service.refill(sessionOf(res), eventId, meetingId, RefillInput.parse(req.body).matchId, LiveQuery.parse(req.query).day, ip(req));
      res.set({ ...PRIVATE, ETag: tag(board.version) }).json(board);
    }) satisfies RequestHandler,
  };
}
export type LiveController = ReturnType<typeof createLiveController>;
