/**
 * Prisma's configuration (Prisma 7). Migrations run as the migrator role, which owns the schema; the app itself
 * connects as excursia_app through src/server/db.ts. Locally the URLs come from .env.local, written by
 * scripts/db/setup-local.sh; on a server they come from the migrate environment file (deploy.md).
 */
import { defineConfig } from "prisma/config";

// The Prisma CLI does not load .env files by itself; Next.js does for the app.
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: the variables are already in the environment (CI, a server)
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.MIGRATE_DATABASE_URL,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
