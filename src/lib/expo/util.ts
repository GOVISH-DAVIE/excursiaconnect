/** Small helpers both exhibition reducers use. */
import type { AppState } from "../types";
import type { ExpoHistory, ExpoMessage, ExpoState } from "./types";

export const withExpo = (state: AppState, expo: ExpoState): AppState => ({ ...state, expo });
export const note = (what: string, by: string, at: string): ExpoHistory => ({ at, by, what });

/** A message says what changed and links into the platform; it never carries amounts owed or documents. */
export function send(expo: ExpoState, eventId: string, to: string, subject: string, link: string, channel: ExpoMessage["channel"] = "Email"): ExpoState {
  return { ...expo, outbox: [{ id: `xm_${expo.outbox.length + 1}_${expo.clock.replace(/\D/g, "")}`, eventId, at: expo.clock, to, channel, subject, link }, ...expo.outbox].slice(0, 400) };
}
