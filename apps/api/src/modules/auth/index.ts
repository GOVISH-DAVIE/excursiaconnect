/**
 * The auth module, assembled: repo → service → controller → routes. The service is returned too, because the
 * session middleware every other route uses resolves cookies through it.
 */
import type { Db } from "@excursia/db";
import type { Config } from "../../config";
import type { Mailer } from "../../mail/mailer";
import { deriveKeys } from "../../security/secrets";
import { createAuthController } from "./auth.controller";
import { createAuthRepo } from "./auth.repo";
import { authRoutes } from "./auth.routes";
import { createAuthService } from "./auth.service";

export function authModule(deps: { db: Db; config: Config; mailer: Mailer; now?: () => Date }) {
  const service = createAuthService({ repo: createAuthRepo(deps.db), mailer: deps.mailer, keys: deriveKeys(deps.config.AUTH_SECRET), now: deps.now });
  return { service, routes: authRoutes(createAuthController(service, deps.config, deps.now)) };
}
