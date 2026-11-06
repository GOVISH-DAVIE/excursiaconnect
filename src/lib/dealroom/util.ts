/** Helpers shared by the Deal Room reducers. */
import type { AppState } from "../types";
import type { DealRoomState, DrApplication, DrException } from "./types";


export const uid = (p: string, at: string) => `${p}_${at.replace(/\D/g, "").slice(-8)}${Math.floor(Math.random() * 1e4).toString(36)}`;

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
export function send(dr: DealRoomState, eventId: string, to: string, subject: string, link: string, channel: "Email" | "SMS" | "Email and SMS" = "Email and SMS"): DealRoomState {
  return { ...dr, outbox: [{ id: uid("msg", dr.clock) + dr.outbox.length, eventId, at: dr.clock, to, channel, subject, link, status: "Delivered" as const }, ...dr.outbox].slice(0, 400) };
}

export const portal = (a: DrApplication) => `/dr/${a.id}`;

export function exception(dr: DealRoomState, eventId: string, by: string, kind: DrException["kind"], reason: string, ref: string): DealRoomState {
  return { ...dr, exceptions: [{ id: uid("ex", dr.clock) + dr.exceptions.length, eventId, at: dr.clock, by, kind, reason, ref }, ...dr.exceptions] };
}

