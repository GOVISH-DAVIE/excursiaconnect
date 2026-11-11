/**
 * Cut 2 of the Deal Room reducer: matches, introductions, consent, document access and meetings.
 * Every rule is checked here, so a burst of requests (the concurrency test) can never double-book
 * a room, a table or a person: each request is checked against the state the last one left.
 */
import type { Ctx } from "../ctx";
import type { AppState } from "../types";
import { addMinutes, fmtStamp } from "../time";
import {
  staffOf,
  blockedPair,
  bothAccepted,
  canSee,
  drCan,
  fit,
  introExpired,
  lapsed,
  matchable,
  mustHaveMisses,
  occupies,
  readyToSchedule,
  slotProblems,
  slotTimes,
  staffName,
  type SlotRequest,
} from "./logic";
import type { DealRoomState, DrMatch, DrMeeting, DrOpportunity, DrOutcome } from "./types";
import { exception, send, withDr } from "./util";

export type DrMeetAction =
  | { type: "dr/matchDecide"; seekerId: string; providerId: string; decision: "Approved" | "Rejected" | "Deferred"; note: string; override?: string }
  | { type: "dr/interest"; providerId: string; seekerId: string }
  | { type: "dr/brief"; matchId: string; text: string; agenda: string[] }
  | { type: "dr/introduce"; matchId: string; items: string[] }
  | { type: "dr/respondIntro"; matchId: string; side: "seeker" | "provider"; response: "Accepted" | "Declined"; reason?: string; consent?: string[] }
  | { type: "dr/consent"; seekerId: string; providerId: string; docId: string; granted: boolean }
  | { type: "dr/access"; seekerId: string; item: string; viewer: string; action: "view" | "download" }
  | { type: "dr/propose"; req: SlotRequest; override?: string }
  | { type: "dr/autoPropose"; limit: number }
  | { type: "dr/confirm"; meetingId: string; side: "seeker" | "provider" }
  | { type: "dr/requestChange"; meetingId: string; side: "seeker" | "provider"; reason: string }
  | { type: "dr/reschedule"; meetingId: string; req: SlotRequest; override?: string }
  | { type: "dr/cancelMeeting"; meetingId: string; reason: string }
  | { type: "dr/arrive"; delegateId: string }
  | { type: "dr/startMeeting"; meetingId: string }
  | { type: "dr/outcome"; meetingId: string; attendance: "Held" | "No-show" | "Cancelled"; noShow?: "seeker" | "provider" | "both"; outcome?: Omit<DrOutcome, "by" | "at">; device?: string; paper?: string }
  | { type: "dr/refill"; meetingId: string; matchId: string }
  | { type: "dr/offline"; on: boolean }
  | { type: "dr/sync" }
  | { type: "dr/resolveConflict"; conflictId: string; chose: "kept" | "incoming" }
  | { type: "dr/liveWindow"; rota: string[] }
  | { type: "dr/roomConfig"; roomId: string; tables: number; from: string; to: string };

const mutable = (m: DrMeeting) => m.status !== "Held" && m.status !== "No-show" && m.status !== "Cancelled";

function patchMatch(dr: DealRoomState, id: string, fn: (m: DrMatch) => DrMatch): DealRoomState {
  return { ...dr, matches: dr.matches.map((m) => (m.id === id ? fn(m) : m)) };
}
function patchMeeting(dr: DealRoomState, id: string, fn: (m: DrMeeting) => DrMeeting): DealRoomState {
  return { ...dr, meetings: dr.meetings.map((m) => (m.id === id ? fn(m) : m)) };
}

