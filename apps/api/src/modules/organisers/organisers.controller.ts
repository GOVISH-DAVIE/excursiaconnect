/**
 * Organisers' and events' handlers: parse with the contracts, call the service, answer. Signing up sets the
 * session cookie like a staff password step does; the token never goes in a body.
 */
import type { Request, RequestHandler } from "express";
import { KycDocUpload } from "@excursia/contracts/onboarding";
import {
  DpaSign,
  EventIdParams,
  EventInput,
  KycDocParams,
  KycInput,
  OrganiserParams,
  OrganiserSignup,
  SignupCodeRequest,
  type EventView,
  type OrganiserView,
} from "@excursia/contracts/onboarding";
import type { SignInNext } from "@excursia/contracts/auth";
import type { Config } from "../../config";
import { sessionOf, setSessionCookie } from "../../http/session";
import type { OrganisersService } from "./organisers.service";

const ip = (req: Request) => req.ip ?? null;
const meta = (req: Request) => ({ ip: ip(req), userAgent: req.get("user-agent") ?? null });
const PRIVATE = "private, no-store";

export function createOrganisersController(service: OrganisersService, config: Config, now: () => Date = () => new Date()) {
  return {
    signupCode: (async (req, res) => {
      const { email } = SignupCodeRequest.parse(req.body);
      await service.requestSignupCode(email, meta(req));
      res.status(202).end();
    }) satisfies RequestHandler,

    signUp: (async (req, res) => {
      const { next, skipUntil, ...issued } = await service.signUp(OrganiserSignup.parse(req.body), meta(req));
      setSessionCookie(res, config, issued, now());
      res.status(201).json({ next, ...(skipUntil ? { skipUntil } : {}) } as SignInNext);
    }) satisfies RequestHandler,

    mine: (async (_req, res) => {
      res.set("Cache-Control", PRIVATE).json((await service.mine(sessionOf(res))) satisfies OrganiserView[]);
    }) satisfies RequestHandler,

    organiser: (async (req, res) => {
      const { organiserId } = OrganiserParams.parse(req.params);
      res.set("Cache-Control", PRIVATE).json(await service.organiser(sessionOf(res), organiserId));
    }) satisfies RequestHandler,

    saveKyc: (async (req, res) => {
      const { organiserId } = OrganiserParams.parse(req.params);
      res.json(await service.saveKyc(sessionOf(res), organiserId, KycInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    signDpa: (async (req, res) => {
      const { organiserId } = OrganiserParams.parse(req.params);
      res.json(await service.signDpa(sessionOf(res), organiserId, DpaSign.parse(req.body).by, ip(req)));
    }) satisfies RequestHandler,

    submitKyc: (async (req, res) => {
      const { organiserId } = OrganiserParams.parse(req.params);
      res.json(await service.submitKyc(sessionOf(res), organiserId, ip(req)));
    }) satisfies RequestHandler,

    startKycDoc: (async (req, res) => {
      const { organiserId } = OrganiserParams.parse(req.params);
      res.set("Cache-Control", PRIVATE).status(201).json(await service.startKycDoc(sessionOf(res), organiserId, KycDocUpload.parse(req.body)));
    }) satisfies RequestHandler,

    completeKycDoc: (async (req, res) => {
      const { organiserId, fileId } = KycDocParams.parse(req.params);
      res.json(await service.completeKycDoc(sessionOf(res), organiserId, fileId, ip(req)));
    }) satisfies RequestHandler,

    removeKycDoc: (async (req, res) => {
      const { organiserId, fileId } = KycDocParams.parse(req.params);
      res.json(await service.removeKycDoc(sessionOf(res), organiserId, fileId, ip(req)));
    }) satisfies RequestHandler,

    kycDocLink: (async (req, res) => {
      const { organiserId, fileId } = KycDocParams.parse(req.params);
      res.set("Cache-Control", PRIVATE).json(await service.kycDocLink(sessionOf(res), organiserId, fileId, ip(req)));
    }) satisfies RequestHandler,

    createEvent: (async (req, res) => {
      const { organiserId } = OrganiserParams.parse(req.params);
      res.status(201).json((await service.createEvent(sessionOf(res), organiserId, EventInput.parse(req.body), ip(req))) satisfies EventView);
    }) satisfies RequestHandler,

    event: (async (req, res) => {
      const { eventId } = EventIdParams.parse(req.params);
      res.set("Cache-Control", PRIVATE).json(await service.event(sessionOf(res), eventId));
    }) satisfies RequestHandler,

    saveEvent: (async (req, res) => {
      const { eventId } = EventIdParams.parse(req.params);
      res.json(await service.saveEvent(sessionOf(res), eventId, EventInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    submitEvent: (async (req, res) => {
      const { eventId } = EventIdParams.parse(req.params);
      res.json(await service.submitEvent(sessionOf(res), eventId, ip(req)));
    }) satisfies RequestHandler,

    publishEvent: (async (req, res) => {
      const { eventId } = EventIdParams.parse(req.params);
      res.json(await service.publishEvent(sessionOf(res), eventId, ip(req)));
    }) satisfies RequestHandler,
  };
}
export type OrganisersController = ReturnType<typeof createOrganisersController>;
