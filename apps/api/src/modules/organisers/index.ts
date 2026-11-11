/** The organisers module, assembled: repo → service → controller → routes. Its service is shared with the platform module. */
import type { Db } from "@excursia/db";
import type { Config } from "../../config";
import type { Storage } from "../../storage/storage";
import type { AuthService } from "../auth/auth.service";
import { createOrganisersController } from "./organisers.controller";
import { createOrganisersRepo } from "./organisers.repo";
import { organisersRoutes } from "./organisers.routes";
import { createOrganisersService } from "./organisers.service";

export function organisersModule(deps: { db: Db; config: Config; auth: AuthService; storage: Storage; now: () => Date; uploadMaxBytes: number; allowUnscanned: boolean }) {
  const repo = createOrganisersRepo(deps.db);
  const service = createOrganisersService({ repo, auth: deps.auth, storage: deps.storage, now: deps.now, uploadMaxBytes: deps.uploadMaxBytes, allowUnscanned: deps.allowUnscanned });
  return { repo, service, routes: organisersRoutes(createOrganisersController(service, deps.config)) };
}
