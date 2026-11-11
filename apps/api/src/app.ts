/**
 * The Express app, built from its dependencies so tests can make one against the test database without starting
 * a server. server.ts makes the real one. The layers below it (docs/architecture.md): routes check the request
 * against @excursia/contracts and call a service; services run the rules from @excursia/domain inside a
 * transaction; repositories are the only code that touches @excursia/db.
 */
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Db } from "@excursia/db";
import type { Config } from "./config";
import { errorHandler, notFound } from "./http/errors";
import { healthRoutes } from "./routes/health";

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

  app.use("/health", healthRoutes(db));

  app.use(notFound);
  app.use(errorHandler(logError));
  return app;
}
