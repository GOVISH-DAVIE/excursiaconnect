/**
 * The health module, assembled: repo → service → controller → routes. app.ts mounts what this returns; tests
 * build any layer on its own with a stand-in for the one below.
 */
import type { Router } from "express";
import type { Db } from "@excursia/db";
import { createHealthController } from "./health.controller";
import { createHealthRepo } from "./health.repo";
import { healthRoutes } from "./health.routes";
import { createHealthService } from "./health.service";

export function healthModule(deps: { db: Db }): Router {
  return healthRoutes(createHealthController(createHealthService(createHealthRepo(deps.db))));
}
