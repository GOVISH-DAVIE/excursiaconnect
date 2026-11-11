/**
 * The Express app, built from its dependencies so tests can make one against the test database without starting
 * a server. server.ts makes the real one. Each module under src/modules is layered (docs/architecture.md):
 *   <module>.routes.ts      paths and middleware, pointing at controller handlers
 *   <module>.controller.ts  HTTP in and out: parse with @excursia/contracts, call the service, respond
 *   <module>.service.ts     the use cases: run the rules from @excursia/domain inside a transaction
 *   <module>.repo.ts        the only code that touches @excursia/db
 * and its index.ts assembles them; this file only mounts what each module returns.
 */
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Db } from "@excursia/db";
import type { Config } from "./config";
import { errorHandler, notFound } from "./http/errors";
import { healthModule } from "./modules/health";

export type AppDeps = {
  config: Config;
  db: Db;
  /** Where unexpected errors are reported; console by default. */
  logError?: (err: unknown, req: { method: string; path: string }) => void;
};

const defaultLogError: NonNullable<AppDeps["logError"]> = (err, req) => {
  // the method and path only: a query string or body can carry personal data
  console.error(`[api] ${req.method} ${req.path} failed:`, err);
};

export function createApp({ config, db, logError = defaultLogError }: AppDeps): Express {
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

  app.use(notFound);
  app.use(errorHandler(logError));
  return app;
}
