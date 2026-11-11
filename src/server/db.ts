import "server-only";

/**
 * The Prisma client: one per process, connecting as the app role (excursia_app), which may read and write rows but
 * not change the schema or the audit log (backend-plan.md, M0.2). Repositories are its only users
 * (docs/architecture.md); the worker builds its own client with WORKER_DATABASE_URL.
 *
 * In development, Next.js reloads modules on every change, so the client is kept on globalThis to avoid opening
 * a new connection pool each time.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/** Connections per process (backend-plan.md, performance budgets: web 10, worker 3 for Prisma). */
const POOL_MAX = Number(process.env.DATABASE_POOL_MAX ?? 10);

export function createDb(connectionString: string | undefined, poolMax = POOL_MAX): PrismaClient {
  if (!connectionString) throw new Error("The database URL is not set: run scripts/db/setup-local.sh, or set it in the environment");
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: poolMax }),
    // queries are never logged: they can carry personal data (deploy.md, The server itself)
    // and tests expect refusals, so they log nothing
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : process.env.NODE_ENV === "test" ? [] : ["error"],
  });
}

const globalForDb = globalThis as unknown as { excursiaDb?: PrismaClient };

export const db: PrismaClient = globalForDb.excursiaDb ?? createDb(process.env.DATABASE_URL);
if (process.env.NODE_ENV !== "production") globalForDb.excursiaDb = db;
