"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { visitsDb } from "@/server/visits/db";
import { clientIp, viaHttps } from "@/server/visits/ip";
import { MAX_FAILED, WATCH_COOKIE, WATCH_PATH, WATCH_TTL_MS, passwordMatches, signWatch, tooManyAttempts, watchConfig } from "@/server/visits/auth";

export type SignInState = { error?: string };

/** Signs in to the visitor log with the password in ADMINWATCH_PASSWORD. Every attempt is recorded. */
export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const cfg = watchConfig();
  if (!cfg) return { error: "The visitor log is not set up on this server." };
  const h = await headers();
  const ip = clientIp(h);
  const db = visitsDb();
  const now = new Date();
  if (tooManyAttempts(db, ip, now)) return { error: `${MAX_FAILED} wrong passwords from this address in 15 minutes. Try again later.` };
  const ok = passwordMatches(String(form.get("password") ?? ""), cfg.password);
  db.prepare("INSERT INTO signins (at, ip, ok) VALUES (?, ?, ?)").run(now.toISOString(), ip, ok ? 1 : 0);
  if (!ok) return { error: "That password is not right." };
  (await cookies()).set(WATCH_COOKIE, signWatch(cfg.secret, now.getTime() + WATCH_TTL_MS), { httpOnly: true, secure: viaHttps(h), sameSite: "strict", path: WATCH_PATH, maxAge: WATCH_TTL_MS / 1000 });
  redirect(WATCH_PATH);
}

export async function signOut() {
  (await cookies()).set(WATCH_COOKIE, "", { httpOnly: true, sameSite: "strict", path: WATCH_PATH, maxAge: 0 });
  redirect(WATCH_PATH);
}
