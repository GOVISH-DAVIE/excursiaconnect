/**
 * Sessions (backend-plan.md, M3.3), the team's side. The lead, operations and coordinators plan sessions in the
 * session rooms, invite approved or verified participants and cancel with a reason; on the day the lead, operations,
 * coordinators and reviewers take attendance and record each attendee's outcome. Every change goes through the
 * rules under the event's lock; a session holds its room, its host and everyone who accepted in the database too.
 */
import type { InviteOptions, SessionCandidate, SessionInput, SessionPhase, SessionRow, SessionsBoard } from "@excursia/contracts/sessions";
import type { Action } from "@excursia/domain/core/reducer";
import { nairobiNow, type Actor } from "@excursia/domain/ctx";
import { PARTNER_KINDS, SESSION_FORMATS, drCan, formatInfo, participantLabel, roleOf, sessionOpenOutcomes, staffName } from "@excursia/domain/dealroom/logic";
import { acceptProblems, invitable } from "@excursia/domain/dealroom/sessions";
import type { DealRoomState, DrApplication, DrConfig, DrSession, DrStaff } from "@excursia/domain/dealroom/types";
import { addMinutes } from "@excursia/domain/time";
import type { AppState } from "@excursia/domain/types";
import { HttpError } from "../../http/errors";
import type { Resolved } from "../auth/auth.service";
import { stateOf, type Commands } from "../dealroom/dealroom.commands";
import type { DealRoomRepo } from "../dealroom/dealroom.repo";

export type SessionsDeps = { drRepo: DealRoomRepo; commands: Commands; now: () => Date };

const phaseOf = (s: DrSession, now: string): SessionPhase => (s.cancelled ? "Cancelled" : now < s.start ? "Planned" : now < s.end ? "In progress" : "Held");

/** The session formats a participant may host, by what it registered as. */
function hostKinds(a: DrApplication): SessionCandidate["hosts"] {
  const out: SessionCandidate["hosts"] = [];
  if (a.type === "seeker") out.push("seeker");
  else {
    const role = roleOf(a);
    if (!a.challenge) out.push("provider");
    if (role === "partner" || (!!a.challenge && !!a.providerKind && PARTNER_KINDS.includes(a.providerKind))) out.push("partner");
    if (a.challenge || a.providerKind === "Corporate buyer") out.push("challenge");
  }
  return out;
}