/** The brief, generated from both profiles and editable before it is sent (PRD Matching req. 5). */
export function draftBrief(dr: DealRoomState, m: DrMatch) {
  const s = dr.apps.find((a) => a.id === m.seekerId)!;
  const p = dr.apps.find((a) => a.id === m.providerId)!;
  const ask = s.ask ? `${s.ask.currency} ${s.ask.amount.toLocaleString("en")}` : "–";
  return {
    text: `${s.org.name} (${s.org.sector}, ${s.org.country}) seeks ${ask} in ${s.ask?.instrument.toLowerCase()} for: ${(s.ask?.useOfFunds ?? "").replace(/\.+$/, "")}. ${s.traction?.revenueBand ?? ""}; ${(s.traction?.metrics ?? "").replace(/\.+$/, "")}.\n\n${p.org.name} (${p.providerKind}) invests ${p.mandate?.currency} ${p.mandate?.ticketMin.toLocaleString("en")} to ${p.mandate?.ticketMax.toLocaleString("en")} in ${p.mandate?.sectors.join(", ")}, typically deciding in ${p.mandate?.timeline || "weeks"}.\n\nWhy this pair: ${(m.note || `meets ${m.met.join(", ")}`).replace(/\.+$/, "")}.\n\nDecision-makers: ${s.decisionMaker.name}, ${s.decisionMaker.title}; ${p.decisionMaker.name}, ${p.decisionMaker.title}.`,
    agenda: ["Introductions and the ask, 5 minutes", "The investor's mandate and questions, 10 minutes", "Next step and who follows up, 5 minutes"],
  };
}

function newMeeting(ctx: Ctx, dr: DealRoomState, req: SlotRequest, end: string, by: string, override?: string): DrMeeting {
  return {
    id: ctx.newId("mt"),
    eventId: dr.matches.find((m) => m.id === req.matchId)!.eventId,
    matchId: req.matchId,
    roomId: req.link ? undefined : req.roomId,
    table: req.link ? undefined : req.table,
    link: req.link,
    start: req.start,
    end,
    flagged: req.flagged,
    status: "Proposed",
    proposedAt: dr.clock,
    confirm: {},
    arrivals: {},
    override: override ? { reason: override, by } : undefined,
    history: [{ at: dr.clock, by, what: `Proposed ${fmtStamp(req.start)}` }],
  };
}

function where(state: AppState, m: DrMeeting) {
  if (m.link) return "online";
  const r = state.rooms.find((x) => x.id === m.roomId);
  return `${r?.name ?? "a Deal Room room"}${m.table && (state.dealRoom.configs[m.eventId].rooms[m.roomId!]?.tables ?? 1) > 1 ? `, table ${m.table}` : ""}`;
}

/** Book one slot if every rule allows it; otherwise the state is returned unchanged. */
function book(ctx: Ctx, state: AppState, req: SlotRequest, by: string, override?: string): AppState {
  const { clashes, caps, end } = slotProblems(state, req);
  if (clashes.length) return state;
  const me = staffOf(state.dealRoom, ctx.actor);
  if (caps.length && !(override?.trim() && drCan(me, "overrideCap"))) return state;
  let dr = state.dealRoom;
  const mt = newMeeting(ctx, dr, req, end, by, caps.length ? override : undefined);
  dr = { ...dr, meetings: [...dr.meetings, mt] };
  if (caps.length) dr = exception(ctx, dr, mt.eventId, by, "Cap override", `${caps.join("; ")}. ${override}`, mt.id);
  const match = dr.matches.find((m) => m.id === req.matchId)!;
  const cfg = dr.configs[mt.eventId];
  const confirmByAt = (() => {
    const w = addMinutes(mt.start, -cfg.rules.confirmHours * 60);
    const f = addMinutes(mt.proposedAt, 120);
    const b = w > f ? w : f;
    return b < mt.start ? b : mt.start;
  })();
  for (const id of [match.seekerId, match.providerId]) dr = send(ctx, dr, mt.eventId, id, `A Deal Room meeting is proposed for ${fmtStamp(mt.start)}; please confirm by ${fmtStamp(confirmByAt)}`, `/dr/${id}`);
  return withDr(state, dr);
}

