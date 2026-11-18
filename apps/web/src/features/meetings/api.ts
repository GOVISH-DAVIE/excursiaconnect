/** Scheduling's calls to the API (M3.2): the only file in the web app that knows these paths. */
import {
  MeetingRow, MoveTimes, MyMeetings, Proposed, Schedule, SlotOptions,
  type MoveInput, type ProposeInput,
} from "@excursia/contracts/meetings";
import { http } from "../http";

const team = (eventId: string) => `/v1/meetings/${eventId}`;
const mine = (slug: string) => `/v1/my-meetings/${slug}`;

export const meetingsApi = {
  /* the team's */
  schedule: (eventId: string) => http.get(team(eventId), { schema: Schedule }),
  slots: (eventId: string, q: { matchId: string; day: string; flagged?: boolean; meetingId?: string }) =>
    http.get(`${team(eventId)}/slots`, { query: { matchId: q.matchId, day: q.day, flagged: q.flagged === undefined ? undefined : q.flagged ? "1" : "0", meetingId: q.meetingId }, schema: SlotOptions }),
  propose: (eventId: string, input: ProposeInput) => http.post(`${team(eventId)}/proposals`, { body: input, schema: MeetingRow }),
  autoPropose: (eventId: string) => http.post(`${team(eventId)}/auto-propose`, { body: {}, schema: Proposed }),
  move: (eventId: string, meetingId: string, input: MoveInput) => http.post(`${team(eventId)}/${meetingId}/move`, { body: input, schema: MeetingRow }),
  cancel: (eventId: string, meetingId: string, reason: string) => http.post(`${team(eventId)}/${meetingId}/cancel`, { body: { reason }, schema: MeetingRow }),
  acceptChange: (eventId: string, meetingId: string) => http.post(`${team(eventId)}/${meetingId}/change/accept`, { schema: MeetingRow }),
  declineChange: (eventId: string, meetingId: string, reason: string) => http.post(`${team(eventId)}/${meetingId}/change/decline`, { body: { reason }, schema: MeetingRow }),

  /* the participant's */
  mine: (slug: string) => http.get(mine(slug), { schema: MyMeetings }),
  confirm: (slug: string, meetingId: string) => http.post(`${mine(slug)}/${meetingId}/confirm`, { schema: MyMeetings }),
  times: (slug: string, meetingId: string, day: string) => http.get(`${mine(slug)}/${meetingId}/times`, { query: { day }, schema: MoveTimes }),
  askMove: (slug: string, meetingId: string, input: { start: string; reason: string }) => http.post(`${mine(slug)}/${meetingId}/move`, { body: input, schema: MyMeetings }),
  answerMove: (slug: string, meetingId: string, input: { agree: boolean; reason?: string }) => http.post(`${mine(slug)}/${meetingId}/move/answer`, { body: input, schema: MyMeetings }),
  invite: (slug: string, meetingId: string) => http.file(`${mine(slug)}/${meetingId}/invite.ics`),
  respondSession: (slug: string, sessionId: string, answer: "Accepted" | "Declined") => http.post(`${mine(slug)}/sessions/${sessionId}/respond`, { body: { answer }, schema: MyMeetings }),
};
