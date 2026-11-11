/**
 * Cut 3: what happens to an opportunity after the summit (PRD Conversion tracking). The rules live in
 * `applyStep`, which both staff actions and the seeded timeline go through, so neither can skip one.
 */
import type { Ctx } from "../ctx";
import type { AppState } from "../types";
import { CLOSE_REASONS, OPEN_STAGES, staffOf, drCan, oppOpen, oppOverdue, oppParties, staffName } from "./logic";
import type { CloseReason, DealRoomState, DrDocument, DrOpportunity, DrOppOutcome, DrScriptStep, OppStage, OutcomeKind } from "./types";
import { leadOf, portal, send, withDr } from "./util";

/** The tiers that rest on a signed document: a signed commitment, financing approved but not disbursed, and deployed. */
export const SIGNED: OutcomeKind[] = ["Signed commitment", "Approved, not disbursed", "Deployed"];
const TIER_WORDS: Record<OutcomeKind, string> = {
  "Expression of interest": "an expression of interest",
  "Indicative commitment": "an indicative commitment",
  "Signed commitment": "a signed commitment",
  "Approved, not disbursed": "financing approved, not disbursed",
  Deployed: "capital deployed or a contract implemented",
};

export type DrConvAction =
  | { type: "dr/oppStage"; oppId: string; stage: OppStage; evidence: string }
  | { type: "dr/oppOutcome"; oppId: string; outcome: Omit<DrOppOutcome, "id" | "by" | "at"> }
  | { type: "dr/oppNext"; oppId: string; nextAction: string; due: string }
  | { type: "dr/oppNote"; oppId: string; text: string; doc?: DrDocument }
  | { type: "dr/oppClose"; oppId: string; reason: CloseReason; note: string }
  | { type: "dr/oppReassign"; oppId: string; owner: string; reason: string }
  | { type: "dr/oppReview"; oppIds: string[]; note: string }
  | { type: "dr/oppRequest"; oppId: string; to: ("seeker" | "provider")[] }
  | { type: "dr/oppReply"; oppId: string; side: "seeker" | "provider"; text: string; doc?: DrDocument }
  | { type: "dr/retention"; eventId: string; months: number; reason: string };