export function drMeetReducer(state: AppState, action: DrMeetAction, ctx: Ctx): AppState {
  let dr = state.dealRoom;
  const at = ctx.now;
  const me = staffOf(dr, ctx.actor);

  switch (action.type) {
    /* ----- matching (DR-7, DR-10, DL-7) ----- */
    case "dr/matchDecide": {
      if (!drCan(me, "match")) return state;
      const seeker = dr.apps.find((a) => a.id === action.seekerId);
      const provider = dr.apps.find((a) => a.id === action.providerId);
      if (!seeker || !provider) return state;
      const cfg = dr.configs[seeker.eventId];
      if (action.decision === "Approved" && (!matchable(seeker) || !matchable(provider))) return state;
      const blocked = blockedPair(dr, seeker.id, provider.id, cfg);
      if (blocked && !(action.override?.trim() && me!.role === "Lead")) return state;
      const f = fit(seeker, provider, cfg);
      const mandatoryMiss = mustHaveMisses(cfg, provider, f.missed);
      // a ticket-size or exclusion miss needs a reviewer's note to approve (PRD Matching req. 2)
      if (action.decision === "Approved" && (mandatoryMiss.length || f.exclusionHit) && !action.note.trim()) return state;
      const existing = dr.matches.find((m) => m.seekerId === seeker.id && m.providerId === provider.id);
      const entry = { at, by: me!.id, what: `${action.decision}${action.note ? `: ${action.note}` : ""}${blocked ? ` (re-proposed after ${blocked.toLowerCase()}, lead override)` : ""}` };
      if (existing) {
        dr = patchMatch(dr, existing.id, (m) => ({ ...m, ...f, decision: action.decision, note: action.note, by: me!.id, at, intro: blocked ? undefined : m.intro, override: blocked ? { by: me!.id, at, reason: action.override! } : m.override, history: [...m.history, entry] }));
      } else {
        const m: DrMatch = { id: ctx.newId("mx"), eventId: seeker.eventId, seekerId: seeker.id, providerId: provider.id, origin: "search", ...f, decision: action.decision, note: action.note, by: me!.id, at, history: [entry] };
        dr = { ...dr, matches: [...dr.matches, m] };
      }
      if (blocked) dr = exception(ctx, dr, seeker.eventId, me!.id, "Re-proposed pair", `${seeker.org.name} and ${provider.org.name} after ${blocked.toLowerCase()}: ${action.override}`, seeker.ref ?? seeker.id);
      if (action.decision === "Approved") {
        const m = dr.matches.find((x) => x.seekerId === seeker.id && x.providerId === provider.id)!;
        if (!m.brief) dr = patchMatch(dr, m.id, (x) => ({ ...x, brief: { ...draftBrief(dr, x), editedAt: at } }));
      }
      return withDr(state, dr);
    }

    case "dr/interest": {
      const provider = dr.apps.find((a) => a.id === action.providerId);
      if (!provider || !canSee(dr, provider, { kind: "teaser", seekerId: action.seekerId }).ok) return state;
      if (dr.matches.some((m) => m.seekerId === action.seekerId && m.providerId === provider.id)) return state;
      const seeker = dr.apps.find((a) => a.id === action.seekerId)!;
      const f = fit(seeker, provider, dr.configs[seeker.eventId]);
      dr = { ...dr, matches: [...dr.matches, { id: ctx.newId("mx"), eventId: seeker.eventId, seekerId: seeker.id, providerId: provider.id, origin: "interest", ...f, decision: "Suggested", note: "", by: "applicant", at, history: [{ at, by: "applicant", what: `${provider.org.name} expressed interest` }] }] };
      dr = send(ctx, dr, seeker.eventId, seeker.assignee ?? "st_lead", `Expression of interest in ${seeker.ref}`, "/dealroom/matching", "Email");
      return withDr(state, dr);
    }

    case "dr/brief": {
      if (!drCan(me, "introduce")) return state;
      return withDr(state, patchMatch(dr, action.matchId, (m) => ({ ...m, brief: { text: action.text, agenda: action.agenda.filter(Boolean), editedAt: at }, history: [...m.history, { at, by: me!.id, what: "Brief edited" }] })));
    }

    case "dr/introduce": {
      const m = dr.matches.find((x) => x.id === action.matchId);
      if (!m || !drCan(me, "introduce") || m.decision !== "Approved" || !m.brief || m.intro) return state;
      const seeker = dr.apps.find((a) => a.id === m.seekerId)!;
      const provider = dr.apps.find((a) => a.id === m.providerId)!;
      if (!matchable(seeker) || !matchable(provider)) return state;
      const items = ["teaser", "profile", ...action.items.filter((i) => seeker.documents.some((d) => d.id === i))];
      dr = patchMatch(dr, m.id, (x) => ({ ...x, intro: { items, sentAt: at, by: me!.id }, history: [...x.history, { at, by: me!.id, what: `Introduction sent with ${items.length - 2} document${items.length === 3 ? "" : "s"} proposed` }] }));
      for (const id of [m.seekerId, m.providerId]) dr = send(ctx, dr, m.eventId, id, "You have a Deal Room introduction to review", `/dr/${id}`);
      return withDr(state, dr);
    }

    case "dr/respondIntro": {
      const m = dr.matches.find((x) => x.id === action.matchId);
      if (!m?.intro || m.intro[action.side]) return state;
      const cfg = dr.configs[m.eventId];
      if (introExpired(m, cfg, at)) return state;
      dr = patchMatch(dr, m.id, (x) => ({ ...x, intro: { ...x.intro!, [action.side]: { response: action.response, reason: action.reason, at } }, history: [...x.history, { at, by: action.side === "seeker" ? m.seekerId : m.providerId, what: `${action.side === "seeker" ? "Seeker" : "Provider"} ${action.response.toLowerCase()}${action.reason ? `: ${action.reason}` : ""}` }] }));
      // the seeker's consent is recorded with the acceptance, per document, with its time and version (Flow 6)
      if (action.side === "seeker" && action.response === "Accepted") {
        const docs = m.intro.items.filter((i) => i !== "teaser" && i !== "profile");
        for (const d of docs) {
          const prev = dr.consents.filter((c) => c.seekerId === m.seekerId && c.providerId === m.providerId && c.docId === d).length;
          dr = { ...dr, consents: [...dr.consents, { id: ctx.newId("cs"), seekerId: m.seekerId, providerId: m.providerId, docId: d, granted: (action.consent ?? []).includes(d), at, version: prev + 1 }] };
        }
      }
      const other = action.side === "seeker" ? m.providerId : m.seekerId;
      dr = send(ctx, dr, m.eventId, other, `The other party ${action.response.toLowerCase()} your Deal Room introduction`, `/dr/${other}`);
      const fresh = dr.matches.find((x) => x.id === m.id)!;
      if (bothAccepted(fresh)) dr = send(ctx, dr, m.eventId, "st_ops1", "A match is ready to schedule", "/dealroom/meetings", "Email");
      return withDr(state, dr);
    }

    case "dr/consent": {
      const prev = dr.consents.filter((c) => c.seekerId === action.seekerId && c.providerId === action.providerId && c.docId === action.docId);
      const last = prev[prev.length - 1];
      if (last && last.granted === action.granted) return state;
      dr = { ...dr, consents: [...dr.consents, { id: ctx.newId("cs"), seekerId: action.seekerId, providerId: action.providerId, docId: action.docId, granted: action.granted, at, version: prev.length + 1 }] };
      if (!action.granted) {
        const seeker = dr.apps.find((a) => a.id === action.seekerId)!;
        dr = send(ctx, dr, seeker.eventId, seeker.assignee ?? "st_lead", `${seeker.ref} withdrew consent for a document`, `/dealroom/applications/${seeker.id}`, "Email");
      }
      return withDr(state, dr);
    }

    case "dr/access": {
      // every opening of a profile or a document is logged where the seeker can see it (PRD Confidentiality req. 4)
      const viewer = dr.apps.find((a) => a.id === action.viewer);
      if (!viewer) return state;
      const r = action.item === "profile" ? { kind: "profile" as const, seekerId: action.seekerId } : action.item === "teaser" ? { kind: "teaser" as const, seekerId: action.seekerId } : { kind: "doc" as const, seekerId: action.seekerId, docId: action.item };
      if (!canSee(dr, viewer, r).ok) return state;
      if (action.action === "download" && r.kind === "doc" && !dr.apps.find((a) => a.id === action.seekerId)?.documents.find((d) => d.id === action.item)?.download) return state;
      return withDr(state, { ...dr, access: [{ id: ctx.newId("ac"), seekerId: action.seekerId, item: action.item, viewer: viewer.id, action: action.action, at }, ...dr.access] });
    }

    /* ----- scheduling (DO-2 to DO-6) ----- */
    case "dr/propose": {
      if (!drCan(me, "schedule")) return state;
      if (dr.meetings.some((m) => m.matchId === action.req.matchId && occupies(m, dr.configs[m.eventId], at))) return state;
      return book(ctx, state, action.req, me!.id, action.override);
    }

    case "dr/autoPropose": {
      // a full draft inside the rules; it only creates proposals and never moves a confirmed meeting (PRD Meetings req. 5, 6)
      if (!drCan(me, "schedule")) return state;
      const cfg = Object.values(dr.configs)[0];
      const event = state.events.find((e) => e.id === cfg.eventId)!;
      let next = state;
      let made = 0;
      const times = slotTimes(cfg);
      const rooms = Object.entries(cfg.rooms);
      for (const m of readyToSchedule(dr, cfg)) {
        if (made >= action.limit) break;
        let done = false;
        for (let d = 0; d < event.days && !done; d++) {
          const day = addMinutes(`${event.startDate} 00:00`, d * 1440).slice(0, 10);
          for (const t of times) {
            const start = `${day} ${t}`;
            if (start <= addMinutes(at, 60)) continue;
            for (const [roomId, rc] of rooms) {
              for (let table = 1; table <= rc.tables && !done; table++) {
                const before = next;
                next = book(ctx, next, { matchId: m.id, roomId, table, start }, me!.id);
                if (next !== before) done = true;
              }
              if (done) break;
            }
            if (done) break;
          }
        }
        if (done) made++;
      }
      return next;
    }

    case "dr/confirm": {
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt || (mt.status !== "Proposed" && mt.status !== "Change requested") || lapsed(mt, dr.configs[mt.eventId], at)) return state;
      const confirm = { ...mt.confirm, [action.side]: at };
      const both = !!confirm.seeker && !!confirm.provider;
      dr = patchMeeting(dr, mt.id, (m) => ({ ...m, confirm, status: both ? "Confirmed" : m.status, change: both ? undefined : m.change, history: [...m.history, { at, by: action.side, what: both ? "Confirmed by both" : `Confirmed by the ${action.side}` }] }));
      if (both) {
        const match = dr.matches.find((x) => x.id === mt.matchId)!;
        for (const id of [match.seekerId, match.providerId]) dr = send(ctx, dr, mt.eventId, id, `Deal Room meeting confirmed: ${fmtStamp(mt.start)}, ${where(state, mt)}; calendar invite attached`, `/dr/${id}`);
      }
      return withDr(state, dr);
    }

    case "dr/requestChange": {
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt || !["Proposed", "Confirmed"].includes(mt.status) || !action.reason.trim()) return state;
      dr = patchMeeting(dr, mt.id, (m) => ({ ...m, status: "Change requested", change: { by: action.side, reason: action.reason, at }, history: [...m.history, { at, by: action.side, what: `Asked to move: ${action.reason}` }] }));
      dr = send(ctx, dr, mt.eventId, "st_ops1", "A participant asked to move a Deal Room meeting", "/dealroom/meetings", "Email");
      return withDr(state, dr);
    }

    case "dr/reschedule": {
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt || !drCan(me, "schedule") || !mutable(mt) || mt.status === "In progress") return state;
      const req = { ...action.req, matchId: mt.matchId, ignore: mt.id, flagged: mt.flagged };
      const { clashes, caps, end } = slotProblems(state, req);
      if (clashes.length) return state;
      if (caps.length && !(action.override?.trim() && drCan(me, "overrideCap"))) return state;
      // a room change in the same slot keeps both confirmations; a new time needs both to confirm again (PRD Meetings req. 6)
      const sameSlot = req.start === mt.start;
      dr = patchMeeting(dr, mt.id, (m) => ({
        ...m,
        roomId: req.link ? undefined : req.roomId,
        table: req.link ? undefined : req.table,
        link: req.link,
        start: req.start,
        end,
        status: sameSlot && m.status === "Confirmed" ? "Confirmed" : "Proposed",
        confirm: sameSlot ? m.confirm : {},
        proposedAt: sameSlot ? m.proposedAt : at,
        change: undefined,
        history: [...m.history, { at, by: me!.id, what: sameSlot ? `Moved to ${where(state, { ...m, roomId: req.roomId, table: req.table, link: req.link })}, same time` : `Moved to ${fmtStamp(req.start)}; both to confirm again` }],
      }));
      const match = dr.matches.find((x) => x.id === mt.matchId)!;
      for (const id of [match.seekerId, match.providerId]) dr = send(ctx, dr, mt.eventId, id, sameSlot ? "Your Deal Room meeting has a new room" : `Your Deal Room meeting moved to ${fmtStamp(req.start)}; please confirm`, `/dr/${id}`);
      return withDr(state, dr);
    }

    case "dr/cancelMeeting": {
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt || !drCan(me, "schedule") || !mutable(mt) || !action.reason.trim()) return state;
      dr = patchMeeting(dr, mt.id, (m) => ({ ...m, status: "Cancelled", history: [...m.history, { at, by: me!.id, what: `Cancelled: ${action.reason}` }] }));
      const match = dr.matches.find((x) => x.id === mt.matchId)!;
      for (const id of [match.seekerId, match.providerId]) dr = send(ctx, dr, mt.eventId, id, `Your Deal Room meeting on ${fmtStamp(mt.start)} is cancelled`, `/dr/${id}`);
      return withDr(state, dr);
    }

    /* ----- summit day (DO-7 to DO-11) ----- */
    case "dr/arrive": {
      const app = dr.apps.find((a) => a.delegateId === action.delegateId);
      if (!app) return state;
      const day = at.slice(0, 10);
      const side = app.type;
      dr = {
        ...dr,
        meetings: dr.meetings.map((m) => {
          if (m.start.slice(0, 10) !== day || m.arrivals[side] || !["Confirmed", "In progress"].includes(m.status)) return m;
          const match = dr.matches.find((x) => x.id === m.matchId)!;
          if ((side === "seeker" ? match.seekerId : match.providerId) !== app.id) return m;
          return { ...m, arrivals: { ...m.arrivals, [side]: at }, history: [...m.history, { at, by: "desk", what: `${app.org.name} checked in at the Deal Room desk` }] };
        }),
      };
      return withDr(state, dr);
    }

    case "dr/startMeeting": {
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt || mt.status !== "Confirmed") return state;
      return withDr(state, patchMeeting(dr, mt.id, (m) => ({ ...m, status: "In progress", history: [...m.history, { at, by: me?.id ?? "door", what: "In progress" }] })));
    }

    case "dr/outcome": {
      if (!drCan(me, "outcome")) return state;
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt || !["Confirmed", "In progress", "Held", "No-show"].includes(mt.status)) return state;
      if (action.attendance === "Held" && !action.outcome) return state;
      // an outcome already on record is never silently replaced: only a paper-sheet entry with a reason, logged (Flow 7 step 6)
      const recorded = mt.status === "Held" || mt.status === "No-show";
      if (recorded && !action.paper?.trim()) return state;
      const outcome: DrOutcome | undefined = action.outcome ? { ...action.outcome, by: me!.id, at } : undefined;
      if (recorded) {
        const was = mt.outcome ? `${mt.outcome.category} by ${staffName(dr, mt.outcome.by)}` : mt.status;
        dr = exception(ctx, dr, mt.eventId, me!.id, "Paper entry over an outcome", `${action.paper!.trim()} (replaced ${was})`, mt.id);
        dr = patchMeeting(dr, mt.id, (m) => ({ ...m, history: [...m.history, { at, by: me!.id, what: `Entered from the paper sheet over ${was}: ${action.paper!.trim()}` }] }));
        return withDr(state, applyOutcome(ctx, dr, dr.meetings.find((m) => m.id === mt.id)!, action.attendance, action.noShow, outcome, me!.id));
      }
      // with no connection the record waits on the device, with the id it was given there (Flow 7)
      if (dr.offline) {
        return withDr(state, { ...dr, queue: [...dr.queue, { device: action.device ?? "This device", meetingId: mt.id, attendance: action.attendance === "Cancelled" ? "No-show" : action.attendance, noShow: action.noShow, outcome: outcome ?? { category: "No fit", by: me!.id, at, clientId: ctx.newId("cl") } }] });
      }
      return withDr(state, applyOutcome(ctx, dr, mt, action.attendance, action.noShow, outcome, me!.id));
    }

    case "dr/refill": {
      // a no-show frees the slot: offer it to the next ready match of the party who came (PRD Meetings req. 10)
      if (!drCan(me, "schedule")) return state;
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt || mt.status !== "No-show") return state;
      const cfg = dr.configs[mt.eventId];
      const times = slotTimes(cfg).map((t) => `${at.slice(0, 10)} ${t}`).filter((s) => s > at);
      let next = state;
      for (const start of times) {
        const before = next;
        next = book(ctx, next, { matchId: action.matchId, roomId: mt.roomId, table: mt.table, link: mt.link, start }, me!.id);
        if (next !== before) break;
      }
      return next;
    }

    case "dr/offline": {
      if (action.on === dr.offline) return state;
      if (action.on) return withDr(state, { ...dr, offline: true, incidents: [{ id: ctx.newId("inc"), startedAt: at, cause: "Connection lost at the venue", synced: 0, duplicates: 0, conflicts: 0 }, ...dr.incidents] });
      return drMeetReducer(withDr(state, { ...dr, offline: false }), { type: "dr/sync" }, ctx);
    }

    case "dr/sync": {
      // each queued record syncs once: a client id seen before is a duplicate; a meeting already recorded differently is a conflict for the lead
      if (dr.offline) return state;
      let synced = 0;
      let duplicates = 0;
      let conflicts = 0;
      for (const q of dr.queue) {
        const mt = dr.meetings.find((m) => m.id === q.meetingId);
        if (!mt) continue;
        if (mt.outcome?.clientId === q.outcome.clientId || dr.conflicts.some((c) => c.incoming.clientId === q.outcome.clientId)) {
          duplicates++;
          continue;
        }
        if (mt.outcome) {
          conflicts++;
          dr = { ...dr, conflicts: [...dr.conflicts, { id: ctx.newId("cf"), meetingId: mt.id, kept: mt.outcome, incoming: { ...q.outcome, device: q.device } }] };
          continue;
        }
        synced++;
        dr = applyOutcome(ctx, dr, mt, q.attendance, q.noShow, q.outcome, q.outcome.by);
      }
      const inc = dr.incidents.find((i) => !i.endedAt);
      dr = { ...dr, queue: [], incidents: dr.incidents.map((i) => (i === inc ? { ...i, endedAt: at, synced, duplicates, conflicts } : i)) };
      if (inc) dr = send(ctx, dr, Object.keys(dr.configs)[0], "st_lead", `Incident report: offline ${fmtStamp(inc.startedAt)} to ${at.slice(11)}; ${synced} record${synced === 1 ? "" : "s"} synced, ${duplicates} duplicate${duplicates === 1 ? "" : "s"} dropped, ${conflicts} conflict${conflicts === 1 ? "" : "s"} to resolve`, "/dealroom/live", "Email");
      return withDr(state, dr);
    }

    case "dr/resolveConflict": {
      if (me?.role !== "Lead") return state;
      const c = dr.conflicts.find((x) => x.id === action.conflictId);
      if (!c || c.resolved) return state;
      dr = { ...dr, conflicts: dr.conflicts.map((x) => (x.id === c.id ? { ...x, resolved: { by: me.id, at, chose: action.chose } } : x)) };
      if (action.chose === "incoming") {
        const { device, ...incoming } = c.incoming;
        dr = patchMeeting(dr, c.meetingId, (m) => ({ ...m, outcome: incoming, history: [...m.history, { at, by: me.id, what: `Conflict resolved: kept the record from ${device}` }] }));
        dr = exception(ctx, dr, Object.keys(dr.configs)[0], me.id, "Paper entry over an outcome", `Outcome replaced by the record from ${device}`, c.meetingId);
      }
      return withDr(state, dr);
    }

    case "dr/liveWindow":
      return withDr(state, { ...dr, liveWindow: { declaredAt: at, by: "admin", rota: action.rota }, adminLog: [{ at, by: "admin", what: `Summit live window declared: 99.95% target, on call ${action.rota.join(", ")}` }, ...dr.adminLog] });

    case "dr/roomConfig": {
      if (!drCan(me, "schedule") && me?.role !== "Lead") return state;
      const cfg = Object.values(dr.configs)[0];
      if (action.tables < 1 || action.from >= action.to) return state;
      return withDr(state, { ...dr, configs: { ...dr.configs, [cfg.eventId]: { ...cfg, rooms: { ...cfg.rooms, [action.roomId]: { tables: action.tables, from: action.from, to: action.to } }, log: [...cfg.log, { at, by: me!.id, what: `Room set: ${action.tables} table${action.tables > 1 ? "s" : ""}, ${action.from} to ${action.to}` }] } } });
    }

    default:
      return state;
  }
}

