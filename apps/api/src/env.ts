/**
 * Locally, the API and its commands read the repository's .env.local (scripts/db/setup-local.sh writes it). A
 * server never has that file: its systemd unit's EnvironmentFile sets the variables (deploy.md).
 */
import { fileURLToPath } from "node:url";

/** The connection strings LOCAL_DATABASE points at another database (scripts/db/add-local-db.sh). */
const DATABASE_URLS = ["DATABASE_URL", "WORKER_DATABASE_URL", "REPORTING_DATABASE_URL", "MIGRATE_DATABASE_URL"];

export function loadLocalEnv() {
  if (process.env.NODE_ENV === "production") return;
  try {
    // src/env.ts and dist/*.js both sit two folders below the repository root
    process.loadEnvFile(fileURLToPath(new URL("../../../.env.local", import.meta.url)));
  } catch {
    // no .env.local: the variables are already in the environment
  }
  pointAtLocalDatabase(process.env);
}

/**
 * Local only: LOCAL_DATABASE=excursia_fresh runs on that database instead of excursia_dev, with the same roles, so a
 * clean walk-through never touches the demo data. Refused anywhere but APP_ENV=local.
 */
export function pointAtLocalDatabase(env: NodeJS.ProcessEnv) {
  const name = env.LOCAL_DATABASE;
  if (!name) return;
  if (env.APP_ENV !== "local") throw new Error("LOCAL_DATABASE is for APP_ENV=local only");
  if (!/^excursia_[a-z0-9_]+$/.test(name)) throw new Error("LOCAL_DATABASE must be a database name like excursia_fresh");
  for (const key of DATABASE_URLS) {
    const value = env[key];
    if (!value) continue;
    const url = new URL(value);
    url.pathname = `/${name}`;
    env[key] = url.toString();
  }
}
