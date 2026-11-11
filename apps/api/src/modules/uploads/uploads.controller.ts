/** Receiving an upload's bytes for the local storage (storage/local.ts): the signed token in the path is the permission. */
import type { RequestHandler } from "express";
import { HttpError } from "../../http/errors";
import { UploadRefused, type LocalStorage } from "../../storage/local";

export function createUploadsController(storage: LocalStorage) {
  return {
    receive: (async (req, res) => {
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      try {
        await storage.receive(String(req.params.token), req.get("content-type") ?? undefined, body);
      } catch (e) {
        if (e instanceof UploadRefused) throw new HttpError("bad_request", e.message);
        throw e;
      }
      res.status(204).end();
    }) satisfies RequestHandler,
  };
}
export type UploadsController = ReturnType<typeof createUploadsController>;
