/** Sessions' calls to the API (M3.3): the only file in the web app that knows these paths. */
import { InviteOptions, SessionRow, SessionsBoard, type SessionInput } from "@excursia/contracts/sessions";
import { http } from "../http";

const team = (eventId: string) => `/v1/sessions/${eventId}`;

export const sessionsApi = {
  board: (eventId: string) => http.get(team(eventId), { schema: SessionsBoard }),
  plan: (eventId: string, input: SessionInput) => http.post(team(eventId), { body: input, schema: SessionRow }),
  update: (eventId: string, sessionId: string, input: SessionInput) => http.put(`${team(eventId)}/${sessionId}`, { body: input, schema: SessionRow }),
  invitable: (eventId: string, sessionId: string) => http.get(`${team(eventId)}/${sessionId}/invitable`, { schema: InviteOptions }),
  invite: (eventId: string, sessionId: string, appIds: string[]) => http.post(`${team(eventId)}/${sessionId}/invite`, { body: { appIds }, schema: SessionRow }),
  cancel: (eventId: string, sessionId: string, reason: string) => http.post(`${team(eventId)}/${sessionId}/cancel`, { body: { reason }, schema: SessionRow }),
  attend: (eventId: string, sessionId: string, appId: string, present: boolean) => http.post(`${team(eventId)}/${sessionId}/attendance`, { body: { appId, present }, schema: SessionRow }),
  outcome: (eventId: string, sessionId: string, input: { appId: string; category: string; note: string }) => http.post(`${team(eventId)}/${sessionId}/outcomes`, { body: input, schema: SessionRow }),
};
