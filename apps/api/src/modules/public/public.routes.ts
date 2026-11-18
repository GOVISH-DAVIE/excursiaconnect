/** Public reads, under /v1/public: no session needed, GET only. */
import { Router } from "express";
import type { PublicController } from "./public.controller";

export function publicRoutes(c: PublicController): Router {
  const r = Router();
  r.get("/events/:slug", c.event);
  return r;
}
