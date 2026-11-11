/** Helpers shared by the Deal Room reducers. */
import type { Ctx } from "../ctx";
import type { AppState } from "../types";
import type { DealRoomState, DrApplication, DrException } from "./types";

export function withDr(state: AppState, dr: DealRoomState): AppState {
  return { ...state, dealRoom: dr };
}

export function patchApp(dr: DealRoomState, id: string, fn: (a: DrApplication) => DrApplication): DealRoomState {
  return { ...dr, apps: dr.apps.map((a) => (a.id === id ? fn(a) : a)) };
}

export function note(a: DrApplication, by: string, what: string, at: string): DrApplication {
  return { ...a, history: [...a.history, { at, by, what }] };
}

/** A message names the action and the date only, never private data, and links into the platform (PRD Notifications). */
export function send(ctx: Ctx, dr: DealRoomState, eventId: string, to: string, subject: string, link: string, channel: "Email" | "SMS" | "Email and SMS" = "Email and SMS"): DealRoomState {
  return { ...dr, outbox: [{ id: ctx.newId("msg"), eventId, at: ctx.now, to, channel, subject, link, status: "Delivered" as const }, ...dr.outbox].slice(0, 400) };
}

export const portal = (a: DrApplication) => `/dr/${a.id}`;

/** The event's active lead: who gets the Deal Room's reports and unassigned work. The demo's is st_lead. */
export const leadOf = (dr: DealRoomState, eventId: string) => dr.staff.find((s) => s.eventId === eventId && s.active && s.role === "Lead")?.id ?? "st_lead";
/** The event's first active operations person, who schedules meetings; the lead when there is none. */
export const opsOf = (dr: DealRoomState, eventId: string) => dr.staff.find((s) => s.eventId === eventId && s.active && s.role === "Operations")?.id ?? leadOf(dr, eventId);

export function exception(ctx: Ctx, dr: DealRoomState, eventId: string, by: string, kind: DrException["kind"], reason: string, ref: string): DealRoomState {
  return { ...dr, exceptions: [{ id: ctx.newId("ex"), eventId, at: ctx.now, by, kind, reason, ref }, ...dr.exceptions] };
}

