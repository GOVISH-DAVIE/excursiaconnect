/**
 * Sessions: the decision paper's activity formats beyond one-to-one meetings (presentations, reverse pitches,
 * challenge sessions, clinics, roundtables, pilot scoping, negotiation). A session is planned by the coordinator
 * or the lead, invitations go to qualified participants, each accepts or declines, attendance is taken on the
 * day and every attendee leaves with an outcome in the paper's seven categories. A session a participant has
 * accepted holds their time, so no meeting can be booked over it, and the reverse.
 */
import type { Ctx } from "../ctx";
import type { AppState } from "../types";
import { addMinutes, crosses, fmtStamp } from "../time";
import { staffOf, drCan, feeSettled, occupies, qualified, sessionClash, sessionHolds, staffName } from "./logic";
import type { DealRoomState, DrApplication, DrSession, MeetingOutcome } from "./types";
import { send, withDr } from "./util";

export type DrSessionDraft = Pick<DrSession, "format" | "title" | "start" | "end" | "roomId" | "host" | "track"> & { id?: string; eventId: string };

export type DrSessionAction =
  | { type: "dr/sessionSave"; draft: DrSessionDraft }
  | { type: "dr/sessionInvite"; sessionId: string; appIds: string[] }
  | { type: "dr/sessionRespond"; sessionId: string; appId: string; answer: "Accepted" | "Declined" }
  | { type: "dr/sessionAttend"; sessionId: string; appId: string; present: boolean }
  | { type: "dr/sessionOutcome"; sessionId: string; appId: string; category: MeetingOutcome; note: string }
  | { type: "dr/sessionCancel"; sessionId: string; reason: string }
  | { type: "dr/sessionArrive"; sessionId: string; delegateId: string };

/** Who may be invited: a qualified seeker with the fee settled, or a verified provider or institution. */
export const invitable = (a: DrApplication) => (a.type === "seeker" ? qualified(a) && feeSettled(a) : a.verification?.state === "Verified");

/** A participant's meetings that cross a window, from the meetings that hold a slot. */
function meetingClash(dr: DealRoomState, appId: string, start: string, end: string) {
  return dr.meetings.find((m) => {
    const cfg = dr.configs[m.eventId];
    if (!cfg || !occupies(m, cfg, dr.clock)) return false;
    const mm = dr.matches.find((x) => x.id === m.matchId);
    return !!mm && (mm.seekerId === appId || mm.providerId === appId) && crosses(m.start, m.end, start, end, cfg.rules.bufferMin);
  });
}

/** Why a session cannot be saved as drafted; empty when it can. Shared by the form and the reducer. */
export function sessionProblems(state: { dealRoom: DealRoomState; events: { id: string; startDate: string; endDate: string }[] }, d: DrSessionDraft): string[] {
  const dr = state.dealRoom;
  const cfg = dr.configs[d.eventId];
  const event = state.events.find((e) => e.id === d.eventId);
  const out: string[] = [];
  if (!cfg || !event) return ["No Deal Room for this event"];
  if (!d.title.trim()) out.push("Give it a title");
  if (!cfg.sessionRooms.includes(d.roomId)) out.push("Choose the presentation area or the roundtable room");
  const day = d.start.slice(0, 10);
  if (day < event.startDate || day > event.endDate) out.push("Outside summit week");
  if (d.end <= d.start) out.push("It must end after it starts");
  if (d.end.slice(0, 10) !== day) out.push("It must end the same day");
  if (d.start.slice(11) < cfg.rules.dayStart || d.end.slice(11) > cfg.rules.dayEnd) out.push(`Outside Deal Room hours, ${cfg.rules.dayStart} to ${cfg.rules.dayEnd}`);
  const before = d.id ? dr.sessions.find((s) => s.id === d.id) : undefined;
  if (d.start <= dr.clock && (!before || before.start !== d.start)) out.push("The time has passed");
  const room = dr.sessions.find((s) => s.id !== d.id && !s.cancelled && s.roomId === d.roomId && crosses(s.start, s.end, d.start, d.end));
  if (room) out.push(`The room holds "${room.title}" ${room.start.slice(11)} to ${room.end.slice(11)}`);
  if (d.host) {
    const host = dr.apps.find((a) => a.id === d.host);
    if (!host || !invitable(host)) out.push("The host must be qualified or verified");
    else {
      const m = meetingClash(dr, host.id, d.start, d.end);
      if (m) out.push(`${host.org.name} has a meeting ${m.start.slice(11)} to ${m.end.slice(11)}`);
      const s = dr.sessions.find((x) => x.id !== d.id && !x.cancelled && (x.host === host.id || x.responses[host.id]?.answer === "Accepted") && crosses(x.start, x.end, d.start, d.end));
      if (s) out.push(`${host.org.name} is in "${s.title}" ${s.start.slice(11)} to ${s.end.slice(11)}`);
    }
  }
  return out;
}

