/**
 * The live board (backend-plan.md, M3.4), for the lead, operations, coordinators and reviewers on the summit days.
 *
 * Arrivals come from the Deal Room desk's own table (the scanners write it, M2.2): a check-in counts for all of
 * that day's meetings, so the board works out who is late or missing from it and the clock, without the scanners
 * writing into meeting records. Starting a meeting, recording its outcome and refilling a no-show go through the
 * rules under the event's lock. An outcome carries the device's own id: sent twice, it is recorded once.
 */
import type { LiveBoard, LiveMeeting, OutcomeEntry, SyncInput, SyncResult } from "@excursia/contracts/live";
import { apply } from "@excursia/domain/core/reducer";
import { syncVerdict } from "@excursia/domain/dealroom/meetings";
import type { Action } from "@excursia/domain/core/reducer";
import { nairobiNow, type Actor } from "@excursia/domain/ctx";
import { PROGRAMME_DAYS, boardFlag, drCan, occupies, readyToSchedule, sessionOpenOutcomes, staffName } from "@excursia/domain/dealroom/logic";
import type { DealRoomState, DrConfig, DrMeeting, DrStaff } from "@excursia/domain/dealroom/types";
import { addMinutes } from "@excursia/domain/time";
import type { AppState } from "@excursia/domain/types";
import { HttpError } from "../../http/errors";
import type { Resolved } from "../auth/auth.service";
import { stateOf, type Commands } from "../dealroom/dealroom.commands";
import type { DealRoomRepo } from "../dealroom/dealroom.repo";
import type { LiveRepo } from "./live.repo";

export type LiveDeps = { repo: LiveRepo; drRepo: DealRoomRepo; commands: Commands; now: () => Date };

function daysOf(state: AppState, eventId: string): string[] {
  const e = state.events.find((x) => x.id === eventId);
  return e ? Array.from({ length: e.days }, (_, i) => addMinutes(`${e.startDate} 00:00`, i * 1440).slice(0, 10)) : [];
}

