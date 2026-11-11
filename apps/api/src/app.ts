/**
 * The Express app, built from its dependencies so tests can make one against the test database without starting
 * a server. server.ts makes the real one. Each module under src/modules is layered (docs/architecture.md):
 *   <module>.routes.ts      paths and middleware, pointing at controller handlers
 *   <module>.controller.ts  HTTP in and out: parse with @excursia/contracts, call the service, respond
 *   <module>.service.ts     the use cases: run the rules from @excursia/domain inside a transaction
 *   <module>.repo.ts        the only code that touches @excursia/db
 * and its index.ts assembles them; this file only mounts what each module returns.
 */
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Db } from "@excursia/db";
import { rulesClock } from "./clock";
import type { Config } from "./config";
import { errorHandler, notFound } from "./http/errors";
import { originCheck } from "./http/origin";
import { loadSession } from "./http/session";
import { mailerFor, type Mailer } from "./mail/mailer";
import { applyModule } from "./modules/apply";
import { authModule } from "./modules/auth";
import { organisersModule } from "./modules/organisers";
import { platformModule } from "./modules/platform";
import { publicModule } from "./modules/public";
import { dealRoomModule } from "./modules/dealroom";
import { healthModule } from "./modules/health";
import { uploadsModule } from "./modules/uploads";
import { deriveKeys } from "./security/secrets";
import { createLocalStorage, type LocalStorage } from "./storage/local";

export type AppDeps = {
  config: Config;
  db: Db;
  /** How one-time codes are emailed; config.MAIL_TRANSPORT by default. */
  mailer?: Mailer;
  /** Where uploads are kept; a local folder (STORAGE_DIR, else data/uploads in the repository) by default. */
  storage?: LocalStorage;
  /** The clock; tests move it to expire sessions and codes. */
  now?: () => Date;
  /** Where unexpected errors are reported; console by default. */
  logError?: (err: unknown, req: { method: string; path: string }) => void;
};

const defaultLogError: NonNullable<AppDeps["logError"]> = (err, req) => {
  // the method and path only: a query string or body can carry personal data
  console.error(`[api] ${req.method} ${req.path} failed:`, err);
};

export function createApp({ config, db, mailer, now, storage, logError = defaultLogError }: AppDeps): Express {
  const app = express();

  app.disable("x-powered-by");
  // nginx on the same machine is the only proxy: trust its X-Forwarded-For and -Proto, and nobody else's
  app.set("trust proxy", "loopback");

  // JSON only, never HTML: no sniffing, no framing, and a policy that lets a response load nothing at all
  // (helmet's default policy is written for HTML sites)
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );
  app.use(
    cors({
      // only the web app's own pages may call with the session cookie; any other origin gets no CORS headers
      origin: config.WEB_ORIGINS,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "100kb" }));

  app.use("/health", healthModule({ db }));

  // everything under /v1: writes must come from the web app (CSRF), and the session cookie is read once
  const auth = authModule({ db, config, mailer: mailer ?? mailerFor(config), now });
  app.use("/v1", originCheck(config), loadSession(config, auth.service));
  app.use("/v1", auth.routes);
  // the rules' clock: the test's clock, else RULES_CLOCK on local and staging, else the real one
  const rulesNow = now ?? rulesClock(config);
  const uploadMaxBytes = config.UPLOAD_MAX_MB * 1_048_576;
  const files =
    storage ??
    createLocalStorage({ dir: config.STORAGE_DIR ?? fileURLToPath(new URL("../../../data/uploads", import.meta.url)), key: deriveKeys(config.AUTH_SECRET).upload });
  // until M1.2's virus scan, unscanned files open only away from production
  const allowUnscanned = config.APP_ENV ? config.APP_ENV !== "production" : config.NODE_ENV !== "production";
  app.use("/v1/dealroom", dealRoomModule({ db, now: rulesNow, storage: files, allowUnscanned }));
  app.use("/v1/apply", applyModule({ db, now: rulesNow, storage: files, uploadMaxBytes }));
  const organisers = organisersModule({ db, config, auth: auth.service, storage: files, now: rulesNow, uploadMaxBytes, allowUnscanned });
  app.use("/v1", organisers.routes);
  app.use("/v1/admin", platformModule({ db, repo: organisers.repo, organisers: organisers.service, now: rulesNow }));
  app.use("/v1/public", publicModule({ db, now: rulesNow }));
  const transfers = uploadsModule({ storage: files, maxBytes: uploadMaxBytes });
  app.use("/v1/uploads", transfers.uploads);
  app.use("/v1/files", transfers.files);

  app.use(notFound);
  app.use(errorHandler(logError));
  return app;
}
