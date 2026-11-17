/** Sign-in's query contracts: the one key the session lives under, shared by every hook that reads or changes it. */
import { queryOptions } from "@tanstack/react-query";
import type { SessionView } from "@excursia/contracts/auth";
import { ApiError } from "../http";
import { authApi } from "./api";

/**
 * The last staff sign-in the server confirmed on this phone, so a page reloaded with no connection (the live board
 * at the venue, M3.5) still opens on what this phone kept. It unlocks nothing: every request still carries the real
 * session, which the server checks. Kept for 12 hours at most, a staff session's own limit; a participant's isn't
 * kept; signing out clears it.
 */
const KEPT = "last-staff-session";
const KEPT_MS = 12 * 3600_000;

function keep(s: SessionView | null) {
  try {
    if (s && s.user.kind !== "participant" && s.mfa !== "pending") localStorage.setItem(KEPT, JSON.stringify({ s, at: Date.now() }));
    else localStorage.removeItem(KEPT);
  } catch {
    // storage refused: nothing kept
  }
}
function kept(): SessionView | null {
  try {
    const k = JSON.parse(localStorage.getItem(KEPT) ?? "null") as { s: SessionView; at: number } | null;
    return k && Date.now() - k.at < KEPT_MS ? k.s : null;
  } catch {
    return null;
  }
}
export const forgetKeptSession = () => keep(null);

async function session(): Promise<SessionView | null> {
  try {
    const s = await authApi.session();
    keep(s);
    return s;
  } catch (e) {
    // no connection: the sign-in this phone last had, if it is a staff one and recent
    const k = e instanceof ApiError && (e.code === "network" || e.status >= 500) ? kept() : null;
    if (k) return k;
    throw e;
  }
}

export const sessionQuery = {
  key: ["session"] as const,
  options: () => queryOptions({ queryKey: sessionQuery.key, queryFn: session, staleTime: 30_000 }),
};
