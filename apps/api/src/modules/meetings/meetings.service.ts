/**
 * Scheduling (backend-plan.md, M3.2).
 *
 * The team's side: operations, the lead and coordinators see the pairs ready to schedule, the schedule by day,
 * the moves waiting and each party against its cap. They propose a slot, or draft a schedule for every ready pair
 * at once; move, cancel, and accept or decline a move both parties agreed. Every change goes through the rules
 * under the event's lock, and the database's exclusion constraint refuses a double booking whatever happens.
 *
 * The participant's side: signed in with the email they applied with, they see their own meetings only, confirm
 * them, ask to move one to a time when both sides and a table are free, answer the other side's request, and take
 * a confirmed meeting into their calendar as an .ics file.
 *
 * The worker's side: a proposal that lapsed unconfirmed is told to both sides and operations once, and each
 * confirmed meeting gets a reminder the day before and half an hour before.
 */
import type { MySession } from "@excursia/contracts/sessions";
import type {
  MeetingRow,
  MoveInput,
  MoveTimes,
  MyMeeting,
  MyMeetings,
  ProposeInput,
  Proposed,
  ReadyPair,
  Schedule,
  SlotOptions,
} from "@excursia/contracts/meetings";
import type { Action } from "@excursia/domain/core/reducer";
import { nairobiNow, type Actor } from "@excursia/domain/ctx";
import {
  confirmBy,
  drCan,
  dueMeetingLapses,
  dueReminders,
  ics,
  lapsed,
  moveSpot,
  occupies,
  participantLabel,
  readyToSchedule,
  slotProblems,
  slotTimes,
  staffName,
} from "@excursia/domain/dealroom/logic";
import { acceptProblems } from "@excursia/domain/dealroom/sessions";
import { formatInfo } from "@excursia/domain/dealroom/logic";
import type { DealRoomState, DrApplication, DrConfig, DrMeeting, DrSession, DrStaff } from "@excursia/domain/dealroom/types";
import { addMinutes } from "@excursia/domain/time";
import type { AppState } from "@excursia/domain/types";
import { HttpError } from "../../http/errors";
import type { Resolved } from "../auth/auth.service";
import { stateOf, type Commands } from "../dealroom/dealroom.commands";
import type { DealRoomRepo } from "../dealroom/dealroom.repo";
import type { MeetingsRepo } from "./meetings.repo";

export type MeetingsDeps = { repo: MeetingsRepo; drRepo: DealRoomRepo; commands: Commands; now: () => Date };

type Side = "seeker" | "provider";
const sides = ["seeker", "provider"] as const;

/** The days of the event, as dates. */
function daysOf(state: AppState, eventId: string): string[] {
  const e = state.events.find((x) => x.id === eventId);
  if (!e) return [];
  return Array.from({ length: e.days }, (_, i) => addMinutes(`${e.startDate} 00:00`, i * 1440).slice(0, 10));
}

/** Where a meeting is, as both sides and the team read it. */
function whereOf(state: AppState, cfg: DrConfig, m: Pick<DrMeeting, "link" | "roomId" | "table">) {
  if (m.link) return "Online";
  const room = state.rooms.find((r) => r.id === m.roomId)?.name ?? "a Deal Room room";
  return `${room}${m.table && (cfg.rooms[m.roomId!]?.tables ?? 1) > 1 ? `, table ${m.table}` : ""}`;
}

const ref = (a: DrApplication) => ({ id: a.id, org: a.org.name, label: participantLabel(a) });

/** A meeting's two parties, by side. */
function partiesOf(dr: DealRoomState, m: DrMeeting) {
  const match = dr.matches.find((x) => x.id === m.matchId)!;
  return { match, seeker: dr.apps.find((a) => a.id === match.seekerId)!, provider: dr.apps.find((a) => a.id === match.providerId)! };
}

/** Whether the unconfirmed proposal is waiting on anyone: both sides confirmed means it never lapses. */
const unconfirmed = (m: DrMeeting) => !(m.confirm.seeker && m.confirm.provider);

