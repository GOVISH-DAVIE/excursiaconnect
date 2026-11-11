/**
 * Prisma's configuration (Prisma 7). Migrations run as the migrator role, which owns the schema; the API connects
 * as excursia_app through src/client.ts. Locally the URLs come from the repository's .env.local, written by
 * scripts/db/setup-local.sh; on a server they come from the migrate environment file (deploy.md).
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// The Prisma CLI does not load .env files by itself. It runs from this folder (npm run db:migrate at the root
// runs it here), so the file is found from this one, not from the working directory.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env.local", import.meta.url)));
} catch {
  // no .env.local: the variables are already in the environment (CI, a server)
}

// local only: LOCAL_DATABASE=excursia_fresh migrates that database instead (scripts/db/add-local-db.sh; the API's
// own copy of this rule is apps/api/src/env.ts)
const local = process.env.LOCAL_DATABASE;
if (local && process.env.MIGRATE_DATABASE_URL) {
  if (process.env.APP_ENV !== "local" || !/^excursia_[a-z0-9_]+$/.test(local)) throw new Error("LOCAL_DATABASE is for APP_ENV=local, as excursia_<name>");
  const url = new URL(process.env.MIGRATE_DATABASE_URL);
  url.pathname = `/${local}`;
  process.env.MIGRATE_DATABASE_URL = url.toString();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.MIGRATE_DATABASE_URL,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