/** Why a participant cannot accept; empty when they can. */
export function acceptProblems(dr: DealRoomState, s: DrSession, appId: string): string[] {
  const out: string[] = [];
  if (s.cancelled) out.push("The session was cancelled");
  if (s.start <= dr.clock) out.push("The session has started");
  const m = meetingClash(dr, appId, s.start, s.end);
  if (m) out.push(`You have a meeting ${m.start.slice(11)} to ${m.end.slice(11)}`);
  const other = sessionClash({ ...dr, sessions: dr.sessions.filter((x) => x.id !== s.id) }, appId, s.start, s.end);
  if (other) out.push(`You are in "${other.title}" ${other.start.slice(11)} to ${other.end.slice(11)}`);
  return out;
}

const when = (s: DrSession) => `${fmtStamp(s.start)} to ${s.end.slice(11)}`;
const patch = (dr: DealRoomState, id: string, f: (s: DrSession) => DrSession) => ({ ...dr, sessions: dr.sessions.map((s) => (s.id === id ? f(s) : s)) });
const accepted = (s: DrSession) => Object.entries(s.responses).filter(([, r]) => r.answer === "Accepted").map(([id]) => id);

export function drSessionReducer(state: AppState, action: DrSessionAction, ctx: Ctx): AppState {
  let dr = state.dealRoom;
  const at = ctx.now;
  const me = staffOf(dr, ctx.actor);
  const s = "sessionId" in action ? dr.sessions.find((x) => x.id === action.sessionId) : undefined;

  switch (action.type) {
    case "dr/sessionSave": {
      if (!drCan(me, "schedule") || sessionProblems(state, action.draft).length) return state;
      const d = action.draft;
      const before = d.id ? dr.sessions.find((x) => x.id === d.id) : undefined;
      if (before) {
        if (before.cancelled || before.start <= at) return state;
        const moved = before.start !== d.start || before.end !== d.end || before.roomId !== d.roomId;
        dr = patch(dr, before.id, (x) => ({ ...x, format: d.format, title: d.title.trim(), start: d.start, end: d.end, roomId: d.roomId, host: d.host, track: d.track, history: [...x.history, { at, by: me!.id, what: moved ? `Moved to ${d.start}, ${state.rooms.find((r) => r.id === d.roomId)?.name ?? d.roomId}` : "Details updated" }] }));
        // anyone who accepted hears of a move; the host too
        if (moved) for (const id of new Set([...accepted(before), ...(d.host ? [d.host] : [])])) dr = send(ctx, dr, before.eventId, id, `Session moved: ${d.title}, now ${fmtStamp(d.start)}`, `/dr/${id}?tab=Programme`);
        return withDr(state, dr);
      }
      const session: DrSession = { id: ctx.newId("ses"), eventId: d.eventId, format: d.format, title: d.title.trim(), start: d.start, end: d.end, roomId: d.roomId, host: d.host, track: d.track, owner: me!.id, invitees: [], responses: {}, attended: [], outcomes: [], history: [{ at, by: me!.id, what: "Planned" }] };
      dr = { ...dr, sessions: [...dr.sessions, session] };
      if (d.host) dr = send(ctx, dr, d.eventId, d.host, `You are hosting: ${session.title}, ${when(session)}`, `/dr/${d.host}?tab=Programme`);
      return withDr(state, dr);
    }

    case "dr/sessionInvite": {
      if (!s || !drCan(me, "schedule") || s.cancelled || s.start <= at) return state;
      const add = action.appIds.filter((id) => id !== s.host && !s.invitees.includes(id) && invitable(dr.apps.find((a) => a.id === id) ?? ({} as DrApplication)));
      if (!add.length) return state;
      dr = patch(dr, s.id, (x) => ({ ...x, invitees: [...x.invitees, ...add], history: [...x.history, { at, by: me!.id, what: `Invited ${add.length}` }] }));
      for (const id of add) dr = send(ctx, dr, s.eventId, id, `Invitation: ${s.title}, ${when(s)}. Accept or decline`, `/dr/${id}?tab=Programme`);
      return withDr(state, dr);
    }

    case "dr/sessionRespond": {
      if (!s || !s.invitees.includes(action.appId)) return state;
      if (action.answer === "Accepted" && acceptProblems(dr, s, action.appId).length) return state;
      if (action.answer === "Declined" && (s.cancelled || s.start <= at)) return state;
      const org = dr.apps.find((a) => a.id === action.appId)?.org.name ?? action.appId;
      dr = patch(dr, s.id, (x) => ({ ...x, responses: { ...x.responses, [action.appId]: { answer: action.answer, at } }, history: [...x.history, { at, by: "applicant", what: `${org}: ${action.answer.toLowerCase()}` }] }));
      return withDr(state, dr);
    }

    case "dr/sessionAttend": {
      // attendance opens half an hour before the start, on the day
      if (!s || s.cancelled || !(drCan(me, "liveboard") || drCan(me, "outcome")) || at < addMinutes(s.start, -30) || at.slice(0, 10) !== s.start.slice(0, 10)) return state;
      if (action.appId !== s.host && !s.invitees.includes(action.appId)) return state;
      const org = dr.apps.find((a) => a.id === action.appId)?.org.name ?? action.appId;
      dr = patch(dr, s.id, (x) => ({
        ...x,
        attended: action.present ? [...new Set([...x.attended, action.appId])] : x.attended.filter((id) => id !== action.appId),
        outcomes: action.present ? x.outcomes : x.outcomes.filter((o) => o.appId !== action.appId),
        history: [...x.history, { at, by: me!.id, what: `${org} ${action.present ? "attended" : "marked absent"}` }],
      }));
      return withDr(state, dr);
    }

    case "dr/sessionOutcome": {
      if (!s || s.cancelled || !drCan(me, "outcome") || at < s.start || !s.attended.includes(action.appId)) return state;
      if (action.category !== "No fit" && !action.note.trim()) return state; // anything that leads somewhere says where
      const org = dr.apps.find((a) => a.id === action.appId)?.org.name ?? action.appId;
      dr = patch(dr, s.id, (x) => ({
        ...x,
        outcomes: [...x.outcomes.filter((o) => o.appId !== action.appId), { appId: action.appId, category: action.category, note: action.note.trim(), by: me!.id, at }],
        history: [...x.history, { at, by: me!.id, what: `${org}: ${action.category}${action.note.trim() ? `. ${action.note.trim()}` : ""}` }],
      }));
      return withDr(state, dr);
    }

    case "dr/sessionArrive": {
      // the room's door scanner: the badge is the check, so no staff role is needed, only the person's place in it
      const app = dr.apps.find((a) => a.delegateId === action.delegateId);
      if (!s || !app || !sessionHolds(s, app.id) || at < addMinutes(s.start, -15) || at >= s.end || s.attended.includes(app.id)) return state;
      dr = patch(dr, s.id, (x) => ({ ...x, attended: [...x.attended, app.id], history: [...x.history, { at, by: "door", what: `${app.org.name} scanned in at the door` }] }));
      return withDr(state, dr);
    }

    case "dr/sessionCancel": {
      if (!s || s.cancelled || !drCan(me, "schedule") || s.start <= at || !action.reason.trim()) return state;
      dr = patch(dr, s.id, (x) => ({ ...x, cancelled: { by: me!.id, at, reason: action.reason.trim() }, history: [...x.history, { at, by: me!.id, what: `Cancelled by ${staffName(dr, me!.id)}: ${action.reason.trim()}` }] }));
      for (const id of new Set([...accepted(s), ...(s.host ? [s.host] : [])])) dr = send(ctx, dr, s.eventId, id, `Cancelled: ${s.title}, ${when(s)}. ${action.reason.trim()}`, `/dr/${id}?tab=Programme`);
      return withDr(state, dr);
    }
  }
}
