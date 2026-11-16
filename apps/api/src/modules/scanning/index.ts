/** The scanning module, assembled: repo → service → controller → routes. */
import type { Db } from "@excursia/db";
import type { Config } from "../../config";
import type { AuthService } from "../auth/auth.service";
import { createScanningController } from "./scanning.controller";
import { createScanningRepo } from "./scanning.repo";
import { scanningRoutes } from "./scanning.routes";
import { createScanningService } from "./scanning.service";

export function scanningModule(deps: { db: Db; config: Config; auth: AuthService; now: () => Date }) {
  const service = createScanningService({ repo: createScanningRepo(deps.db), auth: deps.auth, now: deps.now });
  return scanningRoutes(createScanningController(service, deps.config));
}