export function createMeetingsService({ repo, drRepo, commands, now }: MeetingsDeps) {
  async function load(eventId: string): Promise<{ state: AppState; dr: DealRoomState; cfg: DrConfig; at: string }> {
    const stored = await drRepo.load(eventId);
    if (!stored) throw new HttpError("not_found", "This event has no Deal Room.");
    const at = nairobiNow(now());
    const state = stateOf(eventId, stored, at);
    return { state, dr: state.dealRoom, cfg: state.dealRoom.configs[eventId], at };
  }

  /* ----- the team ----- */

  async function scheduler(session: Resolved, eventId: string): Promise<{ actor: Actor; staff: DrStaff }> {
    const row = await drRepo.staffForUser(session.user.id, eventId);
    if (!row) throw new HttpError("forbidden", "You're not on this event's Deal Room team.");
    const staff = row.record as unknown as DrStaff;
    if (!drCan(staff, "schedule")) throw new HttpError("forbidden", `Your role, ${staff.role}, doesn't schedule meetings.`);
    return { actor: { kind: "staff", id: row.id }, staff };
  }

  function meetingRow(state: AppState, cfg: DrConfig, m: DrMeeting, at: string): MeetingRow {
    const dr = state.dealRoom;
    const { seeker, provider } = partiesOf(dr, m);
    const who = (by: string) => (by === "seeker" ? seeker.org.name : by === "provider" ? provider.org.name : by === "desk" ? "The Deal Room desk" : staffName(dr, by));
    return {
      id: m.id,
      matchId: m.matchId,
      start: m.start,
      end: m.end,
      roomId: m.roomId ?? null,
      table: m.table ?? null,
      online: !!m.link,
      where: whereOf(state, cfg, m),
      status: m.status,
      lapsed: lapsed(m, cfg, at),
      confirmBy: unconfirmed(m) && (m.status === "Proposed" || m.status === "Change requested") ? confirmBy(m, cfg) : null,
      flagged: !!m.flagged,
      seeker: { ...ref(seeker), confirmed: m.confirm.seeker ?? null },
      provider: { ...ref(provider), confirmed: m.confirm.provider ?? null },
      change: m.change ? { by: m.change.by, reason: m.change.reason, at: m.change.at, start: m.change.start ?? null, agreed: m.change.agreed ?? null } : null,
      override: m.override?.reason ?? null,
      history: m.history.map((h) => ({ at: h.at, who: who(h.by), what: h.what })),
    };
  }

  async function schedule(session: Resolved, eventId: string): Promise<Schedule> {
    const { staff } = await scheduler(session, eventId);
    const { state, dr, cfg, at } = await load(eventId);
    const event = state.events.find((e) => e.id === eventId);
    const days = daysOf(state, eventId);
    const holding = dr.meetings.filter((m) => occupies(m, cfg, at));
    const pairs = new Map(dr.matches.map((m) => [m.id, m]));
    const of = (appId: string) =>
      holding.filter((m) => {
        const p = pairs.get(m.matchId);
        return p?.seekerId === appId || p?.providerId === appId;
      });
    const ready: ReadyPair[] = readyToSchedule(dr, cfg).map((m) => {
      const s = dr.apps.find((a) => a.id === m.seekerId)!;
      const p = dr.apps.find((a) => a.id === m.providerId)!;
      const a = m.intro!.seeker!.at;
      const b = m.intro!.provider!.at;
      return { matchId: m.id, seeker: ref(s), provider: ref(p), acceptedAt: a > b ? a : b, flagged: p.providerKind === "DFI" };
    });
    return {
      event: { id: eventId, name: event?.name ?? eventId, days, now: at },
      rules: {
        meetingMin: cfg.rules.meetingMin,
        bufferMin: cfg.rules.bufferMin,
        flaggedMin: cfg.rules.flaggedMin,
        seekerCap: cfg.rules.seekerCap,
        providerCapDay: cfg.rules.providerCapDay,
        confirmHours: cfg.rules.confirmHours,
        dayStart: cfg.rules.dayStart,
        dayEnd: cfg.rules.dayEnd,
      },
      rooms: Object.entries(cfg.rooms).map(([id, rc]) => ({ id, name: state.rooms.find((r) => r.id === id)?.name ?? id, tables: rc.tables, from: rc.from, to: rc.to })),
      times: slotTimes(cfg),
      ready,
      meetings: dr.meetings
        .filter((m) => m.eventId === eventId)
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((m) => meetingRow(state, cfg, m, at)),
      caps: {
        providers: dr.apps
          .filter((a) => a.eventId === eventId && a.type === "provider" && a.verification?.state === "Verified")
          .map((p) => {
            const mine = of(p.id);
            const perDay = p.caps?.perDay ?? cfg.rules.providerCapDay;
            return { ...ref(p), perDay, perEvent: p.caps?.perEvent ?? perDay * 4, days: days.map((d) => mine.filter((m) => m.start.slice(0, 10) === d).length), total: mine.length };
          }),
        seekers: dr.apps
          .filter((a) => a.eventId === eventId && a.type === "seeker")
          .map((s) => ({ ...ref(s), total: of(s.id).length }))
          .filter((s) => s.total > 0),
      },
      can: { schedule: true, override: drCan(staff, "overrideCap") },
    };
  }

  /** On one day, each start time with the tables free for the pair, or why the pair can't meet then. */
  async function slots(session: Resolved, eventId: string, q: { matchId: string; day: string; flagged?: "1" | "0"; meetingId?: string }): Promise<SlotOptions> {
    await scheduler(session, eventId);
    const { state, dr, cfg } = await load(eventId);
    if (!dr.matches.some((m) => m.id === q.matchId)) throw new HttpError("not_found", "No such match in this Deal Room.");
    const moving = q.meetingId ? dr.meetings.find((m) => m.id === q.meetingId && m.matchId === q.matchId) : undefined;
    if (q.meetingId && !moving) throw new HttpError("not_found", "No such meeting for this pair.");
    const flagged = q.flagged ? q.flagged === "1" : moving?.flagged;
    const tables = Object.entries(cfg.rooms).flatMap(([roomId, rc]) => Array.from({ length: rc.tables }, (_, i) => ({ roomId, table: i + 1 })));
    return {
      day: q.day,
      times: slotTimes(cfg).map((time) => {
        const base = { matchId: q.matchId, start: `${q.day} ${time}`, flagged, ignore: moving?.id };
        const probe = slotProblems(state, { ...base, link: "https://probe.invalid" });
        if (probe.clashes.length) return { time, problem: probe.clashes.join("; "), caps: probe.caps, free: [] };
        const free = tables.filter((t) => !slotProblems(state, { ...base, ...t }).clashes.length).map((t) => ({ ...t, label: whereOf(state, cfg, t) }));
        return { time, problem: free.length ? null : "No table is free then", caps: probe.caps, free };
      }),
    };
  }

  /** A scheduling change through the rules, as the signed-in member of the team. */
  async function onSchedule(session: Resolved, eventId: string, ip: string | null, owned: (s: AppState) => void, action: Action): Promise<AppState> {
    const { actor } = await scheduler(session, eventId);
    return commands.run({ eventId, actor, userId: session.user.id, ip, owned, actions: () => [action] });
  }

  const hasMatch = (matchId: string) => (s: AppState) => {
    if (!s.dealRoom.matches.some((m) => m.id === matchId)) throw new HttpError("not_found", "No such match in this Deal Room.");
  };
  const hasMeeting = (meetingId: string) => (s: AppState) => {
    if (!s.dealRoom.meetings.some((m) => m.id === meetingId)) throw new HttpError("not_found", "No such meeting in this Deal Room.");
  };
  const rowAfter = (eventId: string, state: AppState, meetingId: string) => meetingRow(state, state.dealRoom.configs[eventId], state.dealRoom.meetings.find((m) => m.id === meetingId)!, nairobiNow(now()));

  async function propose(session: Resolved, eventId: string, input: ProposeInput, ip: string | null): Promise<MeetingRow> {
    const { override, ...req } = input;
    const after = await onSchedule(session, eventId, ip, hasMatch(input.matchId), { type: "dr/propose", req, override: override || undefined });
    const made = after.dealRoom.meetings.filter((m) => m.matchId === input.matchId && m.start === input.start && m.status === "Proposed").sort((a, b) => b.proposedAt.localeCompare(a.proposedAt))[0];
    return rowAfter(eventId, after, made.id);
  }

  async function autoPropose(session: Resolved, eventId: string, limit: number, ip: string | null): Promise<Proposed> {
    const { actor } = await scheduler(session, eventId);
    let before = 0;
    const after = await commands.run({
      eventId,
      actor,
      userId: session.user.id,
      ip,
      actions: (s) => {
        before = s.dealRoom.meetings.length;
        return [{ type: "dr/autoPropose", limit }];
      },
    });
    const cfg = after.dealRoom.configs[eventId];
    return { proposed: after.dealRoom.meetings.length - before, left: readyToSchedule(after.dealRoom, cfg).length };
  }

  async function move(session: Resolved, eventId: string, meetingId: string, input: MoveInput, ip: string | null): Promise<MeetingRow> {
    const { override, ...spot } = input;
    const after = await onSchedule(session, eventId, ip, hasMeeting(meetingId), { type: "dr/reschedule", meetingId, req: { matchId: "", ...spot }, override: override || undefined });
    return rowAfter(eventId, after, meetingId);
  }

  async function cancel(session: Resolved, eventId: string, meetingId: string, reason: string, ip: string | null): Promise<MeetingRow> {
    return rowAfter(eventId, await onSchedule(session, eventId, ip, hasMeeting(meetingId), { type: "dr/cancelMeeting", meetingId, reason }), meetingId);
  }

  async function acceptChange(session: Resolved, eventId: string, meetingId: string, ip: string | null): Promise<MeetingRow> {
    return rowAfter(eventId, await onSchedule(session, eventId, ip, hasMeeting(meetingId), { type: "dr/acceptChange", meetingId }), meetingId);
  }

  async function declineChange(session: Resolved, eventId: string, meetingId: string, reason: string, ip: string | null): Promise<MeetingRow> {
    return rowAfter(eventId, await onSchedule(session, eventId, ip, hasMeeting(meetingId), { type: "dr/declineChange", meetingId, reason }), meetingId);
  }

  /* ----- the participant ----- */

  function participant(session: Resolved): string {
    if (session.user.kind !== "participant" || !session.user.email) throw new HttpError("forbidden", "Meetings open from a participant's account. Sign in with the email you applied with.");
    return session.user.email.toLowerCase();
  }

  async function eventOf(slug: string) {
    const e = await repo.eventBySlug(slug);
    if (!e) throw new HttpError("not_found", "This event has no Deal Room.");
    return e;
  }

  /** The participant's side of one meeting, and the application acting for it. */
  async function mySide(session: Resolved, slug: string, meetingId: string) {
    const email = participant(session);
    const e = await eventOf(slug);
    const [ids, pair] = await Promise.all([repo.appIdsOf(e.id, email), repo.pairOf(e.id, meetingId)]);
    const side = pair ? sides.find((x) => ids.includes(x === "seeker" ? pair.seekerId : pair.providerId)) : undefined;
    if (!pair || !side) throw new HttpError("not_found", "No such meeting.");
    return { e, side, appId: side === "seeker" ? pair.seekerId : pair.providerId };
  }

  function myMeeting(state: AppState, cfg: DrConfig, m: DrMeeting, side: Side, at: string): MyMeeting {
    const { seeker, provider } = partiesOf(state.dealRoom, m);
    const other = side === "seeker" ? provider : seeker;
    const gone = lapsed(m, cfg, at);
    const ch = m.change;
    const both = !unconfirmed(m);
    return {
      id: m.id,
      side,
      start: m.start,
      end: m.end,
      where: whereOf(state, cfg, m),
      online: !!m.link,
      link: m.link ?? null,
      status: m.status,
      lapsed: gone,
      confirmBy: !both && (m.status === "Proposed" || m.status === "Change requested") ? confirmBy(m, cfg) : null,
      mine: { confirmed: m.confirm[side] ?? null },
      theirs: { confirmed: m.confirm[side === "seeker" ? "provider" : "seeker"] ?? null },
      other: { org: other.org.name, person: other.decisionMaker.name, label: side === "seeker" ? participantLabel(other) : `${other.org.sector}, ${other.org.country}` },
      change: ch ? { reason: ch.reason, at: ch.at, start: ch.start ?? null, agreed: ch.agreed ?? null, byMe: ch.by === side } : null,
      can: {
        confirm: (m.status === "Proposed" || m.status === "Change requested") && !m.confirm[side] && !gone,
        move: (m.status === "Proposed" || m.status === "Confirmed") && m.start > at && !gone,
        answer: m.status === "Change requested" && !!ch?.start && ch.by !== side && !ch.agreed && !gone,
        calendar: both && (m.status === "Confirmed" || m.status === "Change requested"),
      },
    };
  }

  async function mine(session: Resolved, slug: string): Promise<MyMeetings> {
    const email = participant(session);
    const e = await eventOf(slug);
    const ids = new Set(await repo.appIdsOf(e.id, email));
    const { state, dr, cfg, at } = await load(e.id);
    const list = dr.meetings
      .filter((m) => m.eventId === e.id && m.status !== "Cancelled")
      .flatMap((m) => {
        const { match } = partiesOf(dr, m);
        return sides.filter((side) => ids.has(side === "seeker" ? match.seekerId : match.providerId)).map((side) => ({ m, side }));
      })
      // a lapsed proposal the team has since replaced is history, not a meeting
      .filter(({ m }) => !lapsed(m, cfg, at) || !dr.meetings.some((x) => x.matchId === m.matchId && x.id !== m.id && x.status !== "Cancelled" && x.proposedAt > m.proposedAt))
      .sort((a, b) => a.m.start.localeCompare(b.m.start));
    return { event: { name: e.name, slug: e.slug, days: daysOf(state, e.id), now: at }, meetings: list.map(({ m, side }) => myMeeting(state, cfg, m, side, at)), sessions: mySessions(state, e.id, ids, at) };
  }

  /**
   * The sessions they host or are invited to, from their side. A cancelled one shows only to those it held (the host
   * and whoever accepted), so they know; an invitation they never took up just goes.
   */
  function mySessions(state: AppState, eventId: string, ids: Set<string>, at: string): MySession[] {
    const dr = state.dealRoom;
    return dr.sessions
      .filter((x) => x.eventId === eventId)
      .flatMap((x) => {
        const appId = x.host && ids.has(x.host) ? x.host : x.invitees.find((i) => ids.has(i));
        if (!appId) return [];
        const role = appId === x.host ? ("host" as const) : ("invited" as const);
        const answer = role === "invited" ? (x.responses[appId]?.answer ?? null) : null;
        if (x.cancelled && role === "invited" && answer !== "Accepted") return [];
        const open = !x.cancelled && x.start > at && role === "invited";
        const why = open && answer !== "Accepted" ? (acceptProblems(dr, x, appId)[0] ?? null) : null;
        const host = x.host ? (dr.apps.find((a) => a.id === x.host)?.org.name ?? "A participant") : "The Deal Room team";
        return [
          {
            id: x.id,
            title: x.title,
            format: formatInfo(x.format).short,
            what: formatInfo(x.format).what,
            start: x.start,
            end: x.end,
            room: state.rooms.find((r) => r.id === x.roomId)?.name ?? x.roomId,
            host,
            role,
            answer,
            cancelled: x.cancelled ? { at: x.cancelled.at, reason: x.cancelled.reason } : null,
            attended: x.attended.includes(appId),
            blocked: why,
            can: { accept: open && answer !== "Accepted" && !why, decline: open && answer !== "Declined" },
          },
        ];
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  /** The participant's answer to a session's invitation, through the rules, as the invited application. */
  async function respondSession(session: Resolved, slug: string, sessionId: string, answer: "Accepted" | "Declined", ip: string | null): Promise<MyMeetings> {
    const email = participant(session);
    const e = await eventOf(slug);
    const ids = new Set(await repo.appIdsOf(e.id, email));
    const { dr } = await load(e.id);
    const x: DrSession | undefined = dr.sessions.find((s) => s.id === sessionId && s.eventId === e.id);
    const appId = x?.invitees.find((i) => ids.has(i));
    if (!x || !appId) throw new HttpError("not_found", "No such invitation.");
    await commands.run({
      eventId: e.id,
      actor: { kind: "applicant", appId },
      userId: session.user.id,
      ip,
      owned: (s) => {
        if (!s.dealRoom.sessions.some((y) => y.id === sessionId && y.invitees.includes(appId))) throw new HttpError("not_found", "No such invitation.");
      },
      actions: () => [{ type: "dr/sessionRespond", sessionId, appId, answer }],
    });
    return mine(session, slug);
  }

  /** A change the participant makes to one of its meetings, through the rules, as its own application. */
  async function onMine(session: Resolved, slug: string, meetingId: string, ip: string | null, action: (side: Side) => Action): Promise<MyMeetings> {
    const { e, side, appId } = await mySide(session, slug, meetingId);
    await commands.run({ eventId: e.id, actor: { kind: "applicant", appId }, userId: session.user.id, ip, owned: hasMeeting(meetingId), actions: () => [action(side)] });
    return mine(session, slug);
  }

  const confirm = (session: Resolved, slug: string, meetingId: string, ip: string | null) => onMine(session, slug, meetingId, ip, (side) => ({ type: "dr/confirm", meetingId, side }));
  const askMove = (session: Resolved, slug: string, meetingId: string, input: { start: string; reason: string }, ip: string | null) =>
    onMine(session, slug, meetingId, ip, (side) => ({ type: "dr/requestChange", meetingId, side, reason: input.reason, start: input.start }));
  const answerMove = (session: Resolved, slug: string, meetingId: string, input: { agree: boolean; reason?: string }, ip: string | null) =>
    onMine(session, slug, meetingId, ip, (side) => ({ type: "dr/answerChange", meetingId, side, agree: input.agree, reason: input.reason }));

  /** The times on one day when both sides and a table are free, for a move. */
  async function times(session: Resolved, slug: string, meetingId: string, day: string): Promise<MoveTimes> {
    const { e } = await mySide(session, slug, meetingId);
    const { state, dr, cfg, at } = await load(e.id);
    const m = dr.meetings.find((x) => x.id === meetingId)!;
    if (!daysOf(state, e.id).includes(day)) return { day, times: [] };
    return { day, times: slotTimes(cfg).filter((t) => `${day} ${t}` > at && `${day} ${t}` !== m.start && !!moveSpot(state, m, `${day} ${t}`)) };
  }

  /** A confirmed meeting as an .ics file for the participant's calendar. */
  async function invite(session: Resolved, slug: string, meetingId: string): Promise<{ filename: string; body: string }> {
    const { e, side } = await mySide(session, slug, meetingId);
    const { state, dr, cfg, at } = await load(e.id);
    const m = dr.meetings.find((x) => x.id === meetingId)!;
    const mm = myMeeting(state, cfg, m, side, at);
    if (!mm.can.calendar) throw new HttpError("conflict", "A meeting goes into your calendar once both sides have confirmed it.");
    const where = m.link ? `Online: ${m.link}` : `${mm.where}, ${e.name} Deal Room`;
    return { filename: `deal-room-${m.start.slice(0, 10)}-${m.start.slice(11).replace(":", "")}.ics`, body: ics(m, `Deal Room: ${mm.other.org}`, where) };
  }

  return { schedule, slots, propose, autoPropose, move, cancel, acceptChange, declineChange, mine, confirm, askMove, answerMove, times, invite, respondSession };
}
export type MeetingsService = ReturnType<typeof createMeetingsService>;

/**
 * The worker's round: proposals that lapsed unconfirmed, told once; reminders a day before and half an hour before
 * each confirmed meeting. One command per event, worked out again under the lock, so a round never repeats one.
 */
export function createMeetingJobs({ repo, drRepo, commands, now, log = console }: Omit<MeetingsDeps, "commands"> & { commands: Commands; log?: Pick<Console, "error"> }) {
  return async function round(): Promise<{ lapsed: number; reminded: number }> {
    const done = { lapsed: 0, reminded: 0 };
    for (const eventId of await repo.eventsWithMeetingsAhead(now())) {
      const stored = await drRepo.load(eventId);
      if (!stored) continue;
      const at = nairobiNow(now());
      const dr = stateOf(eventId, stored, at).dealRoom;
      const cfg = dr.configs[eventId];
      if (!dueMeetingLapses(dr, cfg, at).length && !dueReminders(dr, cfg, at).length) continue;
      try {
        let n = { lapsed: 0, reminded: 0 };
        await commands.run({
          eventId,
          actor: { kind: "system" },
          userId: null,
          ip: null,
          actions: (s, ctx) => {
            const c = s.dealRoom.configs[eventId];
            const lapses = dueMeetingLapses(s.dealRoom, c, ctx.now).map((m) => ({ type: "dr/meetingLapse" as const, meetingId: m.id }));
            const reminders = dueReminders(s.dealRoom, c, ctx.now).map((r) => ({ type: "dr/remindMeeting" as const, ...r }));
            n = { lapsed: lapses.length, reminded: reminders.length };
            return [...lapses, ...reminders];
          },
        });
        done.lapsed += n.lapsed;
        done.reminded += n.reminded;
      } catch (e) {
        log.error(`[meetings] lapses and reminders in ${eventId} failed: ${(e as Error).message}`);
      }
    }
    return done;
  };
}

