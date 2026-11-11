/**
 * The API process: read the settings, open the database pool, listen on loopback behind nginx, and close cleanly
 * on SIGTERM so a blue/green switch (deploy.md) never cuts a request in half.
 */
import { fileURLToPath } from "node:url";
import { createDb } from "@excursia/db";
import { createApp } from "./app";
import { loadConfig } from "./config";

if (process.env.NODE_ENV !== "production") {
  try {
    // the repository's .env.local, written by scripts/db/setup-local.sh; a server uses its EnvironmentFile instead
    process.loadEnvFile(fileURLToPath(new URL("../../../.env.local", import.meta.url)));
  } catch {
    // no .env.local: the variables are already in the environment
  }
}

const config = loadConfig();
const db = createDb(config.DATABASE_URL, config.DATABASE_POOL_MAX);
const app = createApp({ config, db });

const server = app.listen(config.API_PORT, config.API_HOST, () => {
  console.log(`[api] listening on http://${config.API_HOST}:${config.API_PORT} (${config.NODE_ENV})`);
});
// nginx keeps upstream connections open for up to 60 s; Node must hold them a little longer, or nginx sends a
// request down a socket Node has just closed and the visitor sees a 502
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`[api] ${signal}: finishing open requests`);
  // if a request hangs, leave anyway after 10 s
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
