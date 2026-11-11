/** Who may scan, what a badge may enter, and the room doors: pure rules over the app state (AZ-1 to AZ-6). */
import { doorProblem } from "../expo/ops";
import { can } from "../roles";
import type { AppState, Delegate, Session, TeamMember } from "../types";
import { nowTime } from "./clock";

// `waivable`: a deny staff may override with a PIN; a bad, unpaid or unaccredited badge never is (AZ-5)
export type ScanVerdict = { verdict: "allow" | "deny"; reason?: string; delegate?: Delegate; waivable?: boolean };

/** `now`, a full stamp, is a module's clock; without it the zone windows use the wall clock and the hall door rules are not applied. */
/* ---------- who may scan, and what a PIN may waive (AZ-1, AZ-5) ---------- */

/** Why a team member cannot work a scanner for this event; undefined when they can. */
export function scanRefusal(state: AppState, m: TeamMember, eventId: string): string | undefined {
  if (m.status !== "Active") return `${m.name} has not accepted the invitation yet`;
  if (state.events.find((e) => e.id === eventId)?.organiserId !== m.organiserId || (m.eventIds.length && !m.eventIds.includes(eventId))) return `${m.name} is not on this event's team`;
  if (!can(state.grants, m.role, "access.scan")) return `The ${m.role} role does not scan`;
  if (!m.pin) return `${m.name} has no scanner PIN yet`;
  return undefined;
}

/** The person signed in on the scanner, if they still may scan. */
export function scanOperator(state: AppState) {
  const sess = state.scanSession;
  const member = sess && state.team.find((m) => m.id === sess.memberId);
  return member && !scanRefusal(state, member, sess.eventId) ? { member, eventId: sess.eventId } : undefined;
}

/** The team member a PIN belongs to, when the role matrix lets them override on this event. */
export function overrider(state: AppState, pin: string, eventId: string): TeamMember | undefined {
  if (!pin.trim()) return undefined;
  const organiserId = state.events.find((e) => e.id === eventId)?.organiserId;
  return state.team.find((m) => m.pin === pin.trim() && m.status === "Active" && m.organiserId === organiserId && (!m.eventIds.length || m.eventIds.includes(eventId)) && can(state.grants, m.role, "access.override"));
}

/**
 * What no door may waive: a badge that is not valid, not paid for, or has not been through the desk. Staff can
 * override hours, entitlement, re-entry and capacity; these go back to the desk (DE-12, AZ-5).
 */
export function entryBar(d: Delegate, state: AppState): string | undefined {
  if (d.cancelled || d.status === "Cancelled" || d.status === "Refunded") return "Invalid or cancelled badge";
  if (state.events.find((e) => e.id === d.eventId)?.state === "Suspended") return "Event suspended by Algotech";
  if (d.status === "Pending" || d.status === "Awaiting payment") return "Registration not paid";
  if (d.status === "Waitlisted" || d.status === "Refund requested") return d.status === "Waitlisted" ? "On the waitlist, no seat yet" : "Refund requested";
  if (!d.accredited) return "Not accredited: go to the desk first";
  return undefined;
}

export function scanVerdict(state: AppState, code: string, zoneId: string, direction: "in" | "out", now?: string): ScanVerdict {
  const delegate = state.delegates.find((d) => d.badgeCode.toLowerCase() === code.trim().toLowerCase() || d.id === code.trim());
  if (!delegate) return { verdict: "deny", reason: "Invalid or cancelled badge", waivable: false };
  // the desk comes first: no zone door admits a badge that is not valid, paid and accredited, and no PIN waives it (DE-12, AZ-2)
  const bar = entryBar(delegate, state);
  if (bar) return { verdict: "deny", reason: bar, delegate, waivable: false };
  if (direction === "out") return { verdict: "allow", delegate };
  const tier = state.tiers.find((t) => t.id === delegate.tierId);
  const zone = state.zones.find((z) => z.id === zoneId);
  if (!tier || !zone) return { verdict: "deny", reason: "Unknown zone", delegate, waivable: false };
  const entitled = tier.entitlements.includes(zoneId) || (delegate.grants ?? []).includes(zoneId) || (delegate.category === "VIP" && zoneId === "z_vip") || (delegate.category === "Speaker" && zoneId === "z_breakout");
  if (!entitled) return { verdict: "deny", reason: `Not entitled: ${zone.name}`, delegate, waivable: true };
  // "entitled here, now": a zone with an opening window (the dining hall at lunch) refuses outside it
  if (zone.window) {
    const [from, to] = zone.window.split(/[–-]/).map((t) => t.trim());
    const hm = now ? now.slice(11, 16) : nowTime();
    if (from && to && (hm < from || hm > to)) return { verdict: "deny", reason: `${zone.name} opens ${from} to ${to}`, delegate, waivable: true };
  }
  // the exhibition halls open to stand staff and contractors at their own hours (OPS-2)
  const door = now ? doorProblem(state, delegate, zoneId, now) : undefined;
  if (door) return { verdict: "deny", reason: door, delegate, waivable: true };
  const last = delegate.zoneLog.find((l) => l.zoneId === zoneId);
  if (last && last.direction === "in" && last.verdict !== "deny") return { verdict: "deny", reason: "Anti-passback: already inside", delegate, waivable: true };
  if (zone.occupancy >= zone.capacity) return { verdict: "deny", reason: `Zone full (${zone.capacity})`, delegate, waivable: true };
  return { verdict: "allow", delegate };
}

/** The session a room door is scanning for: the live one, else the next scheduled one that day, else the last ended. */
export function sessionAtRoom(state: AppState, roomId: string, day: number): Session | undefined {
  const here = state.sessions.filter((s) => s.roomId === roomId && s.day === day).sort((a, b) => a.start.localeCompare(b.start));
  return here.find((s) => s.status === "live") ?? here.find((s) => s.status === "scheduled") ?? here[here.length - 1];
}

/** AZ-6: the room door. Valid, paid and accredited first; then enrolled, or a walk-in where the facilitator allows it. */
export function roomVerdict(state: AppState, code: string, roomId: string, day: number): ScanVerdict & { session?: Session } {
  const delegate = state.delegates.find((d) => d.badgeCode.toLowerCase() === code.trim().toLowerCase() || d.id === code.trim());
  if (!delegate) return { verdict: "deny", reason: "Invalid or cancelled badge", waivable: false };
  const bar = entryBar(delegate, state);
  if (bar) return { verdict: "deny", reason: bar, delegate, waivable: false };
  const session = sessionAtRoom(state, roomId, day);
  if (!session) return { verdict: "deny", reason: "No session in this room today", delegate, waivable: false };
  if (session.status === "ended") return { verdict: "deny", reason: `${session.title} has ended`, delegate, session, waivable: false };
  if ((delegate.roomLog ?? []).some((l) => l.sessionId === session.id && l.verdict !== "deny")) return { verdict: "deny", reason: "Already in this session", delegate, session, waivable: true };
  const enrolled = delegate.sessions.includes(session.id);
  if (enrolled) return { verdict: "allow", reason: `Enrolled: ${session.title}`, delegate, session };
  const seats = state.delegates.filter((d) => (d.roomLog ?? []).some((l) => l.sessionId === session.id && l.verdict !== "deny")).length;
  const room = state.rooms.find((r) => r.id === roomId);
  if (session.walkIns && room && seats < room.capacity) return { verdict: "allow", reason: `Walk-in: ${session.title}`, delegate, session };
  return { verdict: "deny", reason: session.walkIns ? `${room?.name ?? "Room"} is full` : `Not enrolled: ${session.title} is enrolled only`, delegate, session, waivable: true };
}