export function createLiveService({ repo, drRepo, commands, now }: LiveDeps) {
  /** The team on the day: anyone who runs the board or records outcomes. Oversight reads the reports (M4.3). */
  async function member(session: Resolved, eventId: string): Promise<{ actor: Actor; staff: DrStaff }> {
    const row = await drRepo.staffForUser(session.user.id, eventId);
    if (!row) throw new HttpError("forbidden", "You're not on this event's Deal Room team.");
    const staff = row.record as unknown as DrStaff;
    if (!drCan(staff, "liveboard") && !drCan(staff, "outcome")) throw new HttpError("forbidden", `Your role, ${staff.role}, doesn't run the live board.`);
    return { actor: { kind: "staff", id: row.id }, staff };
  }

  /** The day the board shows: the one asked for if it is a summit day, else today in summit week, else the first. */
  function dayFor(days: string[], asked: string | undefined, at: string) {
    const today = at.slice(0, 10);
    return asked && days.includes(asked) ? asked : days.includes(today) ? today : (days[0] ?? today);
  }

  /** The board's version for a day, without loading the Deal Room: what a poll asks first. */
  async function version(session: Resolved, eventId: string, asked: string | undefined): Promise<string> {
    const { staff } = await member(session, eventId);
    const at = nairobiNow(now());
    return repo.version(eventId, dayFor(await repo.days(eventId), asked, at), at, staff.id);
  }

  async function board(session: Resolved, eventId: string, asked: string | undefined): Promise<LiveBoard> {
    const { staff } = await member(session, eventId);
    const stored = await drRepo.load(eventId);
    if (!stored) throw new HttpError("not_found", "This event has no Deal Room.");
    const at = nairobiNow(now());
    const state = stateOf(eventId, stored, at);
    const day = dayFor(daysOf(state, eventId), asked, at);
    const [arrivals, v] = await Promise.all([repo.arrivals(eventId, day), repo.version(eventId, day, at, staff.id)]);
    return build(state, eventId, day, at, staff, arrivals, v);
  }

  function build(state: AppState, eventId: string, day: string, at: string, staff: DrStaff, arrivals: { delegateId: string; at: Date }[], version: string): LiveBoard {
    const dr: DealRoomState = state.dealRoom;
    const cfg: DrConfig = dr.configs[eventId];
    const event = state.events.find((e) => e.id === eventId);
    const days = daysOf(state, eventId);
    const today = at.slice(0, 10);
    const isToday = day === today;
    // a check-in at the desk counts for all of that day's meetings
    const arrivedAt = new Map(arrivals.map((a) => [a.delegateId, nairobiNow(a.at)]));
    const arrival = (appId: string) => {
      const a = dr.apps.find((x) => x.id === appId);
      return a?.delegateId ? (arrivedAt.get(a.delegateId) ?? null) : null;
    };
    const ready = readyToSchedule(dr, cfg);
    const slotsLeft = isToday && cfg.rules.dayEnd > at.slice(11);
    const todays = dr.meetings.filter((m) => m.eventId === eventId && m.start.slice(0, 10) === day && m.status !== "Cancelled" && (occupies(m, cfg, at) || m.status === "Held" || m.status === "No-show")).sort((a, b) => a.start.localeCompare(b.start) || (a.roomId ?? "").localeCompare(b.roomId ?? ""));
    const room = (id?: string) => state.rooms.find((r) => r.id === id)?.name ?? "a Deal Room room";
    const meetings: LiveMeeting[] = todays.map((m) => {
      const match = dr.matches.find((x) => x.id === m.matchId)!;
      const s = dr.apps.find((a) => a.id === match.seekerId)!;
      const p = dr.apps.find((a) => a.id === match.providerId)!;
      const arrived = { seeker: m.arrivals.seeker ?? arrival(s.id), provider: m.arrivals.provider ?? arrival(p.id) };
      // the flags follow the desk's arrivals, not only what the meeting itself recorded
      const flag = isToday ? boardFlag({ ...m, arrivals: { seeker: arrived.seeker ?? undefined, provider: arrived.provider ?? undefined } } as DrMeeting, cfg, at) : undefined;
      const present = m.status === "No-show" ? (m.noShow === "seeker" ? p : m.noShow === "provider" ? s : undefined) : undefined;
      const refill = present ? ready.filter((x) => x.id !== match.id && (x.seekerId === present.id || x.providerId === present.id)).map((x) => ({ matchId: x.id, with: dr.apps.find((a) => a.id === (x.seekerId === present.id ? x.providerId : x.seekerId))?.org.name ?? "" })) : [];
      const recorded = m.status === "Held" || m.status === "No-show";
      const o = m.outcome;
      const seesNotes = !o?.sensitive || staff.role === "Lead" || staff.id === o?.owner;
      return {
        id: m.id,
        start: m.start,
        end: m.end,
        roomId: m.roomId ?? null,
        table: m.table ?? null,
        where: m.link ? "Online" : `${room(m.roomId)}${m.table && (cfg.rooms[m.roomId!]?.tables ?? 1) > 1 ? `, table ${m.table}` : ""}`,
        online: !!m.link,
        status: m.status,
        flag: flag ? { kind: flag.kind, missing: flag.missing } : null,
        seeker: { id: s.id, org: s.org.name, person: s.decisionMaker.name, arrived: arrived.seeker },
        provider: { id: p.id, org: p.org.name, person: p.decisionMaker.name, arrived: arrived.provider },
        noShow: m.noShow ?? null,
        outcome: o
          ? { category: o.category, nextAction: o.nextAction ?? null, owner: o.owner ? staffName(dr, o.owner) : null, due: o.due ?? null, notes: seesNotes ? (o.notes ?? null) : null, sensitive: !!o.sensitive, by: staffName(dr, o.by), at: o.at }
          : null,
        refill,
        history: m.history.slice(-5).map((h) => ({ at: h.at, what: h.what })),
        can: {
          start: isToday && m.status === "Confirmed" && at >= addMinutes(m.start, -15) && (drCan(staff, "liveboard") || drCan(staff, "outcome")),
          record: isToday && drCan(staff, "outcome") && (m.status === "Confirmed" || m.status === "In progress") && at >= addMinutes(m.start, -30),
          paper: drCan(staff, "outcome") && recorded,
          refill: slotsLeft && drCan(staff, "schedule") && m.status === "No-show" && refill.length > 0,
        },
      };
    });
    const dayIndex = days.indexOf(day);
    const plan = PROGRAMME_DAYS[dayIndex] ?? PROGRAMME_DAYS[0];
    const sessions = dr.sessions.filter((x) => x.eventId === eventId && x.start.slice(0, 10) === day && !x.cancelled);
    const ended = sessions.filter((x) => x.end <= at);
    const dayMeetings = dr.meetings.filter((m) => m.eventId === eventId && m.start.slice(0, 10) === day);
    // everyone checked in that day: at the desk, or on a meeting's own record
    const checkedIn = new Set([
      ...arrivals.map((a) => a.delegateId),
      ...meetings.flatMap((m) => [m.seeker.arrived ? dr.apps.find((a) => a.id === m.seeker.id)?.delegateId : undefined, m.provider.arrived ? dr.apps.find((a) => a.id === m.provider.id)?.delegateId : undefined]).filter((x): x is string => !!x),
    ]).size;
    return {
      event: { id: eventId, name: event?.name ?? eventId, days, now: at },
      day,
      inSummit: days.includes(today),
      lateMin: cfg.rules.lateMin,
      version,
      counts: {
        upcoming: meetings.filter((m) => m.status === "Confirmed").length,
        live: meetings.filter((m) => m.status === "In progress").length,
        held: meetings.filter((m) => m.status === "Held").length,
        noShow: meetings.filter((m) => m.status === "No-show").length,
        arrived: checkedIn,
      },
      rooms: Object.entries(cfg.rooms).map(([id, rc]) => ({ id, name: room(id), tables: rc.tables })),
      meetings,
      owners: dr.staff.filter((x) => x.eventId === eventId && x.active && x.role !== "Operations" && x.role !== "Oversight").map((x) => ({ id: x.id, name: x.name })),
      closeOut: {
        checklist: plan.closeOut,
        emphasis: plan.emphasis,
        meetingsHeld: dayMeetings.filter((m) => m.status === "Held").length,
        meetingsWithoutOutcome: dayMeetings.filter((m) => (m.status === "Held" && !m.outcome) || (occupies(m, cfg, at) && m.status !== "Held" && m.status !== "No-show" && m.end <= at)).length,
        noShows: dayMeetings.filter((m) => m.status === "No-show").length,
        sessionsHeld: ended.length,
        sessionsWithoutAttendance: ended.filter((x) => x.attended.length === 0).length,
        sessionOutcomesOpen: ended.reduce((n, x) => n + sessionOpenOutcomes(x).length, 0),
        arrivals: checkedIn,
        reportSentAt: cfg.dailyReports?.[day] ?? null,
      },
      conflicts: dr.conflicts
        .filter((c) => !c.resolved)
        .flatMap((c) => {
          const m = dr.meetings.find((x) => x.id === c.meetingId && x.eventId === eventId);
          if (!m) return [];
          const match = dr.matches.find((x) => x.id === m.matchId)!;
          const org = (id: string) => dr.apps.find((a) => a.id === id)?.org.name ?? "";
          const label = (o: { category: string; notes?: string; attendance?: string; noShow?: string }) =>
            o.attendance === "No-show" || o.notes?.startsWith("Recorded as a no-show") ? (o.notes?.replace(/^Recorded as a no-show( on [^:]+)?: /, "No-show: ") ?? "No-show") : o.category;
          return [
            {
              id: c.id,
              meetingId: m.id,
              start: m.start,
              where: m.link ? "Online" : room(m.roomId),
              pair: `${org(match.seekerId)} with ${org(match.providerId)}`,
              kept: { label: label(c.kept), by: staffName(dr, c.kept.by), at: c.kept.at },
              incoming: { label: label(c.incoming), by: staffName(dr, c.incoming.by), at: c.incoming.at, device: c.incoming.device },
            },
          ];
        }),
      incidents: dr.incidents.filter((i) => i.startedAt.slice(0, 10) === day).map((i) => ({ id: i.id, startedAt: i.startedAt, endedAt: i.endedAt ?? null, cause: i.cause, synced: i.synced, duplicates: i.duplicates, conflicts: i.conflicts })),
      can: { liveboard: drCan(staff, "liveboard"), outcome: drCan(staff, "outcome"), schedule: drCan(staff, "schedule"), resolve: staff.role === "Lead" },
    };
  }

  /**
   * A phone's queue, sent when it reconnects. Each record is tried in turn against what is stored now, under the
   * event's lock: recorded, a duplicate of one already there, a conflict for the lead, or refused with the rule's
   * reason (a meeting cancelled meanwhile, say). None of them stops the others. The outage is logged with the tally.
   */
  async function sync(session: Resolved, eventId: string, input: SyncInput, day: string | undefined, ip: string | null): Promise<SyncResult & { board: LiveBoard }> {
    const { actor } = await member(session, eventId);
    let results: SyncResult["results"] = [];
    await commands.run({
      eventId,
      actor,
      userId: session.user.id,
      ip,
      actions: (s, ctx) => {
        results = [];
        const keep: Action[] = [];
        let state = s;
        for (const r of input.records) {
          const verdict = syncVerdict(state.dealRoom, r.meetingId, r.clientId);
          if (verdict === "duplicate") {
            results.push({ clientId: r.clientId, meetingId: r.meetingId, result: "duplicate", reason: null });
            continue;
          }
          const o = r.outcome;
          const action: Action = {
            type: "dr/syncOutcome",
            meetingId: r.meetingId,
            device: input.device,
            record: {
              attendance: r.attendance,
              noShow: r.attendance === "No-show" ? (r.noShow ?? "both") : undefined,
              outcome: r.attendance === "Held" && o ? { category: o.category, nextAction: o.nextAction || undefined, owner: o.nextAction ? o.owner : undefined, due: o.nextAction ? o.due : undefined, notes: o.notes || undefined, sensitive: o.sensitive || undefined } : undefined,
              clientId: r.clientId,
              at: r.at,
            },
          };
          // tried here first, so one record the rules refuse doesn't stop the rest
          const tried = apply(state, action, ctx);
          if (tried.refusal) {
            results.push({ clientId: r.clientId, meetingId: r.meetingId, result: "refused", reason: tried.refusal });
            continue;
          }
          state = tried.state;
          keep.push(action);
          results.push({ clientId: r.clientId, meetingId: r.meetingId, result: verdict === "conflict" ? "conflict" : "recorded", reason: null });
        }
        if (input.offlineSince)
          keep.push({
            type: "dr/logIncident",
            device: input.device,
            startedAt: input.offlineSince > ctx.now ? ctx.now : input.offlineSince,
            synced: results.filter((x) => x.result === "recorded").length,
            duplicates: results.filter((x) => x.result === "duplicate").length,
            conflicts: results.filter((x) => x.result === "conflict").length,
          });
        return keep;
      },
    });
    return { results, board: await board(session, eventId, day) };
  }

  /** A change on the day, through the rules; then the board as it is now, so the phone shows it at once. */
  async function onMeeting(session: Resolved, eventId: string, meetingId: string, day: string | undefined, ip: string | null, action: (state: AppState) => Action | null): Promise<LiveBoard> {
    const { actor } = await member(session, eventId);
    await commands.run({
      eventId,
      actor,
      userId: session.user.id,
      ip,
      owned: (s) => {
        if (!s.dealRoom.meetings.some((m) => m.id === meetingId && m.eventId === eventId)) throw new HttpError("not_found", "No such meeting in this Deal Room.");
      },
      actions: (s) => {
        const a = action(s);
        return a ? [a] : [];
      },
    });
    return board(session, eventId, day);
  }

  return {
    version,
    board,
    start: (session: Resolved, eventId: string, meetingId: string, day: string | undefined, ip: string | null) => onMeeting(session, eventId, meetingId, day, ip, () => ({ type: "dr/startMeeting", meetingId })),
    outcome: (session: Resolved, eventId: string, meetingId: string, input: OutcomeEntry, day: string | undefined, ip: string | null) =>
      onMeeting(session, eventId, meetingId, day, ip, (s) => {
        // the same record sent twice (a retry, a double tap) is recorded once
        const m = s.dealRoom.meetings.find((x) => x.id === meetingId);
        if (m?.outcome?.clientId === input.clientId) return null;
        if ((m?.status === "Held" || m?.status === "No-show") && !m.outcome && input.attendance === m.status && !input.paper) return null;
        const o = input.outcome;
        return {
          type: "dr/outcome",
          meetingId,
          attendance: input.attendance,
          noShow: input.attendance === "No-show" ? (input.noShow ?? "both") : undefined,
          outcome: input.attendance === "Held" && o ? { category: o.category, nextAction: o.nextAction || undefined, owner: o.nextAction ? o.owner : undefined, due: o.nextAction ? o.due : undefined, notes: o.notes || undefined, sensitive: o.sensitive || undefined, clientId: input.clientId } : undefined,
          paper: input.paper || undefined,
        };
      }),
    refill: (session: Resolved, eventId: string, meetingId: string, matchId: string, day: string | undefined, ip: string | null) => onMeeting(session, eventId, meetingId, day, ip, () => ({ type: "dr/refill", meetingId, matchId })),
    sync,
    resolve: async (session: Resolved, eventId: string, conflictId: string, chose: "kept" | "incoming", day: string | undefined, ip: string | null) => {
      const { actor } = await member(session, eventId);
      await commands.run({
        eventId,
        actor,
        userId: session.user.id,
        ip,
        owned: (s) => {
          const c = s.dealRoom.conflicts.find((x) => x.id === conflictId);
          if (!c || !s.dealRoom.meetings.some((m) => m.id === c.meetingId && m.eventId === eventId)) throw new HttpError("not_found", "No such conflict in this Deal Room.");
        },
        actions: () => [{ type: "dr/resolveConflict", conflictId, chose }],
      });
      return board(session, eventId, day);
    },
  };
}
export type LiveService = ReturnType<typeof createLiveService>;