const MONTH = (ym: string) => new Date(ym + "-15T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

function patchOpp(dr: DealRoomState, id: string, fn: (o: DrOpportunity) => DrOpportunity): DealRoomState {
  return { ...dr, opportunities: dr.opportunities.map((o) => (o.id === id ? fn(o) : o)) };
}

/** A message stamped at the moment it was due, not the moment the clock was moved past it. */
function sendAt(ctx: Ctx, dr: DealRoomState, at: string, eventId: string, to: string, subject: string, link: string) {
  return send({ ...ctx, now: at }, dr, eventId, to, subject, link, "Email");
}

/** One change to an opportunity, or null when a rule refuses it. */
export function applyStep(ctx: Ctx, dr: DealRoomState, o: DrOpportunity, step: DrScriptStep, by: string, at: string): DealRoomState | null {
  const day = at.slice(0, 10);
  const log = (x: DrOpportunity, what: string) => ({ ...x, history: [...x.history, { at, by, what }] });
  switch (step.kind) {
    case "stage": {
      if (!oppOpen(o) || step.stage === o.stage || ![...OPEN_STAGES, "Closed – won"].includes(step.stage)) return null;
      if ((step.stage === "Diligence" || step.stage === "Negotiation") && !step.evidence.trim()) return null;
      // won means a signed commitment is on the record; a promise is not enough
      if (step.stage === "Closed – won" && !o.outcomes.some((x) => SIGNED.includes(x.kind))) return null;
      const evidence = step.stage === "Closed – won" ? step.evidence.trim() || "Signed commitment on the record" : step.evidence.trim();
      return patchOpp(dr, o.id, (x) => log({ ...x, stage: step.stage, stageDates: { ...x.stageDates, [step.stage]: at }, stageEvidence: { ...x.stageEvidence, [step.stage]: evidence } }, `Moved to ${step.stage}${evidence ? `: ${evidence}` : ""}`));
    }
    case "outcome": {
      const x = step.outcome;
      if (o.closed || !x.date || x.date > day || !x.evidence.trim()) return null;
      // a signed commitment and what follows it carry an amount; a signed one names its pathway
      if (SIGNED.includes(x.kind) && (!x.amount || x.amount <= 0 || !x.currency)) return null;
      if (x.kind === "Signed commitment" && !x.instrument) return null;
      const what = TIER_WORDS[x.kind];
      return patchOpp(dr, o.id, (y) => log({ ...y, outcomes: [...y.outcomes, { ...x, evidence: x.evidence.trim(), id: ctx.newId("oo"), by, at }] }, `Recorded ${what}, dated ${x.date}`));
    }
    case "update": {
      if (!step.text.trim()) return null;
      let answered = false;
      return patchOpp(dr, o.id, (y) => ({
        ...y,
        updates: [...y.updates, { id: ctx.newId("up"), from: step.from, text: step.text.trim(), at, by, doc: step.doc }],
        // a participant's reply answers the oldest request still open for their side
        requests: y.requests.map((r) => (!answered && step.from !== "owner" && r.to === step.from && !r.answeredAt ? ((answered = true), { ...r, answeredAt: at }) : r)),
      }));
    }
    case "next": {
      if (!oppOpen(o) || !step.nextAction.trim() || !step.due || step.due < day) return null;
      return patchOpp(dr, o.id, (y) => log({ ...y, nextAction: step.nextAction.trim(), due: step.due }, `Next action: ${step.nextAction.trim()}, due ${step.due}`));
    }
    case "close": {
      if (!oppOpen(o) || !CLOSE_REASONS.includes(step.reason) || !step.note.trim()) return null;
      return patchOpp(dr, o.id, (y) => log({ ...y, stage: "Closed – lost", stageDates: { ...y.stageDates, "Closed – lost": at }, closed: { reason: step.reason, note: step.note.trim(), by, at } }, `Closed, lost: ${step.reason}`));
    }
    case "review": {
      const month = at.slice(0, 7);
      if (!oppOpen(o) || o.reviews.some((r) => r.month === month)) return null;
      return patchOpp(dr, o.id, (y) => log({ ...y, reviews: [...y.reviews, { month, by, at, note: step.note.trim() }] }, `Reviewed for ${MONTH(month)}`));
    }
    case "request": {
      if (!oppOpen(o)) return null;
      const app = oppParties(dr, o)[step.to];
      if (!app) return null;
      const next = patchOpp(dr, o.id, (y) => log({ ...y, requests: [...y.requests, { id: ctx.newId("rq"), to: step.to, at, by }] }, `Status update requested from the ${step.to}`));
      return sendAt(ctx, next, at, o.eventId, app.id, `The Deal Room team asks for an update, ${new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`, portal(app));
    }
  }
}

export function drConvReducer(state: AppState, action: DrConvAction, ctx: Ctx): AppState {
  const dr = state.dealRoom;
  const at = ctx.now;
  const me = staffOf(dr, ctx.actor);

  if (action.type === "dr/retention") {
    const c = dr.configs[action.eventId];
    if (!c || !drCan(me, "conversion") || action.months < 1 || !action.reason.trim()) return state;
    const what = `Document retention extended by ${action.months} months: ${action.reason.trim()}`;
    return withDr(state, { ...dr, configs: { ...dr.configs, [c.eventId]: { ...c, rules: { ...c.rules, retentionMonths: c.rules.retentionMonths + action.months }, log: [...c.log, { at, by: me!.id, what }] } }, adminLog: [{ at, by: me!.id, what }, ...dr.adminLog] });
  }

  if (action.type === "dr/oppReview") {
    if (!drCan(me, "conversion")) return state;
    let next = dr;
    for (const id of action.oppIds) {
      const o = next.opportunities.find((x) => x.id === id);
      const r = o && applyStep(ctx, next, o, { kind: "review", note: action.note }, me!.id, at);
      if (r) next = r;
    }
    return withDr(state, next);
  }

  const o = dr.opportunities.find((x) => x.id === action.oppId);
  if (!o) return state;

  // participants answer a status request from their portal; the owner keeps the stage (PRD Conversion req. 6)
  if (action.type === "dr/oppReply") {
    const app = oppParties(dr, o)[action.side];
    if (!app) return state;
    let next = applyStep(ctx, dr, o, { kind: "update", from: action.side, text: action.text, doc: action.doc }, app.id, at);
    if (!next) return state;
    next = send(ctx, next, o.eventId, o.owner, `A participant sent an update on an opportunity you own`, `/dealroom/opportunities/${o.id}`, "Email");
    return withDr(state, next);
  }

  // the owner works the record; the lead can work any of them
  const works = !!me?.active && (me.role === "Lead" || me.id === o.owner);
  if (!works) return state;

  let next: DealRoomState | null = null;
  switch (action.type) {
    case "dr/oppStage":
      next = applyStep(ctx, dr, o, { kind: "stage", stage: action.stage, evidence: action.evidence }, me!.id, at);
      break;
    case "dr/oppOutcome":
      next = applyStep(ctx, dr, o, { kind: "outcome", outcome: action.outcome }, me!.id, at);
      break;
    case "dr/oppNext":
      next = applyStep(ctx, dr, o, { kind: "next", nextAction: action.nextAction, due: action.due }, me!.id, at);
      break;
    case "dr/oppNote":
      next = applyStep(ctx, dr, o, { kind: "update", from: "owner", text: action.text, doc: action.doc }, me!.id, at);
      break;
    case "dr/oppClose":
      next = applyStep(ctx, dr, o, { kind: "close", reason: action.reason, note: action.note }, me!.id, at);
      break;
    case "dr/oppRequest":
      next = dr;
      for (const to of action.to) next = applyStep(ctx, next, next.opportunities.find((x) => x.id === o.id)!, { kind: "request", to }, me!.id, at) ?? next;
      if (next === dr) next = null;
      break;
    case "dr/oppReassign": {
      const to = dr.staff.find((s) => s.id === action.owner && s.active && s.role !== "Operations");
      if (!drCan(me, "conversion") || !to || to.id === o.owner || !oppOpen(o) || !action.reason.trim()) return state;
      next = patchOpp(dr, o.id, (y) => ({ ...y, owner: to.id, history: [...y.history, { at, by: me!.id, what: `Reassigned from ${staffName(dr, o.owner)} to ${to.name}: ${action.reason.trim()}` }] }));
      next = send(ctx, next, o.eventId, to.id, "A Deal Room opportunity is reassigned to you", `/dealroom/opportunities/${o.id}`, "Email");
      break;
    }
  }
  return next ? withDr(state, next) : state;
}

/**
 * Moving the clock from `from` to `to`: the seeded timeline plays its steps in order, each owner gets the
 * weekly digest for the last Monday passed, and the lead gets a conversion report for each month that ended.
 */
export function playForward(ctx: Ctx, dr: DealRoomState, events: AppState["events"], from: string, to: string): DealRoomState {
  const script = dr.script ?? [];
  const now = script.filter((s) => s.at > from && s.at <= to).sort((a, b) => a.at.localeCompare(b.at));
  let next: DealRoomState = { ...dr, script: script.filter((s) => !(s.at > from && s.at <= to)) };
  for (const s of now) {
    const o = next.opportunities.find((x) => x.id === s.oppId);
    const r = o && applyStep(ctx, next, o, s.step, s.by, s.at);
    if (r) next = r;
  }
  let sent = false;
  for (const c of Object.values(next.configs)) {
    const ev = events.find((e) => e.id === c.eventId);
    if (!ev) continue;
    const start = ev.endDate > from.slice(0, 10) ? ev.endDate : from.slice(0, 10);
    const end = c.rules.conversionEnd < to.slice(0, 10) ? c.rules.conversionEnd : to.slice(0, 10);
    // weekly: Monday 08:00; only the latest digest is worth sending once the clock has moved past several
    let monday: string | undefined;
    for (let d = new Date(start + "T12:00:00Z"); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const stamp = `${iso} 08:00`;
      if (d.getUTCDay() === 1 && stamp > from && stamp <= to) monday = iso;
      // monthly: the first of each month after the summit, for the month that just ended (PRD Reporting req. 4)
      if (iso.endsWith("-01") && stamp > from && stamp <= to && iso > ev.endDate) {
        const prev = new Date(iso + "T12:00:00Z");
        prev.setUTCMonth(prev.getUTCMonth() - 1);
        next = sendAt(ctx, next, stamp, c.eventId, leadOf(next, c.eventId), `Monthly conversion report, ${MONTH(prev.toISOString().slice(0, 7))}`, "/dealroom/reports?tab=Conversion");
        sent = true;
      }
    }
    if (monday) {
      const owners = [...new Set(next.opportunities.filter((o) => o.eventId === c.eventId && oppOpen(o)).map((o) => o.owner))];
      for (const owner of owners) {
        const mine = next.opportunities.filter((o) => o.owner === owner && oppOpen(o));
        const late = mine.filter((o) => oppOverdue(o, `${monday} 08:00`)).length;
        next = sendAt(ctx, next, `${monday} 08:00`, c.eventId, owner, `Weekly digest, ${Number(monday.slice(8))} ${MONTH(monday.slice(0, 7)).split(" ")[0]}: ${mine.length} open opportunities, ${late} overdue`, "/dealroom/opportunities");
        sent = true;
      }
    }
  }
  return sent ? { ...next, outbox: [...next.outbox].sort((a, b) => b.at.localeCompare(a.at)) } : next;
}
