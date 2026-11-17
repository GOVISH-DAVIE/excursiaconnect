/** The live board's calls to the API (M3.4): the only file in the web app that knows these paths. */
import { LiveBoard, type OutcomeEntry } from "@excursia/contracts/live";
import { conditional, http } from "../http";

const base = (eventId: string) => `/v1/live/${eventId}`;
const q = (day: string | null) => (day ? `?day=${day}` : "");

export const liveApi = {
  /** The board, or "nothing changed" against the version this phone already has. */
  board: (eventId: string, day: string | null, etag: string | null) => conditional(`${base(eventId)}${q(day)}`, etag, LiveBoard),
  start: (eventId: string, meetingId: string, day: string | null) => http.post(`${base(eventId)}/${meetingId}/start${q(day)}`, { schema: LiveBoard }),
  outcome: (eventId: string, meetingId: string, day: string | null, input: OutcomeEntry) => http.post(`${base(eventId)}/${meetingId}/outcome${q(day)}`, { body: input, schema: LiveBoard }),
  refill: (eventId: string, meetingId: string, day: string | null, matchId: string) => http.post(`${base(eventId)}/${meetingId}/refill${q(day)}`, { body: { matchId }, schema: LiveBoard }),
};