/**
 * The worker's round at 19:00: each summit day's report to the lead, once. One command per event, decided again
 * under the lock, so two workers never send it twice.
 */
export function createDailyReports({ drRepo, commands, now, events, log = console }: { drRepo: DealRoomRepo; commands: Commands; now: () => Date; events: () => Promise<string[]>; log?: Pick<Console, "error"> }) {
  return async function round(): Promise<number> {
    const at = nairobiNow(now());
    if (at.slice(11) < "19:00") return 0;
    const day = at.slice(0, 10);
    let sent = 0;
    for (const eventId of await events()) {
      const stored = await drRepo.load(eventId);
      if (!stored) continue;
      const state = stateOf(eventId, stored, at);
      const cfg = state.dealRoom.configs[eventId];
      if (!cfg || cfg.dailyReports?.[day] || !daysOf(state, eventId).includes(day)) continue;
      try {
        await commands.run({ eventId, actor: { kind: "system" }, userId: null, ip: null, actions: (s) => (s.dealRoom.configs[eventId]?.dailyReports?.[day] ? [] : [{ type: "dr/dailyReport", eventId, day }]) });
        sent++;
      } catch (e) {
        log.error(`[live] the daily report for ${eventId} failed: ${(e as Error).message}`);
      }
    }
    return sent;
  };
}
