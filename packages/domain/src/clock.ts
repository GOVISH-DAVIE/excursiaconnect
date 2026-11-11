import type { AppState } from "./types";

/**
 * Which clock an event runs on. A module with its own demo clock (the Deal Room at Connected Africa 3.0, the
 * Exhibition at the Nairobi summit) sets the time for that event's scanner and screens; any other event runs on
 * the wall clock, shown by `undefined`. The platform's own screens keep their clocks.
 */
export function moduleClock(state: AppState, eventId: string): { at: string; name: string } | undefined {
  if (state.dealRoom.configs[eventId]) return { at: state.dealRoom.clock, name: "Deal Room clock" };
  if (state.expo.configs[eventId]) return { at: state.expo.clock, name: "exhibition clock" };
  return undefined;
}
