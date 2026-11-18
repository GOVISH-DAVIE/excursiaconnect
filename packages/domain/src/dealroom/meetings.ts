/**
 * Cut 2 of the Deal Room reducer: matches, introductions, consent, document access and meetings.
 * Every rule is checked here, so a burst of requests (the concurrency test) can never double-book
 * a room, a table or a person: each request is checked against the state the last one left.
 */
import { no, type Ctx } from "../ctx";
import type { AppState } from "../types";
import { addMinutes, fmtStamp } from "../time";
import {
  staffOf,
  blockedPair,
  confirmBy,
  reminderDue,
  type ReminderKind,
  bothAccepted,
  canSee,
  drCan,
  fieldLabel,
  fit,
  introExpired,
  latestConsent,
  lapsed,
  moveSpot,
  mustHaveMisses,
  notMatchable,
  occupies,
  readyToSchedule,
  roleOf,
  sideName,
  slotProblems,
  slotTimes,
  staffName,
  type SlotRequest,
} from "./logic";
import type { DealRoomState, DrMatch, DrMeeting, DrOpportunity, DrOutcome } from "./types";
import { exception, introLink, leadOf, meetingsLink, opsOf, send, withDr } from "./util";

export type DrMeetAction =
  | { type: "dr/matchDecide"; seekerId: string; providerId: string; decision: "Approved" | "Rejected" | "Deferred"; note: string; override?: string }
  | { type: "dr/interest"; providerId: string; seekerId: string }
  | { type: "dr/brief"; matchId: string; text: string; agenda: string[] }
  | { type: "dr/introduce"; matchId: string; items: string[] }
  | { type: "dr/respondIntro"; matchId: string; side: "seeker" | "provider"; response: "Accepted" | "Declined"; reason?: string; consent?: string[] }
  | { type: "dr/consent"; seekerId: string; providerId: string; docId: string; granted: boolean }
  /** the server's job: an introduction that expired unanswered is told to both sides and the team, once */
  | { type: "dr/introLapse"; matchId: string }
  | { type: "dr/access"; seekerId: string; item: string; viewer: string; action: "view" | "download" }
  | { type: "dr/propose"; req: SlotRequest; override?: string }
  | { type: "dr/autoPropose"; limit: number }
  | { type: "dr/confirm"; meetingId: string; side: "seeker" | "provider" }
  | { type: "dr/requestChange"; meetingId: string; side: "seeker" | "provider"; reason: string; start: string }
  | { type: "dr/answerChange"; meetingId: string; side: "seeker" | "provider"; agree: boolean; reason?: string }
  | { type: "dr/acceptChange"; meetingId: string }
  | { type: "dr/declineChange"; meetingId: string; reason: string }
  | { type: "dr/reschedule"; meetingId: string; req: SlotRequest; override?: string }
  | { type: "dr/cancelMeeting"; meetingId: string; reason: string }
  /** the server's jobs: a proposal that lapsed unconfirmed is told to both sides and operations, once */
  | { type: "dr/meetingLapse"; meetingId: string }
  /** the server's jobs: a reminder the day before, and half an hour before, a confirmed meeting */
  | { type: "dr/remindMeeting"; meetingId: string; kind: ReminderKind }
  | { type: "dr/arrive"; delegateId: string }
  | { type: "dr/startMeeting"; meetingId: string }
  | { type: "dr/outcome"; meetingId: string; attendance: "Held" | "No-show" | "Cancelled"; noShow?: "seeker" | "provider" | "both"; outcome?: Omit<DrOutcome, "by" | "at">; device?: string; paper?: string }
  | { type: "dr/refill"; meetingId: string; matchId: string }
  | { type: "dr/dailyReport"; eventId: string; day: string }
  /** an outcome recorded on a phone while it was offline, sent when it reconnects (M3.5) */
  | { type: "dr/syncOutcome"; meetingId: string; device: string; record: OfflineRecord }
  /** an outage a device lived through, with what its sync did: kept for the lead (M3.5) */
  | { type: "dr/logIncident"; device: string; startedAt: string; synced: number; duplicates: number; conflicts: number }
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
  const range = `${p.mandate?.currency} ${p.mandate?.ticketMin.toLocaleString("en")} to ${p.mandate?.ticketMax.toLocaleString("en")}`;
  // a partner buys, distributes or partners and a challenge brings a problem; only an investor invests
  const role = roleOf(p);
  const partner = role === "partner";
  const ch = p.challenge;
  const side = ch
    ? `${p.org.name} (${p.providerKind}) brings a challenge: ${ch.title.replace(/\.+$/, "")}. ${ch.problem.replace(/\.+$/, "")}. It looks for ${(p.mandate?.instruments ?? []).join(", ").toLowerCase() || "a solution"}, with contracts of ${range}. Route: ${ch.route || "to be agreed"}${ch.timeline ? `. Timeline: ${ch.timeline.replace(/\.+$/, "")}` : ""}.`
    : partner
      ? `${p.org.name} (${p.providerKind}) works with businesses in ${p.mandate?.sectors.join(", ")} on ${(p.mandate?.instruments ?? []).join(", ").toLowerCase()}, with contracts of ${range}, typically deciding in ${p.mandate?.timeline || "weeks"}.`
      : `${p.org.name} (${p.providerKind}) invests ${range} in ${p.mandate?.sectors.join(", ")}, typically deciding in ${p.mandate?.timeline || "weeks"}.`;
  // what the seeker gave of its traction, without empty parts
  const traction = [s.traction?.revenueBand ? `Revenue ${s.traction.revenueBand}` : "", s.traction?.customers ?? "", s.traction?.metrics ?? ""]
    .map((x) => x.trim().replace(/\.+$/, ""))
    .filter(Boolean)
    .join("; ");
  return {
    text: `${s.org.name} (${s.org.sector}, ${s.org.country}) seeks ${ask} in ${s.ask?.instrument.toLowerCase()} for: ${(s.ask?.useOfFunds ?? "").replace(/\.+$/, "")}.${traction ? ` ${traction}.` : ""}\n\n${side}\n\nWhy this pair: ${(m.note || `meets ${m.met.join(", ")}`).replace(/\.+$/, "")}.\n\nDecision-makers: ${s.decisionMaker.name}, ${s.decisionMaker.title}; ${p.decisionMaker.name}, ${p.decisionMaker.title}.`,
    agenda: ["Introductions and the ask, 5 minutes", ch ? "The challenge and the institution's questions, 10 minutes" : partner ? "The partner's requirements and questions, 10 minutes" : "The investor's mandate and questions, 10 minutes", "Next step and who follows up, 5 minutes"],
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

/**
 * Book one slot if every rule allows it: the new state, or why not. A cap stops it unless operations or the lead
 * give a reason to go over it, which is logged as an exception.
 */
function tryBook(ctx: Ctx, state: AppState, req: SlotRequest, by: string, override?: string): { state: AppState; why?: string } {
  const { clashes, caps, end } = slotProblems(state, req);
  if (clashes.length) return { state, why: clashes.join("; ") };
  const me = staffOf(state.dealRoom, ctx.actor);
  if (caps.length && !(override?.trim() && drCan(me, "overrideCap"))) return { state, why: `${caps.join("; ")}${drCan(me, "overrideCap") ? ": give a reason to go over the cap" : ""}` };
  let dr = state.dealRoom;
  const mt = newMeeting(ctx, dr, req, end, by, caps.length ? override : undefined);
  dr = { ...dr, meetings: [...dr.meetings, mt] };
  if (caps.length) dr = exception(ctx, dr, mt.eventId, by, "Cap override", `${caps.join("; ")}. ${override}`, mt.id);
  const match = dr.matches.find((m) => m.id === req.matchId)!;
  const by_ = confirmBy(mt, dr.configs[mt.eventId]);
  for (const id of [match.seekerId, match.providerId]) dr = send(ctx, dr, mt.eventId, id, `A Deal Room meeting is proposed for ${fmtStamp(mt.start)}; please confirm by ${fmtStamp(by_)}`, meetingsLink(id));
  return { state: withDr(state, dr) };
}

/** A participant answers for its own side only. The team, and the prototype's acting staff, may act for either. */
function notMySide(ctx: Ctx, match: DrMatch, side: "seeker" | "provider"): string | undefined {
  if (ctx.actor?.kind !== "applicant") return undefined;
  return ctx.actor.appId === (side === "seeker" ? match.seekerId : match.providerId) ? undefined : "You can answer only for your own side of a meeting";
}

/** Why a meeting can't be changed now, or undefined when it can. */
function closed(m: DrMeeting, cfg: DealRoomState["configs"][string], now: string): string | undefined {
  if (m.status === "Cancelled") return "This meeting is cancelled";
  if (m.status === "Held" || m.status === "No-show") return "This meeting has already taken place";
  if (m.status === "In progress") return "This meeting is under way";
  if (lapsed(m, cfg, now)) return "This proposal lapsed unconfirmed and its slot was released; the Deal Room team will propose another";
  return undefined;
}

/** A meeting's two parties, by side. */
function partiesOf(dr: DealRoomState, mt: DrMeeting) {
  const match = dr.matches.find((x) => x.id === mt.matchId)!;
  return { match, seeker: dr.apps.find((a) => a.id === match.seekerId)!, provider: dr.apps.find((a) => a.id === match.providerId)! };
}

/** An outcome as a phone recorded it while offline: its own id, and when it was recorded there. */
export type OfflineRecord = { attendance: "Held" | "No-show"; noShow?: "seeker" | "provider" | "both"; outcome?: Omit<DrOutcome, "by" | "at" | "clientId">; clientId: string; at: string };

/**
 * What a record sent from an offline phone does, decided on what is stored now: recorded; a duplicate (the same id
 * is already on record, or already waiting as a conflict); or a conflict, when the meeting already has a different
 * record. A conflict is never settled by the order the phones reconnect in: the lead chooses.
 */
export function syncVerdict(dr: DealRoomState, meetingId: string, clientId: string): "record" | "duplicate" | "conflict" | "missing" {
  const mt = dr.meetings.find((m) => m.id === meetingId);
  if (!mt) return "missing";
  if (mt.outcome?.clientId === clientId || dr.conflicts.some((c) => c.incoming.clientId === clientId)) return "duplicate";
  if (mt.status === "Held" || mt.status === "No-show") return "conflict";
  return "record";
}

/** A meeting's record as a conflict shows it: a no-show has no outcome of its own, so it is named as one. */
function asRecorded(mt: DrMeeting, by: string, at: string): DrOutcome {
  if (mt.outcome) return mt.outcome;
  return { category: "No fit", notes: `Recorded as a no-show: ${mt.noShow === "both" ? "neither came" : mt.noShow === "seeker" ? "the seeker didn't come" : "the counterparty didn't come"}`, by, at, clientId: `noshow_${mt.id}` };
}

export function drMeetReducer(state: AppState, action: DrMeetAction, ctx: Ctx): AppState {
  let dr = state.dealRoom;
  const at = ctx.now;
  const me = staffOf(dr, ctx.actor);

  switch (action.type) {
    /* ----- matching (DR-7, DR-10, DL-7) ----- */
    case "dr/matchDecide": {
      if (!drCan(me, "match")) return no(ctx, state, "Your role doesn't decide matches");
      const seeker = dr.apps.find((a) => a.id === action.seekerId);
      const provider = dr.apps.find((a) => a.id === action.providerId);
      if (seeker?.type !== "seeker" || provider?.type !== "provider" || seeker.eventId !== provider.eventId) return no(ctx, state, "A match pairs a seeker with a counterparty in the same Deal Room");
      const cfg = dr.configs[seeker.eventId];
      const note = action.note.trim();
      if (action.decision === "Approved") {
        const why = notMatchable(seeker) ?? notMatchable(provider);
        if (why) return no(ctx, state, why);
      } else if (!note) return no(ctx, state, `Say why the pair is ${action.decision.toLowerCase()}`);
      const existing = dr.matches.find((m) => m.seekerId === seeker.id && m.providerId === provider.id);
      const blocked = blockedPair(dr, seeker.id, provider.id, cfg);
      if (blocked && !(action.override?.trim() && me!.role === "Lead"))
        return no(ctx, state, me!.role === "Lead" ? `This pair was ${blocked.toLowerCase()} before: give the reason to propose it again` : `This pair was ${blocked.toLowerCase()} before; only the lead can propose it again`);
      if (existing?.intro && !blocked) return no(ctx, state, "This pair has been introduced; its decision can't change now");
      if (existing && !blocked && existing.decision === action.decision) return no(ctx, state, `This pair is already ${action.decision.toLowerCase()}`);
      const f = fit(seeker, provider, cfg);
      const mandatoryMiss = mustHaveMisses(cfg, provider, f.missed);
      // a ticket-size or exclusion miss needs a reviewer's note to approve (PRD Matching req. 2)
      if (action.decision === "Approved" && !note) {
        if (f.exclusionHit) return no(ctx, state, `${provider.org.name} excludes "${f.exclusionHit}": write why this pair should still meet`);
        if (mandatoryMiss.length) return no(ctx, state, `The pair misses ${mandatoryMiss.map((x) => fieldLabel(x, provider).toLowerCase()).join(" and ")}, which must match: write why it should still meet`);
      }
      const entry = { at, by: me!.id, what: `${action.decision}${note ? `: ${note}` : ""}${blocked ? ` (re-proposed after ${blocked.toLowerCase()}, lead override)` : ""}` };
      if (existing) {
        dr = patchMatch(dr, existing.id, (m) => ({ ...m, ...f, decision: action.decision, note, by: me!.id, at, intro: blocked ? undefined : m.intro, override: blocked ? { by: me!.id, at, reason: action.override!.trim() } : m.override, history: [...m.history, entry] }));
      } else {
        const m: DrMatch = { id: ctx.newId("mx"), eventId: seeker.eventId, seekerId: seeker.id, providerId: provider.id, origin: "search", ...f, decision: action.decision, note, by: me!.id, at, history: [entry] };
        dr = { ...dr, matches: [...dr.matches, m] };
      }
      if (blocked) dr = exception(ctx, dr, seeker.eventId, me!.id, "Re-proposed pair", `${seeker.org.name} and ${provider.org.name} after ${blocked.toLowerCase()}: ${action.override!.trim()}`, seeker.ref ?? seeker.id);
      if (action.decision === "Approved") {
        const m = dr.matches.find((x) => x.seekerId === seeker.id && x.providerId === provider.id)!;
        if (!m.brief) dr = patchMatch(dr, m.id, (x) => ({ ...x, brief: { ...draftBrief(dr, x), editedAt: at } }));
      }
      return withDr(state, dr);
    }

    case "dr/interest": {
      const provider = dr.apps.find((a) => a.id === action.providerId && a.type === "provider");
      if (!provider) return no(ctx, state, "No such counterparty");
      const see = canSee(dr, provider, { kind: "teaser", seekerId: action.seekerId });
      if (!see.ok) return no(ctx, state, see.reason ?? "This opportunity isn't open to you");
      if (dr.matches.some((m) => m.seekerId === action.seekerId && m.providerId === provider.id)) return no(ctx, state, "You've already shown interest in this opportunity");
      const seeker = dr.apps.find((a) => a.id === action.seekerId)!;
      const f = fit(seeker, provider, dr.configs[seeker.eventId]);
      dr = { ...dr, matches: [...dr.matches, { id: ctx.newId("mx"), eventId: seeker.eventId, seekerId: seeker.id, providerId: provider.id, origin: "interest", ...f, decision: "Suggested", note: "", by: "applicant", at, history: [{ at, by: "applicant", what: `${provider.org.name} expressed interest` }] }] };
      dr = send(ctx, dr, seeker.eventId, seeker.assignee ?? leadOf(dr, seeker.eventId), `Expression of interest in ${seeker.ref}`, "/dealroom/matching?tab=interest", "Email");
      return withDr(state, dr);
    }

    case "dr/brief": {
      if (!drCan(me, "introduce")) return no(ctx, state, "Your role doesn't write introductions");
      const m = dr.matches.find((x) => x.id === action.matchId);
      if (!m) return no(ctx, state, "No such match");
      if (m.decision !== "Approved") return no(ctx, state, "Approve the pair before writing its brief");
      if (m.intro) return no(ctx, state, "The introduction has been sent; its brief can't change");
      const text = action.text.trim();
      const agenda = action.agenda.map((x) => x.trim()).filter(Boolean);
      if (!text) return no(ctx, state, "Write the brief");
      if (m.brief && m.brief.text === text && JSON.stringify(m.brief.agenda) === JSON.stringify(agenda)) return no(ctx, state, "The brief is already this");
      return withDr(state, patchMatch(dr, m.id, (x) => ({ ...x, brief: { text, agenda, editedAt: at }, history: [...x.history, { at, by: me!.id, what: "Brief edited" }] })));
    }

    case "dr/introduce": {
      if (!drCan(me, "introduce")) return no(ctx, state, "Your role doesn't send introductions");
      const m = dr.matches.find((x) => x.id === action.matchId);
      if (!m) return no(ctx, state, "No such match");
      if (m.decision !== "Approved") return no(ctx, state, "Approve the pair before introducing it");
      if (m.intro) return no(ctx, state, "The introduction has already been sent");
      if (!m.brief) return no(ctx, state, "Write the brief first");
      const seeker = dr.apps.find((a) => a.id === m.seekerId)!;
      const provider = dr.apps.find((a) => a.id === m.providerId)!;
      const why = notMatchable(seeker) ?? notMatchable(provider);
      if (why) return no(ctx, state, why);
      if (action.items.some((i) => !seeker.documents.some((d) => d.id === i))) return no(ctx, state, "Only the seeker's own documents can be proposed");
      const docs = [...new Set(action.items)];
      const items = ["teaser", "profile", ...docs];
      dr = patchMatch(dr, m.id, (x) => ({ ...x, intro: { items, sentAt: at, by: me!.id }, history: [...x.history, { at, by: me!.id, what: `Introduction sent with ${docs.length} document${docs.length === 1 ? "" : "s"} proposed` }] }));
      for (const id of [m.seekerId, m.providerId]) dr = send(ctx, dr, m.eventId, id, "You have a Deal Room introduction to review", introLink(id));
      return withDr(state, dr);
    }

    case "dr/respondIntro": {
      const m = dr.matches.find((x) => x.id === action.matchId);
      if (!m?.intro) return no(ctx, state, "There's no introduction to answer");
      const mine = m.intro[action.side];
      if (mine) return no(ctx, state, `You've already ${mine.response.toLowerCase()} this introduction`);
      const cfg = dr.configs[m.eventId];
      if (introExpired(m, cfg, at)) return no(ctx, state, "This introduction expired unanswered");
      if (m.intro[action.side === "seeker" ? "provider" : "seeker"]?.response === "Declined") return no(ctx, state, "The other party has declined this introduction");
      const reason = action.reason?.trim() || undefined;
      if (action.response === "Declined" && !reason) return no(ctx, state, "Say why, so the Deal Room team can find a better match");
      const docs = m.intro.items.filter((i) => i !== "teaser" && i !== "profile");
      if (action.side === "seeker" && (action.consent ?? []).some((d) => !docs.includes(d))) return no(ctx, state, "You can share only the documents this introduction proposes");
      dr = patchMatch(dr, m.id, (x) => ({ ...x, intro: { ...x.intro!, [action.side]: { response: action.response, reason, at } }, history: [...x.history, { at, by: action.side === "seeker" ? m.seekerId : m.providerId, what: `${action.side === "seeker" ? "Seeker" : "Provider"} ${action.response.toLowerCase()}${reason ? `: ${reason}` : ""}` }] }));
      // the seeker's consent is recorded with the acceptance, per document, with its time and version (Flow 6)
      if (action.side === "seeker" && action.response === "Accepted") {
        for (const d of docs) {
          const prev = dr.consents.filter((c) => c.seekerId === m.seekerId && c.providerId === m.providerId && c.docId === d).length;
          dr = { ...dr, consents: [...dr.consents, { id: ctx.newId("cs"), seekerId: m.seekerId, providerId: m.providerId, docId: d, granted: (action.consent ?? []).includes(d), at, version: prev + 1 }] };
        }
      }
      const other = action.side === "seeker" ? m.providerId : m.seekerId;
      dr = send(ctx, dr, m.eventId, other, `The other party ${action.response.toLowerCase()} your Deal Room introduction`, introLink(other));
      const fresh = dr.matches.find((x) => x.id === m.id)!;
      if (bothAccepted(fresh)) dr = send(ctx, dr, m.eventId, opsOf(dr, m.eventId), "A match is ready to schedule", "/dealroom/meetings", "Email");
      return withDr(state, dr);
    }

    case "dr/consent": {
      // a seeker shares or withdraws one document with one counterparty, after accepting their introduction
      const m = dr.matches.find((x) => x.seekerId === action.seekerId && x.providerId === action.providerId);
      if (!m?.intro?.items.includes(action.docId) || action.docId === "teaser" || action.docId === "profile") return no(ctx, state, "This document isn't part of an introduction to them");
      if (m.intro.seeker?.response !== "Accepted") return no(ctx, state, "Choose what to share when you accept the introduction");
      const prev = dr.consents.filter((c) => c.seekerId === action.seekerId && c.providerId === action.providerId && c.docId === action.docId);
      const last = latestConsent(dr, action.seekerId, action.providerId, action.docId);
      if ((last?.granted ?? false) === action.granted) return no(ctx, state, action.granted ? "It's already shared with them" : "It isn't shared with them");
      dr = { ...dr, consents: [...dr.consents, { id: ctx.newId("cs"), seekerId: action.seekerId, providerId: action.providerId, docId: action.docId, granted: action.granted, at, version: prev.length + 1 }] };
      if (!action.granted) {
        const seeker = dr.apps.find((a) => a.id === action.seekerId)!;
        dr = send(ctx, dr, seeker.eventId, seeker.assignee ?? leadOf(dr, seeker.eventId), `${seeker.ref} withdrew consent for a document`, `/dealroom/applications/${seeker.id}`, "Email");
      }
      return withDr(state, dr);
    }

    case "dr/introLapse": {
      if (ctx.actor?.kind !== "system") return no(ctx, state, "Expiries are noted by the system");
      const m = dr.matches.find((x) => x.id === action.matchId);
      if (!m?.intro) return no(ctx, state, "No such introduction");
      if (m.intro.lapsedAt) return no(ctx, state, "This expiry was already noted");
      if (!introExpired(m, dr.configs[m.eventId], at)) return no(ctx, state, "This introduction hasn't expired");
      const intro = m.intro;
      dr = patchMatch(dr, m.id, (x) => ({ ...x, intro: { ...intro, lapsedAt: at }, history: [...x.history, { at, by: "system", what: "The introduction expired unanswered" }] }));
      // each side hears whether it was waiting on itself or on the other; the team can propose the pair again
      for (const side of ["seeker", "provider"] as const) {
        const id = side === "seeker" ? m.seekerId : m.providerId;
        const subject = intro[side] ? "Your Deal Room introduction expired: the other party didn't answer in time" : "Your Deal Room introduction expired before you answered";
        dr = send(ctx, dr, m.eventId, id, subject, introLink(id), "Email");
      }
      const seeker = dr.apps.find((a) => a.id === m.seekerId);
      dr = send(ctx, dr, m.eventId, seeker?.assignee ?? leadOf(dr, m.eventId), `An introduction expired unanswered${seeker?.ref ? `: ${seeker.ref}` : ""}`, `/dealroom/matches/${m.id}`, "Email");
      return withDr(state, dr);
    }

    case "dr/access": {
      // every opening of a profile or a document is logged where the seeker can see it (PRD Confidentiality req. 4)
      const viewer = dr.apps.find((a) => a.id === action.viewer);
      if (!viewer) return no(ctx, state, "No such participant");
      const r = action.item === "profile" ? { kind: "profile" as const, seekerId: action.seekerId } : action.item === "teaser" ? { kind: "teaser" as const, seekerId: action.seekerId } : { kind: "doc" as const, seekerId: action.seekerId, docId: action.item };
      const see = canSee(dr, viewer, r);
      if (!see.ok) return no(ctx, state, see.reason ?? "This isn't open to you");
      if (action.action === "download" && r.kind === "doc" && !dr.apps.find((a) => a.id === action.seekerId)?.documents.find((d) => d.id === action.item)?.download) return no(ctx, state, "The business allows this document to be viewed, not downloaded");
      return withDr(state, { ...dr, access: [{ id: ctx.newId("ac"), seekerId: action.seekerId, item: action.item, viewer: viewer.id, action: action.action, at }, ...dr.access] });
    }

    /* ----- scheduling (DO-2 to DO-6) ----- */
    case "dr/propose": {
      if (!drCan(me, "schedule")) return no(ctx, state, "Your role doesn't schedule meetings");
      if (!dr.matches.some((m) => m.id === action.req.matchId)) return no(ctx, state, "No such match");
      if (dr.meetings.some((m) => m.matchId === action.req.matchId && occupies(m, dr.configs[m.eventId], at))) return no(ctx, state, "This pair already has a meeting");
      const r = tryBook(ctx, state, action.req, me!.id, action.override);
      return r.why ? no(ctx, state, r.why) : r.state;
    }

    case "dr/autoPropose": {
      // a full draft inside the rules; it only creates proposals and never moves a confirmed meeting (PRD Meetings req. 5, 6)
      if (!drCan(me, "schedule")) return no(ctx, state, "Your role doesn't schedule meetings");
      const cfg = Object.values(dr.configs)[0];
      const event = state.events.find((e) => e.id === cfg.eventId)!;
      const ready = readyToSchedule(dr, cfg);
      if (!ready.length) return no(ctx, state, "Every pair both parties accepted already has a meeting");
      let next = state;
      let made = 0;
      const times = slotTimes(cfg);
      const tables = Object.entries(cfg.rooms).flatMap(([roomId, rc]) => Array.from({ length: rc.tables }, (_, i) => ({ roomId, table: i + 1 })));
      const soonest = addMinutes(at, 60);
      for (const m of ready) {
        if (made >= action.limit) break;
        // a DFI's meetings take the longer slot (PRD Meetings req. 2)
        const flagged = dr.apps.find((a) => a.id === m.providerId)?.providerKind === "DFI" || undefined;
        let done = false;
        for (let d = 0; d < event.days && !done; d++) {
          const day = addMinutes(`${event.startDate} 00:00`, d * 1440).slice(0, 10);
          for (const t of times) {
            const start = `${day} ${t}`;
            if (start <= soonest) continue;
            // the pair first, without a room: a party busy then, or at its cap, rules the time out for every table
            const probe = slotProblems(next, { matchId: m.id, start, flagged, link: "probe" });
            if (probe.clashes.length || probe.caps.length) continue;
            for (const spot of tables) {
              const r = tryBook(ctx, next, { matchId: m.id, start, flagged, ...spot }, me!.id);
              if (!r.why) {
                next = r.state;
                done = true;
                break;
              }
            }
            if (done) break;
          }
        }
        if (done) made++;
      }
      return made ? next : no(ctx, state, "No free slot was found for the pairs ready to schedule: every time is taken, or the parties are at their caps");
    }

    case "dr/confirm": {
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt) return no(ctx, state, "No such meeting");
      const cfg = dr.configs[mt.eventId];
      const { match } = partiesOf(dr, mt);
      const mine = notMySide(ctx, match, action.side);
      if (mine) return no(ctx, state, mine);
      const shut = closed(mt, cfg, at);
      if (shut) return no(ctx, state, shut);
      if (mt.confirm[action.side]) return no(ctx, state, mt.status === "Confirmed" ? "This meeting is already confirmed" : "You've already confirmed this slot");
      if (mt.status !== "Proposed" && mt.status !== "Change requested") return no(ctx, state, "This meeting is already confirmed");
      const confirm = { ...mt.confirm, [action.side]: at };
      const both = !!confirm.seeker && !!confirm.provider;
      dr = patchMeeting(dr, mt.id, (m) => ({ ...m, confirm, status: both && m.status === "Proposed" ? "Confirmed" : m.status, history: [...m.history, { at, by: action.side, what: both ? "Confirmed by both" : `Confirmed by the ${sideName(action.side)}` }] }));
      if (both) {
        for (const id of [match.seekerId, match.providerId]) dr = send(ctx, dr, mt.eventId, id, `Deal Room meeting confirmed: ${fmtStamp(mt.start)}, ${where(state, mt)}; add it to your calendar`, meetingsLink(id));
      } else {
        const otherId = action.side === "seeker" ? match.providerId : match.seekerId;
        dr = send(ctx, dr, mt.eventId, otherId, `The other party confirmed your Deal Room meeting of ${fmtStamp(mt.start)}; please confirm by ${fmtStamp(confirmBy(mt, cfg))}`, meetingsLink(otherId), "Email");
      }
      return withDr(state, dr);
    }

    /* ----- moving a meeting: the asker proposes a time, the other side agrees, then the team books it ----- */
    case "dr/requestChange": {
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt) return no(ctx, state, "No such meeting");
      const { match, seeker, provider } = partiesOf(dr, mt);
      const mine = notMySide(ctx, match, action.side);
      if (mine) return no(ctx, state, mine);
      const shut = closed(mt, dr.configs[mt.eventId], at);
      if (shut) return no(ctx, state, shut);
      if (mt.status === "Change requested") return no(ctx, state, "A move is already asked for; it is answered first");
      if (mt.start <= at) return no(ctx, state, "This meeting has started");
      const reason = action.reason.trim();
      if (!reason) return no(ctx, state, "Say why, for the other party");
      if (action.start === mt.start) return no(ctx, state, "Choose a different time");
      if (action.start <= at) return no(ctx, state, "That time has passed");
      if (!moveSpot(state, mt, action.start)) return no(ctx, state, "That time isn't free for both of you, or no table is open then");
      const asker = action.side === "seeker" ? seeker : provider;
      const otherId = action.side === "seeker" ? match.providerId : match.seekerId;
      dr = patchMeeting(dr, mt.id, (m) => ({ ...m, status: "Change requested", change: { by: action.side, reason, at, start: action.start, was: m.status }, history: [...m.history, { at, by: action.side, what: `The ${sideName(action.side)} asked to move it to ${fmtStamp(action.start)}: ${reason}` }] }));
      dr = send(ctx, dr, mt.eventId, otherId, `${asker.org.name} asks to move your Deal Room meeting of ${fmtStamp(mt.start)} to ${fmtStamp(action.start)}; agree or decline`, meetingsLink(otherId));
      return withDr(state, dr);
    }

    case "dr/answerChange": {
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt) return no(ctx, state, "No such meeting");
      const ch = mt.change;
      const { match, seeker, provider } = partiesOf(dr, mt);
      const mine = notMySide(ctx, match, action.side);
      if (mine) return no(ctx, state, mine);
      if (mt.status !== "Change requested" || !ch?.start) return no(ctx, state, "There's no move to answer");
      if (ch.by === action.side) return no(ctx, state, "You asked for this move; the other party answers it");
      if (ch.agreed) return no(ctx, state, "You've already agreed to this move; the Deal Room team confirms it");
      const askerId = ch.by === "seeker" ? match.seekerId : match.providerId;
      const answerer = action.side === "seeker" ? seeker : provider;
      if (!action.agree) {
        dr = patchMeeting(dr, mt.id, (m) => ({ ...m, status: ch.was ?? "Confirmed", change: undefined, history: [...m.history, { at, by: action.side, what: `The ${sideName(action.side)} declined the move${action.reason?.trim() ? `: ${action.reason.trim().replace(/[.;\s]+$/, "")}` : ""}; the meeting stays at ${fmtStamp(m.start)}` }] }));
        dr = send(ctx, dr, mt.eventId, askerId, `${answerer.org.name} declined moving your Deal Room meeting; it stays at ${fmtStamp(mt.start)}`, meetingsLink(askerId));
        return withDr(state, dr);
      }
      dr = patchMeeting(dr, mt.id, (m) => ({ ...m, change: { ...ch, agreed: at }, history: [...m.history, { at, by: action.side, what: `The ${sideName(action.side)} agreed to ${fmtStamp(ch.start!)}; with the Deal Room team to accept` }] }));
      dr = send(ctx, dr, mt.eventId, askerId, `${answerer.org.name} agreed to move your Deal Room meeting to ${fmtStamp(ch.start)}; the Deal Room team will confirm it`, meetingsLink(askerId));
      dr = send(ctx, dr, mt.eventId, opsOf(dr, mt.eventId), `Both parties agreed to move a Deal Room meeting to ${fmtStamp(ch.start)}; accept it`, "/dealroom/meetings?tab=Changes", "Email");
      return withDr(state, dr);
    }

    case "dr/acceptChange": {
      if (!drCan(me, "schedule")) return no(ctx, state, "Your role doesn't schedule meetings");
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt) return no(ctx, state, "No such meeting");
      const ch = mt.change;
      if (mt.status !== "Change requested" || !ch) return no(ctx, state, "There's no move to accept");
      if (!ch.start) return no(ctx, state, "This request names no time: move the meeting to a slot that suits, or decline the request");
      if (!ch.agreed) return no(ctx, state, "The other party hasn't agreed to this move yet");
      const spot = moveSpot(state, mt, ch.start);
      if (!spot) return no(ctx, state, `${fmtStamp(ch.start)} is no longer free: decline the move with a reason, or move the meeting yourself`);
      const { end } = slotProblems(state, { matchId: mt.matchId, start: ch.start, flagged: mt.flagged, ignore: mt.id, ...spot });
      const moved = { ...mt, ...spot, start: ch.start, end };
      // both sides agreed to this time, so their agreement stands as their confirmation
      dr = patchMeeting(dr, mt.id, (m) => ({ ...moved, status: "Confirmed", confirm: { seeker: at, provider: at }, proposedAt: at, change: undefined, reminded: undefined, history: [...m.history, { at, by: me!.id, what: `Moved to ${fmtStamp(ch.start!)}, ${where(state, moved)}, as both parties agreed` }] }));
      const { match } = partiesOf(dr, mt);
      for (const id of [match.seekerId, match.providerId]) dr = send(ctx, dr, mt.eventId, id, `Your Deal Room meeting moved to ${fmtStamp(ch.start)}, ${where(state, moved)}; add the new time to your calendar`, meetingsLink(id));
      return withDr(state, dr);
    }

    case "dr/declineChange": {
      if (!drCan(me, "schedule")) return no(ctx, state, "Your role doesn't schedule meetings");
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt) return no(ctx, state, "No such meeting");
      if (mt.status !== "Change requested" || !mt.change) return no(ctx, state, "There's no move to decline");
      const reason = action.reason.trim().replace(/[.;\s]+$/, "");
      if (!reason) return no(ctx, state, "Say why, for both parties");
      const was = mt.change.was ?? "Confirmed";
      dr = patchMeeting(dr, mt.id, (m) => ({ ...m, status: was, change: undefined, history: [...m.history, { at, by: me!.id, what: `The move was declined: ${reason}; the meeting stays at ${fmtStamp(m.start)}` }] }));
      const { match } = partiesOf(dr, mt);
      for (const id of [match.seekerId, match.providerId]) dr = send(ctx, dr, mt.eventId, id, `The Deal Room team could not move your meeting (${reason}); it stays at ${fmtStamp(mt.start)}`, meetingsLink(id));
      return withDr(state, dr);
    }

    case "dr/reschedule": {
      if (!drCan(me, "schedule")) return no(ctx, state, "Your role doesn't schedule meetings");
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt) return no(ctx, state, "No such meeting");
      const cfg = dr.configs[mt.eventId];
      const shut = mt.status === "In progress" || !mutable(mt) ? closed(mt, cfg, at) : undefined;
      if (shut) return no(ctx, state, shut);
      const req = { ...action.req, matchId: mt.matchId, ignore: mt.id, flagged: mt.flagged };
      const sameSlot = req.start === mt.start;
      if (sameSlot && (req.link ? req.link === mt.link : req.roomId === mt.roomId && req.table === mt.table)) return no(ctx, state, "The meeting is already there");
      const { clashes, caps, end } = slotProblems(state, req);
      if (clashes.length) return no(ctx, state, clashes.join("; "));
      if (caps.length && !(action.override?.trim() && drCan(me, "overrideCap"))) return no(ctx, state, `${caps.join("; ")}${drCan(me, "overrideCap") ? ": give a reason to go over the cap" : ""}`);
      // a room change in the same slot keeps both confirmations; a new time needs both to confirm again (PRD Meetings req. 6)
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
        lapsedAt: sameSlot ? m.lapsedAt : undefined,
        reminded: sameSlot ? m.reminded : undefined,
        history: [...m.history, { at, by: me!.id, what: sameSlot ? `Moved to ${where(state, { ...m, roomId: req.roomId, table: req.table, link: req.link })}, same time` : `Moved to ${fmtStamp(req.start)}; both to confirm again` }],
      }));
      const { match } = partiesOf(dr, mt);
      const moved = dr.meetings.find((m) => m.id === mt.id)!;
      for (const id of [match.seekerId, match.providerId]) dr = send(ctx, dr, mt.eventId, id, sameSlot ? `Your Deal Room meeting of ${fmtStamp(mt.start)} moved to ${where(state, moved)}` : `Your Deal Room meeting moved to ${fmtStamp(req.start)}; please confirm`, meetingsLink(id));
      return withDr(state, dr);
    }

    case "dr/cancelMeeting": {
      if (!drCan(me, "schedule")) return no(ctx, state, "Your role doesn't schedule meetings");
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt) return no(ctx, state, "No such meeting");
      if (!mutable(mt)) return no(ctx, state, closed(mt, dr.configs[mt.eventId], at) ?? "This meeting can't be cancelled");
      const reason = action.reason.trim();
      if (!reason) return no(ctx, state, "Say why it is cancelled");
      dr = patchMeeting(dr, mt.id, (m) => ({ ...m, status: "Cancelled", change: undefined, history: [...m.history, { at, by: me!.id, what: `Cancelled: ${reason}` }] }));
      const { match } = partiesOf(dr, mt);
      for (const id of [match.seekerId, match.providerId]) dr = send(ctx, dr, mt.eventId, id, `Your Deal Room meeting on ${fmtStamp(mt.start)} is cancelled`, meetingsLink(id));
      return withDr(state, dr);
    }

    /* ----- the server's jobs (M3.2): a lapsed proposal told once; reminders before a confirmed meeting ----- */
    case "dr/meetingLapse": {
      if (ctx.actor?.kind !== "system") return no(ctx, state, "Lapses are noted by the system");
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt) return no(ctx, state, "No such meeting");
      if (mt.lapsedAt) return no(ctx, state, "This lapse was already noted");
      if (!lapsed(mt, dr.configs[mt.eventId], at)) return no(ctx, state, "This proposal hasn't lapsed");
      dr = patchMeeting(dr, mt.id, (m) => ({ ...m, lapsedAt: at, history: [...m.history, { at, by: "system", what: "The proposal lapsed unconfirmed; its slot was released" }] }));
      const { match, seeker, provider } = partiesOf(dr, mt);
      for (const side of ["seeker", "provider"] as const) {
        const id = side === "seeker" ? match.seekerId : match.providerId;
        const subject = mt.confirm[side]
          ? `The Deal Room meeting proposed for ${fmtStamp(mt.start)} lapsed: the other party didn't confirm in time`
          : `The Deal Room meeting proposed for ${fmtStamp(mt.start)} lapsed before you confirmed it`;
        dr = send(ctx, dr, mt.eventId, id, `${subject}. The Deal Room team will propose another slot`, meetingsLink(id), "Email");
      }
      dr = send(ctx, dr, mt.eventId, opsOf(dr, mt.eventId), `A proposed meeting lapsed unconfirmed: ${seeker.org.name} and ${provider.org.name}`, "/dealroom/meetings", "Email");
      return withDr(state, dr);
    }

    case "dr/remindMeeting": {
      if (ctx.actor?.kind !== "system") return no(ctx, state, "Reminders are sent by the system");
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt) return no(ctx, state, "No such meeting");
      if (reminderDue(mt, at) !== action.kind) return no(ctx, state, "This reminder isn't due");
      dr = patchMeeting(dr, mt.id, (m) => ({ ...m, reminded: { ...m.reminded, [action.kind]: at } }));
      const { match, seeker, provider } = partiesOf(dr, mt);
      for (const side of ["seeker", "provider"] as const) {
        const id = side === "seeker" ? match.seekerId : match.providerId;
        const other = side === "seeker" ? provider : seeker;
        const subject =
          action.kind === "day"
            ? `Reminder: your Deal Room meeting with ${other.org.name} is at ${fmtStamp(mt.start)}, ${where(state, mt)}`
            : `Your Deal Room meeting with ${other.org.name} starts at ${mt.start.slice(11)}, ${where(state, mt)}${mt.link ? "" : "; check in with your badge at the Deal Room desk"}`;
        dr = send(ctx, dr, mt.eventId, id, subject, meetingsLink(id), action.kind === "soon" ? "Email and SMS" : "Email");
      }
      return withDr(state, dr);
    }

    /* ----- summit day (DO-7 to DO-11) ----- */
    case "dr/arrive": {
      const app = dr.apps.find((a) => a.delegateId === action.delegateId);
      if (!app) return no(ctx, state, "This badge isn't a Deal Room participant's");
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
      // a member of the team on the day; the prototype's door may start one too
      if (ctx.actor?.kind === "staff" && !drCan(me, "liveboard") && !drCan(me, "outcome")) return no(ctx, state, "Your role doesn't run the live board");
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt) return no(ctx, state, "No such meeting");
      if (mt.status === "In progress") return no(ctx, state, "This meeting is already under way");
      if (mt.status !== "Confirmed") return no(ctx, state, mt.status === "Proposed" ? "Both sides haven't confirmed this meeting" : `This meeting is ${mt.status.toLowerCase()}`);
      if (at.slice(0, 10) !== mt.start.slice(0, 10) || at < addMinutes(mt.start, -15)) return no(ctx, state, `It starts ${fmtStamp(mt.start)}: a meeting is marked under way from 15 minutes before`);
      return withDr(state, patchMeeting(dr, mt.id, (m) => ({ ...m, status: "In progress", history: [...m.history, { at, by: me?.id ?? "door", what: "In progress" }] })));
    }

    case "dr/outcome": {
      if (!drCan(me, "outcome")) return no(ctx, state, "Your role doesn't record outcomes");
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt) return no(ctx, state, "No such meeting");
      if (!["Confirmed", "In progress", "Held", "No-show"].includes(mt.status)) return no(ctx, state, mt.status === "Cancelled" ? "This meeting is cancelled" : "Only a confirmed meeting has an outcome");
      if (action.attendance === "Held" && !action.outcome) return no(ctx, state, "Choose the outcome");
      if (action.attendance === "Held" && action.outcome?.nextAction?.trim() && !action.outcome.owner) return no(ctx, state, "A next action needs its owner");
      // an outcome already on record is never silently replaced: only a paper-sheet entry with a reason, logged (Flow 7 step 6)
      const recorded = mt.status === "Held" || mt.status === "No-show";
      if (recorded && !action.paper?.trim()) return no(ctx, state, "This meeting already has an outcome: give the reason the paper sheet replaces it");
      if (!recorded && at < addMinutes(mt.start, -30)) return no(ctx, state, `It starts ${fmtStamp(mt.start)}: its outcome is recorded from half an hour before`);
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
      if (!drCan(me, "schedule")) return no(ctx, state, "Your role doesn't schedule meetings");
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt) return no(ctx, state, "No such meeting");
      if (mt.status !== "No-show") return no(ctx, state, "Only a no-show's slot is offered again");
      const cfg = dr.configs[mt.eventId];
      if (!readyToSchedule(dr, cfg).some((m) => m.id === action.matchId)) return no(ctx, state, "That pair isn't waiting for a slot");
      const times = slotTimes(cfg).map((t) => `${at.slice(0, 10)} ${t}`).filter((s) => s > at);
      for (const start of times) {
        const r = tryBook(ctx, state, { matchId: action.matchId, roomId: mt.roomId, table: mt.table, link: mt.link, start }, me!.id);
        if (!r.why) return r.state;
      }
      return no(ctx, state, "No time is free later today at this table for both of them");
    }

    /** the server's job: the day's report to the lead at 19:00 each evening of summit week, once (DL-9) */
    case "dr/dailyReport": {
      if (ctx.actor?.kind !== "system") return no(ctx, state, "The daily report is sent by the system");
      const cfg = dr.configs[action.eventId];
      const ev = state.events.find((e) => e.id === action.eventId);
      if (!cfg || !ev) return no(ctx, state, "No Deal Room for this event");
      if (action.day < ev.startDate || action.day > ev.endDate) return no(ctx, state, "That day isn't in summit week");
      if (at < `${action.day} 19:00`) return no(ctx, state, "The daily report goes at 19:00");
      if (cfg.dailyReports?.[action.day]) return no(ctx, state, "That day's report was already sent");
      dr = { ...dr, configs: { ...dr.configs, [cfg.eventId]: { ...cfg, dailyReports: { ...cfg.dailyReports, [action.day]: at } } } };
      dr = send(ctx, dr, cfg.eventId, leadOf(dr, cfg.eventId), `Daily Deal Room report, ${fmtStamp(`${action.day} 00:00`, false)}`, `/dealroom/reports?day=${action.day}`, "Email");
      return withDr(state, dr);
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
      if (inc) dr = send(ctx, dr, Object.keys(dr.configs)[0], leadOf(dr, Object.keys(dr.configs)[0]), `Incident report: offline ${fmtStamp(inc.startedAt)} to ${at.slice(11)}; ${synced} record${synced === 1 ? "" : "s"} synced, ${duplicates} duplicate${duplicates === 1 ? "" : "s"} dropped, ${conflicts} conflict${conflicts === 1 ? "" : "s"} to resolve`, "/dealroom/live", "Email");
      return withDr(state, dr);
    }

    case "dr/syncOutcome": {
      if (!drCan(me, "outcome")) return no(ctx, state, "Your role doesn't record outcomes");
      const mt = dr.meetings.find((m) => m.id === action.meetingId);
      if (!mt) return no(ctx, state, "No such meeting");
      if (!["Confirmed", "In progress", "Held", "No-show"].includes(mt.status)) return no(ctx, state, mt.status === "Cancelled" ? "This meeting is cancelled" : "Only a confirmed meeting has an outcome");
      const r = action.record;
      if (r.attendance === "Held" && !r.outcome) return no(ctx, state, "Choose the outcome");
      // as on the board: an outcome is recorded from half an hour before the start, never earlier
      if (at < addMinutes(mt.start, -30)) return no(ctx, state, `It starts ${fmtStamp(mt.start)}: its outcome is recorded from half an hour before`);
      // recorded on the phone at its own time, never later than the server's now and never long before the meeting
      const when = r.at > at ? at : r.at < addMinutes(mt.start, -30) ? addMinutes(mt.start, -30) : r.at;
      const verdict = syncVerdict(dr, mt.id, r.clientId);
      if (verdict === "duplicate") return no(ctx, state, "Already recorded");
      const device = action.device.trim().slice(0, 60) || "A phone";
      const incoming: DrOutcome = r.outcome ? { ...r.outcome, by: me!.id, at: when, clientId: r.clientId } : { category: "No fit", notes: `Recorded as a no-show on ${device}: ${r.noShow === "both" || !r.noShow ? "neither came" : r.noShow === "seeker" ? "the seeker didn't come" : "the counterparty didn't come"}`, by: me!.id, at: when, clientId: r.clientId };
      if (verdict === "conflict") {
        // the meeting already has another record: both are kept, and the lead chooses
        dr = { ...dr, conflicts: [...dr.conflicts, { id: ctx.newId("cf"), meetingId: mt.id, kept: asRecorded(mt, mt.history.at(-1)?.by ?? me!.id, mt.history.at(-1)?.at ?? at), incoming: { ...incoming, device, attendance: r.attendance, noShow: r.attendance === "No-show" ? (r.noShow ?? "both") : undefined } }] };
        dr = patchMeeting(dr, mt.id, (m) => ({ ...m, history: [...m.history, { at, by: me!.id, what: `A different record came from ${device} after an outage: with the lead to choose` }] }));
        return withDr(state, dr);
      }
      dr = patchMeeting(dr, mt.id, (m) => ({ ...m, history: [...m.history, { at, by: me!.id, what: `Recorded on ${device} at ${when.slice(11)} while offline; synced` }] }));
      return withDr(state, applyOutcome(ctx, dr, dr.meetings.find((m) => m.id === mt.id)!, r.attendance, r.attendance === "No-show" ? (r.noShow ?? "both") : undefined, r.attendance === "Held" ? incoming : undefined, me!.id));
    }

    case "dr/logIncident": {
      if (!drCan(me, "outcome") && !drCan(me, "liveboard")) return no(ctx, state, "Your role doesn't run the live board");
      if (action.startedAt > at) return no(ctx, state, "An outage can't start in the future");
      const device = action.device.trim().slice(0, 60) || "A phone";
      const eventId = Object.keys(dr.configs)[0];
      dr = { ...dr, incidents: [{ id: ctx.newId("inc"), startedAt: action.startedAt, endedAt: at, cause: `${device} lost the connection`, synced: action.synced, duplicates: action.duplicates, conflicts: action.conflicts }, ...dr.incidents] };
      dr = send(ctx, dr, eventId, leadOf(dr, eventId), `Incident report: ${device} offline ${fmtStamp(action.startedAt)} to ${at.slice(11)}; ${action.synced} record${action.synced === 1 ? "" : "s"} synced, ${action.duplicates} duplicate${action.duplicates === 1 ? "" : "s"} dropped, ${action.conflicts} conflict${action.conflicts === 1 ? "" : "s"} to resolve`, "/dealroom/live", "Email");
      return withDr(state, dr);
    }

    case "dr/resolveConflict": {
      if (me?.role !== "Lead") return no(ctx, state, "Only the lead resolves a conflict");
      const c = dr.conflicts.find((x) => x.id === action.conflictId);
      if (!c) return no(ctx, state, "No such conflict");
      if (c.resolved) return no(ctx, state, "This conflict is already resolved");
      dr = { ...dr, conflicts: dr.conflicts.map((x) => (x.id === c.id ? { ...x, resolved: { by: me.id, at, chose: action.chose } } : x)) };
      if (action.chose === "incoming") {
        const { device, attendance, noShow, ...incoming } = c.incoming;
        // a no-show from the phone makes the meeting a no-show; an outcome makes it held with that outcome
        dr = patchMeeting(dr, c.meetingId, (m) =>
          attendance === "No-show"
            ? { ...m, status: "No-show", noShow: noShow ?? "both", outcome: undefined, history: [...m.history, { at, by: me.id, what: `Conflict resolved: kept the no-show from ${device}` }] }
            : { ...m, status: "Held", noShow: undefined, outcome: incoming, history: [...m.history, { at, by: me.id, what: `Conflict resolved: kept the record from ${device}` }] },
        );
        dr = exception(ctx, dr, Object.keys(dr.configs)[0], me.id, "Paper entry over an outcome", `Outcome replaced by the record from ${device}`, c.meetingId);
      } else {
        dr = patchMeeting(dr, c.meetingId, (m) => ({ ...m, history: [...m.history, { at, by: me.id, what: `Conflict resolved: kept the record on file over the one from ${c.incoming.device}` }] }));
      }
      return withDr(state, dr);
    }

    case "dr/liveWindow":
      return withDr(state, { ...dr, liveWindow: { declaredAt: at, by: "admin", rota: action.rota }, adminLog: [{ at, by: "admin", what: `Summit live window declared: 99.95% target, on call ${action.rota.join(", ")}` }, ...dr.adminLog] });

    case "dr/roomConfig": {
      if (!drCan(me, "schedule") && me?.role !== "Lead") return state;
      const cfg = Object.values(dr.configs)[0];
      if (action.tables < 1 || action.from >= action.to) return state;
      return withDr(state, { ...dr, configs: { ...dr.configs, [cfg.eventId]: { ...cfg, rooms: { ...cfg.rooms, [action.roomId]: { ...cfg.rooms[action.roomId], tables: action.tables, from: action.from, to: action.to } }, log: [...cfg.log, { at, by: me!.id, what: `Room set: ${action.tables} table${action.tables > 1 ? "s" : ""}, ${action.from} to ${action.to}` }] } } });
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