/** Attendance and outcome on one meeting; an outcome with a next action opens an opportunity with its owner (PRD Meetings req. 12). */
function applyOutcome(ctx: Ctx, dr: DealRoomState, mt: DrMeeting, attendance: "Held" | "No-show" | "Cancelled", noShow: "seeker" | "provider" | "both" | undefined, outcome: DrOutcome | undefined, by: string): DealRoomState {
  const at = ctx.now;
  dr = patchMeeting(dr, mt.id, (m) => ({
    ...m,
    status: attendance,
    noShow: attendance === "No-show" ? noShow ?? "both" : undefined,
    outcome: outcome ?? m.outcome,
    history: [...m.history, { at, by, what: attendance === "No-show" ? `No-show: ${noShow ?? "both"}` : attendance === "Held" ? `Held: ${outcome?.category}${outcome?.nextAction ? `; next: ${outcome.nextAction}` : ""}` : "Cancelled on the day" }],
  }));
  if (attendance === "Held" && outcome?.nextAction && outcome.owner && !dr.opportunities.some((o) => o.meetingId === mt.id)) {
    const opp: DrOpportunity = {
      id: ctx.newId("op"),
      eventId: mt.eventId,
      meetingId: mt.id,
      matchId: mt.matchId,
      owner: outcome.owner,
      stage: "Follow-up",
      stageDates: { "Follow-up": at },
      nextAction: outcome.nextAction,
      due: outcome.due ?? addMinutes(at, 7 * 1440).slice(0, 10),
      // a meeting that ends in diligence, a proposal or a documented commitment records an expression of interest at once
      outcomes: ["Due diligence", "Financing or partnership proposal", "Commitment documented"].includes(outcome.category) ? [{ id: ctx.newId("oo"), kind: "Expression of interest", date: at.slice(0, 10), evidence: `Meeting outcome: ${outcome.category}`, by, at }] : [],
      updates: [],
      requests: [],
      reviews: [],
      history: [{ at, by, what: "Opened from the meeting outcome" }],
    };
    dr = { ...dr, opportunities: [...dr.opportunities, opp] };
    dr = send(ctx, dr, mt.eventId, outcome.owner, "A Deal Room opportunity is assigned to you", "/dealroom", "Email");
  }
  return dr;
}

