/** Matching's handlers: parse with the contracts, call the service, answer. Never cached: all of it is private. */
import type { RequestHandler } from "express";
import { SlugParams } from "@excursia/contracts/apply";
import {
  BriefInput, CandidateParams, ConsentInput, DecideMatchInput, IntroDocParams, IntroParams, IntroduceInput, MatchingParams, MatchParams, OpenDocInput, RespondIntroInput,
} from "@excursia/contracts/matching";
import { sessionOf } from "../../http/session";
import type { MatchingService } from "./matching.service";

const ip = (req: Parameters<RequestHandler>[0]) => req.ip ?? null;
const PRIVATE = { "Cache-Control": "private, no-store" };

export function createMatchingController(service: MatchingService) {
  return {
    /* ----- the team, under /v1/matching/:eventId ----- */

    board: (async (req, res) => {
      const { eventId } = MatchingParams.parse(req.params);
      res.set(PRIVATE).json(await service.board(sessionOf(res), eventId));
    }) satisfies RequestHandler,

    candidates: (async (req, res) => {
      const { eventId, appId } = CandidateParams.parse(req.params);
      res.set(PRIVATE).json(await service.candidates(sessionOf(res), eventId, appId));
    }) satisfies RequestHandler,

    decide: (async (req, res) => {
      const { eventId } = MatchingParams.parse(req.params);
      res.set(PRIVATE).json(await service.decide(sessionOf(res), eventId, DecideMatchInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    view: (async (req, res) => {
      const { eventId, matchId } = MatchParams.parse(req.params);
      res.set(PRIVATE).json(await service.view(sessionOf(res), eventId, matchId));
    }) satisfies RequestHandler,

    brief: (async (req, res) => {
      const { eventId, matchId } = MatchParams.parse(req.params);
      res.set(PRIVATE).json(await service.brief(sessionOf(res), eventId, matchId, BriefInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    introduce: (async (req, res) => {
      const { eventId, matchId } = MatchParams.parse(req.params);
      res.set(PRIVATE).json(await service.introduce(sessionOf(res), eventId, matchId, IntroduceInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    /* ----- the participant, under /v1/introductions/:slug ----- */

    mine: (async (req, res) => {
      const { slug } = SlugParams.parse(req.params);
      res.set(PRIVATE).json(await service.introductions(sessionOf(res), slug));
    }) satisfies RequestHandler,

    respond: (async (req, res) => {
      const { slug, matchId } = IntroParams.parse(req.params);
      res.set(PRIVATE).json(await service.respond(sessionOf(res), slug, matchId, RespondIntroInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    consent: (async (req, res) => {
      const { slug, matchId, docId } = IntroDocParams.parse(req.params);
      res.set(PRIVATE).json(await service.consent(sessionOf(res), slug, matchId, docId, ConsentInput.parse(req.body).granted, ip(req)));
    }) satisfies RequestHandler,

    profile: (async (req, res) => {
      const { slug, matchId } = IntroParams.parse(req.params);
      res.set(PRIVATE).json(await service.profile(sessionOf(res), slug, matchId, ip(req)));
    }) satisfies RequestHandler,

    openDocument: (async (req, res) => {
      const { slug, matchId, docId } = IntroDocParams.parse(req.params);
      res.set(PRIVATE).json(await service.openDocument(sessionOf(res), slug, matchId, docId, OpenDocInput.parse(req.body).action, ip(req)));
    }) satisfies RequestHandler,

    /** The stamped copy behind a two-minute link. Shown in the browser's own viewer, or downloaded. */
    shared: (async (req, res) => {
      const f = await service.shared(String(req.params.token));
      const ascii = f.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
      res.set({
        ...PRIVATE,
        "Content-Type": f.contentType,
        "Content-Disposition": `${f.disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        // the PDF is the whole page: nothing else loads with it, and it can't be framed
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        "X-Robots-Tag": "noindex",
      });
      res.end(Buffer.from(f.bytes));
    }) satisfies RequestHandler,
  };
}
export type MatchingController = ReturnType<typeof createMatchingController>;
