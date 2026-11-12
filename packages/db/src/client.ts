/**
 * The Prisma client. Only the API and the worker import this package; the web app never does (eslint.config.mjs
 * forbids it), so the browser and Next.js never hold a database connection.
 *
 * Each process makes one client at startup and passes it down: the API connects as excursia_app (DATABASE_URL),
 * the worker as excursia_worker (WORKER_DATABASE_URL). That role may read and write rows but not change the
 * schema or the audit log (backend-plan.md, M0.2).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export { Prisma, PrismaClient } from "./generated/prisma/client";
export type Db = PrismaClient;

/** Connections per process (backend-plan.md, performance budgets: API 10, worker 3). */
const POOL_MAX = 10;

export function createDb(connectionString: string | undefined, poolMax = POOL_MAX): PrismaClient {
  if (!connectionString) throw new Error("The database URL is not set: run npm run db:setup, or set it in the environment");
  return new PrismaClient({
    // Prisma's adapter sends times as UTC without a zone, and Postgres reads a zoneless time in the session's zone:
    // on a server set to Africa/Nairobi every stored time was three hours early, and SQL's now() disagreed with them
    adapter: new PrismaPg({ connectionString, max: poolMax, options: "-c TimeZone=UTC" }),
    // queries are never logged: they can carry personal data (deploy.md, The server itself);
    // tests expect refusals, so they log nothing
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : process.env.NODE_ENV === "test" ? [] : ["error"],
  });
}
