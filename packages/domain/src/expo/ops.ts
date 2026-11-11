/**
 * The show floor (cut 3), as pure functions: who the accreditation desk may accredit for a company, when a pass
 * opens the hall doors, which stands are staffed each show day, and the scripted mornings of days 2 and 3.
 * The store's accredit and scan apply the desk and door rules, so no post can bypass them.
 */
import { addMinutes } from "../time";
import type { AppState, Delegate } from "../types";
import { activeBookingOf, paidInFull } from "./logic";
import { CONTRACTOR_TIER, EXHIBITOR_TIER } from "./onsite";
import type { ExpoConfig } from "./types";

/** The show day a stamp falls on, 1 to 3; 0 outside the show days. */
export const showDayOf = (cfg: ExpoConfig, stamp: string) => cfg.showDays.findIndex((d) => d.date === stamp.slice(0, 10)) + 1;

/**
 * OPS-1: why the desk cannot accredit a badge that belongs to an exhibiting company; undefined when it can.
 * Only money owed may be waived at the desk, by someone allowed to override: a company that is not approved, or
 * has no signed stand, is the exhibition team's decision, not the desk's.
 */
export function deskRefusal(state: AppState, d: Delegate): { reason: string; waivable: boolean } | undefined {
  if (!d.exhibitorId) return undefined;
  const expo = state.expo;
  const cfg = expo.configs[d.eventId];
  const e = expo.exhibitors.find((x) => x.id === d.exhibitorId);
  if (!cfg || !e) return undefined;
  if (e.status !== "Approved") return { reason: `${e.name} is not approved to exhibit yet`, waivable: false };
  if (!activeBookingOf(expo, e.id, cfg, expo.clock)?.contract) return { reason: `${e.name} has no confirmed stand`, waivable: false };
  if (!paidInFull(expo, e.id)) return { reason: `${e.name}'s stand is not paid in full`, waivable: true };
  return undefined;
}
export const deskProblem = (state: AppState, d: Delegate) => deskRefusal(state, d)?.reason;

/** OPS-2: whether a pass opens a hall door now, on the exhibition clock; undefined when it does. Other doors are not the module's. */
export function doorProblem(state: AppState, d: Delegate, zoneId: string, now: string): string | undefined {
  const expo = state.expo;
  const cfg = expo.configs[d.eventId];
  if (!cfg || !expo.halls.some((h) => h.eventId === d.eventId && h.zoneId === zoneId)) return undefined;
  const inside = (w: { from: string; to: string }) => now >= w.from && now <= w.to;
  if (d.tierId === CONTRACTOR_TIER) return inside(cfg.buildUp) || inside(cfg.dismantle) ? undefined : "Contractor passes open the halls in build-up and dismantling only";
  if (d.tierId === EXHIBITOR_TIER) {
    if (inside(cfg.buildUp) || inside(cfg.dismantle)) return undefined;
    const day = cfg.showDays.find((x) => x.date === now.slice(0, 10));
    if (!day) return "Exhibitor passes open the halls on show days";
    if (now.slice(11) < cfg.exhibitorOpen) return `Exhibitor passes open the halls from ${cfg.exhibitorOpen}`;
    if (now.slice(11) > day.close) return `The halls closed at ${day.close}`;
  }
  return undefined;
}

/** The people who work a stand: its staff and sponsor passes, not its contractors. */
const standPeople = (state: AppState, exhibitorId: string) => state.delegates.filter((d) => d.exhibitorId === exhibitorId && !d.cancelled && d.tierId !== CONTRACTOR_TIER);

/** OPS-3: a stand is staffed on a show day once one of its people checks in that day, unless the floor team set it by hand. */
export function staffedOn(state: AppState, exhibitorId: string, day: number) {
  const set = state.expo.occupancy.find((o) => o.exhibitorId === exhibitorId && o.day === day);
  const ins = standPeople(state, exhibitorId)
    .flatMap((d) => d.checkIns.filter((c) => c.day === day).map((c) => ({ name: d.name, at: c.at })))
    .sort((a, b) => a.at.localeCompare(b.at));
  return { staffed: set ? set.staffed : ins.length > 0, manual: set, ins };
}

const hash = (s: string) => s.split("").reduce((a, c) => (a * 33 + c.charCodeAt(0)) % 9973, 17);

/**
 * The morning of a show day, played once when the clock passes the exhibitors' opening time: most people of a paid
 * stand arrive between that time and `until`; a stand that still owes is turned away at the desk, so its people do not.
 */
export function arrivals(state: AppState, cfg: ExpoConfig, day: number, until: string): AppState {
  const date = cfg.showDays[day - 1].date;
  const open = `${date} ${cfg.exhibitorOpen}`;
  const last = until < `${date} 09:30` ? until : `${date} 09:30`;
  const span = Math.max(1, Math.round((Date.parse(last.replace(" ", "T")) - Date.parse(open.replace(" ", "T"))) / 60000));
  const signed = new Set(state.expo.bookings.filter((k) => k.eventId === cfg.eventId && k.contract && !k.cancelled).map((k) => k.exhibitorId));
  const delegates = state.delegates.map((d) => {
    if (!d.exhibitorId || d.eventId !== cfg.eventId || d.cancelled || d.tierId === CONTRACTOR_TIER || d.status === "Pending" || !signed.has(d.exhibitorId)) return d;
    if (d.checkIns.some((c) => c.day === day) || deskProblem(state, d)) return d;
    const h = hash(`${d.id}:${day}`);
    if (h % 10 >= 8) return d; // two in ten stay away that morning
    const at = addMinutes(open, 1 + (h % Math.max(1, span - 1))).slice(11);
    return { ...d, accredited: true, status: d.status === "Confirmed" ? ("Checked in" as const) : d.status, checkIns: [...d.checkIns, { day, at }] };
  });
  return { ...state, delegates };
}
