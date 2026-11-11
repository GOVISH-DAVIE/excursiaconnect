/** Applying's handlers: parse with the contracts, call the service, answer. */
import type { RequestHandler } from "express";
import { AppParams, FileParams, RespondInput, SaveDraft, SlugParams, StartApplication, SubmitApplication, UploadRequest } from "@excursia/contracts/apply";
import { sessionOf } from "../../http/session";
import type { ApplyService } from "./apply.service";

const ip = (req: Parameters<RequestHandler>[0]) => req.ip ?? null;

export function createApplyController(service: ApplyService) {
  return {
    form: (async (req, res) => {
      const { slug } = SlugParams.parse(req.params);
      // public and the same for everyone: a short cache is fine
      res.set("Cache-Control", "public, max-age=60").json(await service.form(slug));
    }) satisfies RequestHandler,

    mine: (async (req, res) => {
      const { slug } = SlugParams.parse(req.params);
      res.set("Cache-Control", "private, no-store").json(await service.mine(sessionOf(res), slug));
    }) satisfies RequestHandler,

    get: (async (req, res) => {
      const { slug, appId } = AppParams.parse(req.params);
      res.set("Cache-Control", "private, no-store").json(await service.get(sessionOf(res), slug, appId));
    }) satisfies RequestHandler,

    start: (async (req, res) => {
      const { slug } = SlugParams.parse(req.params);
      res.status(201).json(await service.start(sessionOf(res), slug, StartApplication.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    save: (async (req, res) => {
      const { slug, appId } = AppParams.parse(req.params);
      const { changes } = SaveDraft.parse(req.body);
      res.json(await service.save(sessionOf(res), slug, appId, changes, ip(req)));
    }) satisfies RequestHandler,

    submit: (async (req, res) => {
      const { slug, appId } = AppParams.parse(req.params);
      const { changes } = SubmitApplication.parse(req.body ?? {});
      res.json(await service.submit(sessionOf(res), slug, appId, changes, ip(req)));
    }) satisfies RequestHandler,

    respond: (async (req, res) => {
      const { slug, appId } = AppParams.parse(req.params);
      res.json(await service.respond(sessionOf(res), slug, appId, RespondInput.parse(req.body), ip(req)));
    }) satisfies RequestHandler,

    startUpload: (async (req, res) => {
      const { slug, appId } = AppParams.parse(req.params);
      res.status(201).json(await service.startUpload(sessionOf(res), slug, appId, UploadRequest.parse(req.body)));
    }) satisfies RequestHandler,

    completeUpload: (async (req, res) => {
      const { slug, appId, fileId } = FileParams.parse(req.params);
      res.json(await service.completeUpload(sessionOf(res), slug, appId, fileId, ip(req)));
    }) satisfies RequestHandler,
  };
}
export type ApplyController = ReturnType<typeof createApplyController>;