export function createSessionsService({ drRepo, commands, now }: SessionsDeps) {
  async function load(eventId: string): Promise<{ state: AppState; dr: DealRoomState; cfg: DrConfig; at: string }> {
    const stored = await drRepo.load(eventId);
    if (!stored) throw new HttpError("not_found", "This event has no Deal Room.");
    const at = nairobiNow(now());
    const state = stateOf(eventId, stored, at);
    return { state, dr: state.dealRoom, cfg: state.dealRoom.configs[eventId], at };
  }

  /** The team: anyone who plans, takes attendance or records outcomes. Oversight reads the reports instead (M4.3). */
  async function member(session: Resolved, eventId: string): Promise<{ actor: Actor; staff: DrStaff }> {
    const row = await drRepo.staffForUser(session.user.id, eventId);
    if (!row) throw new HttpError("forbidden", "You're not on this event's Deal Room team.");
    const staff = row.record as unknown as DrStaff;
    if (!drCan(staff, "schedule") && !drCan(staff, "liveboard") && !drCan(staff, "outcome")) throw new HttpError("forbidden", `Your role, ${staff.role}, doesn't work with sessions.`);
    return { actor: { kind: "staff", id: row.id }, staff };
  }

  function rowOf(state: AppState, cfg: DrConfig, s: DrSession, at: string, staff: DrStaff): SessionRow {
    const dr = state.dealRoom;
    const app = (id: string) => dr.apps.find((a) => a.id === id);
    const answers = Object.values(s.responses);
    const phase = phaseOf(s, at);
    const people = [...(s.host ? [s.host] : []), ...s.invitees].flatMap((id) => {
      const a = app(id);
      if (!a) return [];
      const o = s.outcomes.find((x) => x.appId === id);
      return [{ id, org: a.org.name, label: participantLabel(a), host: id === s.host, answer: s.responses[id]?.answer ?? null, attended: s.attended.includes(id), outcome: o ? { category: o.category, note: o.note, at: o.at } : null }];
    });
    const track = s.track ? cfg.tracks.find((t) => t.id === s.track) : undefined;
    return {
      id: s.id,
      format: s.format,
      short: formatInfo(s.format).short,
      title: s.title,
      start: s.start,
      end: s.end,
      roomId: s.roomId,
      room: state.rooms.find((r) => r.id === s.roomId)?.name ?? s.roomId,
      host: s.host ? { id: s.host, org: app(s.host)?.org.name ?? s.host } : null,
      track: track ? { id: track.id, name: track.name } : null,
      owner: staffName(dr, s.owner),
      phase,
      cancelled: s.cancelled ? { at: s.cancelled.at, reason: s.cancelled.reason } : null,
      people,
      counts: {
        accepted: answers.filter((r) => r.answer === "Accepted").length,
        declined: answers.filter((r) => r.answer === "Declined").length,
        waiting: s.invitees.length - answers.length,
        attended: s.attended.length,
        outcomesOpen: sessionOpenOutcomes(s).length,
      },
      history: s.history.map((h) => ({ at: h.at, who: h.by === "applicant" || h.by === "door" ? "" : staffName(dr, h.by), what: h.what })),
      can: {
        change: !s.cancelled && at < s.start && drCan(staff, "schedule"),
        attend: !s.cancelled && (drCan(staff, "liveboard") || drCan(staff, "outcome")) && at >= addMinutes(s.start, -30) && at.slice(0, 10) === s.start.slice(0, 10),
        outcome: !s.cancelled && drCan(staff, "outcome") && at >= s.start,
      },
    };
  }

  async function board(session: Resolved, eventId: string): Promise<SessionsBoard> {
    const { staff } = await member(session, eventId);
    const { state, dr, cfg, at } = await load(eventId);
    const event = state.events.find((e) => e.id === eventId);
    const days = event ? Array.from({ length: event.days }, (_, i) => addMinutes(`${event.startDate} 00:00`, i * 1440).slice(0, 10)) : [];
    return {
      event: { id: eventId, name: event?.name ?? eventId, days, now: at },
      dayStart: cfg.rules.dayStart,
      dayEnd: cfg.rules.dayEnd,
      rooms: cfg.sessionRooms.map((id) => ({ id, name: state.rooms.find((r) => r.id === id)?.name ?? id })),
      formats: SESSION_FORMATS.map((f) => ({ format: f.format, short: f.short, what: f.what, hostKind: f.hostKind })),
      tracks: cfg.tracks.map((t) => ({ id: t.id, code: t.code, name: t.name })),
      sessions: dr.sessions
        .filter((s) => s.eventId === eventId)
        .sort((a, b) => a.start.localeCompare(b.start) || a.roomId.localeCompare(b.roomId))
        .map((s) => rowOf(state, cfg, s, at, staff)),
      candidates: dr.apps
        .filter((a) => a.eventId === eventId && invitable(a))
        .sort((a, b) => a.org.name.localeCompare(b.org.name))
        .map((a) => ({ id: a.id, org: a.org.name, label: participantLabel(a), sector: a.org.sector || a.mandate?.sectors[0] || "", track: a.track ?? null, hosts: hostKinds(a) })),
      can: { plan: drCan(staff, "schedule"), attend: drCan(staff, "liveboard") || drCan(staff, "outcome"), outcome: drCan(staff, "outcome") },
    };
  }

  /** Who could still be invited to one session, the ones on its track first, each with why they'd be busy then. */
  async function inviteOptions(session: Resolved, eventId: string, sessionId: string): Promise<InviteOptions> {
    await member(session, eventId);
    const { dr } = await load(eventId);
    const s = dr.sessions.find((x) => x.id === sessionId && x.eventId === eventId);
    if (!s) throw new HttpError("not_found", "No such session in this Deal Room.");
    return dr.apps
      .filter((a) => a.eventId === eventId && invitable(a) && a.id !== s.host && !s.invitees.includes(a.id))
      .sort((a, b) => Number(b.track === s.track) - Number(a.track === s.track) || a.org.name.localeCompare(b.org.name))
      .map((a) => ({ id: a.id, org: a.org.name, label: participantLabel(a), sector: a.org.sector || a.mandate?.sectors[0] || "", onTrack: !!s.track && a.track === s.track, busy: acceptProblems(dr, s, a.id)[0]?.replace(/^You (have|are)/, (m) => (m === "You have" ? "Has" : "Is")) ?? null }));
  }

  /** A change to one session through the rules, as the signed-in member of the team; then the session as it is now. */
  async function change(session: Resolved, eventId: string, ip: string | null, sessionId: string, action: Action): Promise<SessionRow> {
    const { actor, staff } = await member(session, eventId);
    const after = await commands.run({
      eventId,
      actor,
      userId: session.user.id,
      ip,
      owned: (s) => {
        if (!s.dealRoom.sessions.some((x) => x.id === sessionId && x.eventId === eventId)) throw new HttpError("not_found", "No such session in this Deal Room.");
      },
      actions: () => [action],
    });
    const s = after.dealRoom.sessions.find((x) => x.id === sessionId)!;
    return rowOf(after, after.dealRoom.configs[eventId], s, nairobiNow(now()), staff);
  }

  const draftOf = (eventId: string, input: SessionInput, id?: string) => ({ id, eventId, format: input.format, title: input.title, start: input.start, end: input.end, roomId: input.roomId, host: input.host ?? undefined, track: input.track ?? undefined });

  return {
    board,
    inviteOptions,
    plan: async (session: Resolved, eventId: string, input: SessionInput, ip: string | null) => {
      // a new session's id isn't known before the command: it is the one the command added
      const { actor, staff } = await member(session, eventId);
      let before = new Set<string>();
      const after = await commands.run({
        eventId,
        actor,
        userId: session.user.id,
        ip,
        actions: (s) => {
          before = new Set(s.dealRoom.sessions.map((x) => x.id));
          return [{ type: "dr/sessionSave", draft: draftOf(eventId, input) }];
        },
      });
      const s = after.dealRoom.sessions.find((x) => !before.has(x.id))!;
      return rowOf(after, after.dealRoom.configs[eventId], s, nairobiNow(now()), staff);
    },
    update: (session: Resolved, eventId: string, sessionId: string, input: SessionInput, ip: string | null) =>
      change(session, eventId, ip, sessionId, { type: "dr/sessionSave", draft: draftOf(eventId, input, sessionId) }),
    invite: (session: Resolved, eventId: string, sessionId: string, appIds: string[], ip: string | null) => change(session, eventId, ip, sessionId, { type: "dr/sessionInvite", sessionId, appIds }),
    cancel: (session: Resolved, eventId: string, sessionId: string, reason: string, ip: string | null) => change(session, eventId, ip, sessionId, { type: "dr/sessionCancel", sessionId, reason }),
    attend: (session: Resolved, eventId: string, sessionId: string, appId: string, present: boolean, ip: string | null) =>
      change(session, eventId, ip, sessionId, { type: "dr/sessionAttend", sessionId, appId, present }),
    outcome: (session: Resolved, eventId: string, sessionId: string, input: { appId: string; category: DrSession["outcomes"][number]["category"]; note: string }, ip: string | null) =>
      change(session, eventId, ip, sessionId, { type: "dr/sessionOutcome", sessionId, appId: input.appId, category: input.category, note: input.note }),
  };
}
export type SessionsService = ReturnType<typeof createSessionsService>;
