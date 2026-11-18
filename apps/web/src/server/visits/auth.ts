import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { VisitsDb } from "./db";

/*
  The lock on /adminwatch: a password kept in the server's environment, then a signed cookie for 12 hours.
  ADMINWATCH_PASSWORD opens it; ADMINWATCH_SECRET (32 characters or more) signs the cookie. With either unset,
  nothing opens.
*/

export const WATCH_COOKIE = "aw_session";
export const WATCH_PATH = "/adminwatch";
export const WATCH_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_FAILED = 5; // failed sign-ins from one address in 15 minutes before it is refused
const FAILED_WINDOW_MS = 15 * 60 * 1000;

export function watchConfig(): { password: string; secret: string } | undefined {
  const password = process.env.ADMINWATCH_PASSWORD ?? "";
  const secret = process.env.ADMINWATCH_SECRET ?? "";
  return password && secret.length >= 32 ? { password, secret } : undefined;
}

const mac = (secret: string, expires: number) => createHmac("sha256", secret).update(`adminwatch.${expires}`).digest("base64url");
const sameBytes = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

/** The cookie's value: when it expires, and a signature over that. */
export const signWatch = (secret: string, expires: number) => `${expires}.${mac(secret, expires)}`;

export function verifyWatch(secret: string, value: string | undefined, now: number): boolean {
  const [exp, sig] = (value ?? "").split(".");
  const expires = Number(exp);
  if (!sig || !Number.isFinite(expires) || expires < now || expires > now + WATCH_TTL_MS) return false;
  return sameBytes(Buffer.from(sig), Buffer.from(mac(secret, expires)));
}

/** Compares digests, so the time taken says nothing about the password's length or its first letters. */
export const passwordMatches = (given: string, actual: string) => sameBytes(createHash("sha256").update(given).digest(), createHash("sha256").update(actual).digest());

/** Whether this address has failed to sign in too often lately. */
export function tooManyAttempts(db: VisitsDb, ip: string, now: Date): boolean {
  const since = new Date(now.getTime() - FAILED_WINDOW_MS).toISOString();
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM signins WHERE ip = ? AND ok = 0 AND at >= ?").get(ip, since) as { n: number };
  return n >= MAX_FAILED;
}

/** Whether the request carries a valid watch cookie. Reads cookies, so call it inside Suspense. */
export async function isWatcher(): Promise<boolean> {
  const cfg = watchConfig();
  if (!cfg) return false;
  return verifyWatch(cfg.secret, (await cookies()).get(WATCH_COOKIE)?.value, Date.now());
}
