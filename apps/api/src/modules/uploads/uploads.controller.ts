/** Receiving an upload's bytes for the local storage (storage/local.ts): the signed token in the path is the permission. */
import { createReadStream } from "node:fs";
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

    /** A document, as an attachment that can never be shown inline or run, and never cached. */
    send: (async (req, res) => {
      let f: Awaited<ReturnType<LocalStorage["opening"]>>;
      try {
        f = await storage.opening(String(req.params.token));
      } catch (e) {
        if (e instanceof UploadRefused) throw new HttpError("not_found", e.message);
        throw e;
      }
      const ascii = f.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
      res.set({
        "Content-Type": f.contentType,
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      });
      await new Promise<void>((resolve, reject) => {
        createReadStream(f.path).on("error", reject).on("end", resolve).pipe(res);
      });
    }) satisfies RequestHandler,
  };
}
export type UploadsController = ReturnType<typeof createUploadsController>;
