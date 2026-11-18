/**
 * PUT /v1/uploads/:token: the bytes of one upload, to the local storage. Raw bodies up to the upload limit are
 * accepted here and nowhere else (every other route takes JSON of 100 kB at most).
 */
import express, { Router } from "express";
import type { UploadsController } from "./uploads.controller";

export function uploadsRoutes(c: UploadsController, maxBytes: number): Router {
  const r = Router();
  r.put("/:token", express.raw({ type: () => true, limit: maxBytes }), c.receive);
  return r;
}

/** GET /v1/files/:token: one document, through a two-minute signed link. */
export function filesRoutes(c: UploadsController): Router {
  const r = Router();
  r.get("/:token", c.send);
  return r;
}
