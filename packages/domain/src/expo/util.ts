/** Small helpers both exhibition reducers use. */
import type { Ctx } from "../ctx";
import type { AppState } from "../types";
import type { ExpoHistory, ExpoMessage, ExpoState } from "./types";

export const withExpo = (state: AppState, expo: ExpoState): AppState => ({ ...state, expo });
export const note = (what: string, by: string, at: string): ExpoHistory => ({ at, by, what });

/** A message says what changed and links into the platform; it never carries amounts owed or documents. */
export function send(ctx: Ctx, expo: ExpoState, eventId: string, to: string, subject: string, link: string, channel: ExpoMessage["channel"] = "Email"): ExpoState {
  return { ...expo, outbox: [{ id: ctx.newId("xm"), eventId, at: ctx.now, to, channel, subject, link }, ...expo.outbox].slice(0, 400) };
}
