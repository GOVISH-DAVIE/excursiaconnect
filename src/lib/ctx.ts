/**
 * What a rule needs from outside the data: the time, a way to make ids, and who is acting.
 *
 * Every reducer takes a Ctx, so the same rules run in the prototype and on the server:
 * - In the prototype, the client store builds it from the demo clocks and the persona switchers.
 * - On the server, the gateway builds it from the server clock (Africa/Nairobi), database-safe ids and the
 *   signed-in session (docs/backend-plan.md, M0.0).
 *
 * Nothing in src/lib reads the machine clock or Math.random; they come in through here.
 */

/** Who is acting. On the server this comes from the session and nothing else. */
export type Actor =
  | { kind: "staff"; id: string } // Deal Room staff (DrStaff id)
  | { kind: "member"; id: string; eventId?: string } // an organiser's team member (TeamMember id); a scanner is signed in for one event
  | { kind: "admin"; id: string } // Algotech
  | { kind: "applicant"; appId: string } // a Deal Room participant, acting on their own application
  | { kind: "exhibitor"; exhibitorId: string } // an exhibitor's contact, acting for their own company
  | { kind: "delegate"; id: string }
  | { kind: "system" }; // jobs and webhooks

export interface Ctx {
  /** "YYYY-MM-DD HH:MM", local to the event (Africa/Nairobi on the server). */
  now: string;
  /** A new id with this prefix, unique across concurrent writers. */
  newId: (prefix: string) => string;
  /** Who is acting; null only where nobody is (a public page). */
  actor: Actor | null;
}

/** A wall-clock "now" in Nairobi, as the rules expect it. For the prototype and for the server's Ctx. */
export function nairobiNow(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(at);
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "00";
  return `${p("year")}-${p("month")}-${p("day")} ${p("hour") === "24" ? "00" : p("hour")}:${p("minute")}`;
}

/**
 * A Ctx with a fixed time and counted ids: for the seed and the tests, so runs are reproducible. Ids are unique
 * within one Ctx only, so use one per test run, not one per action.
 */
export function fixedCtx(now: string, actor: Actor | null = null): Ctx {
  let n = 0;
  return { now, actor, newId: (prefix) => `${prefix}_${now.replace(/\D/g, "").slice(-8)}${(++n).toString(36).padStart(3, "0")}` };
}
