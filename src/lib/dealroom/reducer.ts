/**
 * The Deal Room reducer. It takes and returns the whole app state, because approving a participant
 * issues a platform badge and meetings share rooms with the programme. Every rule is enforced here;
 * a refused action returns the state unchanged and the screen explains why beforehand.
 */
import type { Ctx } from "../ctx";
import type { AppState, Delegate } from "../types";
import { addMinutes } from "../time";
import {
  DR_TIER,
  feeInKes,
  feeLabel,
  feeOwed,
  feeSettled,
  MATERIAL,
  staffOf,
  decisionOf,
  drCan,
  formGaps,
  openRfi,
  pendingSecond,
  qualified,
  readinessBlockers,
  refNo,
  verificationBlockers,
} from "./logic";
import type {
  Decision,
  DocKind,
  DrApplication,
  DrConfig,
  DrDocument,
  DrException,
  DrStaff,
  KycItem,
  Layer,
  Readiness,
} from "./types";
import { exception, note, patchApp, portal, send, withDr } from "./util";
import { drConvReducer, playForward, type DrConvAction } from "./conversion";
import { drMeetReducer, type DrMeetAction } from "./meetings";
import { drSessionReducer, type DrSessionAction } from "./sessions";

export type DrAction =
  | DrMeetAction
  | DrSessionAction
  | DrConvAction
  | { type: "dr/clock"; clock: string }
  | { type: "dr/actAs"; staffId: string }
  | { type: "dr/config"; eventId: string; patch: Partial<DrConfig>; note: string }
  | { type: "dr/saveDraft"; app: DrApplication }
  | { type: "dr/submit"; appId: string }
  | { type: "dr/import"; apps: DrApplication[] }
  | { type: "dr/invite"; appIds: string[] }
  | { type: "dr/assign"; appIds: string[]; staffId: string }
  | { type: "dr/startReview"; appId: string }
  | { type: "dr/score"; appId: string; layer: Layer; criterion: string; pass?: boolean; score?: number; docId?: string; note?: string }
  | { type: "dr/requestInfo"; appId: string; questions: string[]; docs: DocKind[] }
  | { type: "dr/respondRfi"; appId: string; text: string; docs: DrDocument[] }
  | { type: "dr/rfiExpiry"; appId: string; how: "Extended" | "Referred" | "Declined" | "Withdrawn"; note: string }
  | { type: "dr/recommend"; appId: string; decision: Decision; reason: string }
  | { type: "dr/decide"; appId: string; decision: Decision; reason: string; conditions: { text: string; due: string }[] }
  | { type: "dr/confirmSecond"; appId: string }
  | { type: "dr/meetCondition"; appId: string; conditionId: string }
  | { type: "dr/confirmDecisionMaker"; appId: string }
  | { type: "dr/readiness"; appId: string; readiness: Readiness }
  | { type: "dr/payFee"; appId: string; method: "M-Pesa" | "Card"; reference: string }
  | { type: "dr/waiveFee"; appId: string; reason: string }
  | { type: "dr/updateProfile"; appId: string; patch: Partial<Pick<DrApplication, "org" | "contact" | "decisionMaker" | "ask" | "traction" | "mandate" | "teaser" | "challenge">> }
  | { type: "dr/completeProfile"; appId: string }
  | { type: "dr/approveTeaser"; appId: string }
  | { type: "dr/reReviewDone"; appId: string; note: string }
  | { type: "dr/addDoc"; appId: string; doc: DrDocument }
  | { type: "dr/kyc"; appId: string; item: KycItem; doc: DrDocument }
  | { type: "dr/checkKyc"; appId: string; item: KycItem }
  | { type: "dr/sanctions"; appId: string; result: "Clear" | "Match found"; note: string }
  | { type: "dr/signNda"; appId: string; name: string; title: string; uploaded?: DrDocument }
  | { type: "dr/verify"; appId: string; outcome: "Verified" | "Declined"; reason: string }
  | { type: "dr/merge"; keepId: string; dropId: string }
  | { type: "dr/staffAdd"; staff: DrStaff }
  | { type: "dr/staffSet"; staffId: string; role: DrStaff["role"]; canDecide: boolean; mfa: boolean }
  | { type: "dr/staffRevoke"; staffId: string }
  | { type: "dr/grantSupport"; appId: string; to: string; reason: string; hours: number }
  | { type: "dr/supportView"; appId: string; viewer: string }
  | { type: "dr/exception"; kind: DrException["kind"]; reason: string; ref: string };

/** An approved seeker or a verified provider becomes a platform delegate with a Deal Room badge. */
function issueBadge(ctx: Ctx, state: AppState, app: DrApplication): AppState {
  if (app.delegateId) {
    // a later decision that qualifies again revives the same badge
    return { ...state, delegates: state.delegates.map((d) => (d.id === app.delegateId ? { ...d, status: d.accredited ? "Checked in" : "Confirmed", cancelled: false } : d)) };
  }
  const id = `d_dr_${app.id}`;
  const code = `EXC-DR-${(1000 + (app.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 9000).toString()}`;
  const d: Delegate = {
    id,
    eventId: app.eventId,
    name: app.contact.name,
    email: app.contact.email,
    phone: app.contact.phone,
    organisation: app.org.name,
    jobTitle: app.decisionMaker.name === app.contact.name ? app.decisionMaker.title : app.type === "seeker" ? "Capital seeker" : app.providerKind ?? "Finance provider",
    country: app.org.country,
    category: "Deal Room",
    tierId: DR_TIER,
    status: "Confirmed",
    accredited: false,
    checkIns: [],
    zoneLog: [],
    sessions: [],
    bookable: false,
    badgeCode: code,
  };
  return {
    ...state,
    delegates: [d, ...state.delegates],
    tiers: state.tiers.map((t) => (t.id === DR_TIER ? { ...t, sold: t.sold + 1 } : t)),
    dealRoom: patchApp(state.dealRoom, app.id, (a) => ({ ...a, delegateId: id })),
  };
}

function revokeBadge(ctx: Ctx, state: AppState, app: DrApplication): AppState {
  if (!app.delegateId) return state;
  return { ...state, delegates: state.delegates.map((d) => (d.id === app.delegateId ? { ...d, status: "Cancelled", cancelled: true } : d)) };
}

/** Algotech only: staff accounts, the live window and reading a file under a support grant (DA-2, DA-3, DA-5, DA-6). */
export const ADMIN_ACTIONS = new Set(["dr/staffAdd", "dr/staffSet", "dr/staffRevoke", "dr/liveWindow", "dr/supportView"]);

const STAFF_ACTIONS = new Set([
  "dr/config", "dr/import", "dr/invite", "dr/assign", "dr/startReview", "dr/score", "dr/requestInfo", "dr/rfiExpiry", "dr/recommend", "dr/decide",
  "dr/confirmSecond", "dr/meetCondition", "dr/confirmDecisionMaker", "dr/readiness", "dr/approveTeaser", "dr/reReviewDone", "dr/checkKyc", "dr/sanctions",
  "dr/verify", "dr/merge", "dr/grantSupport", "dr/exception", "dr/waiveFee",
]);

/* ---------- the reducer ---------- */

export function drReducer(state: AppState, action: DrAction, ctx: Ctx): AppState {
  let dr = state.dealRoom;
  const at = ctx.now;
  const me = staffOf(dr, ctx.actor);

  // after the conversion end date the Deal Room is read-only (DA-8); only the clock and the switcher still move
  if (dr.archivedAt && action.type !== "dr/clock" && action.type !== "dr/actAs" && action.type !== "dr/retention") return state;
  if (STAFF_ACTIONS.has(action.type) && !me?.active) return state;
  if (ADMIN_ACTIONS.has(action.type) && ctx.actor?.kind !== "admin") return state;

  const app = "appId" in action ? dr.apps.find((a) => a.id === action.appId) : undefined;
  const cfg = app ? dr.configs[app.eventId] : undefined;

  switch (action.type) {
    case "dr/clock": {
      // the clock only moves forward, so nothing recorded can predate it
      if (action.clock <= dr.clock) return state;
      let next = { ...dr, clock: action.clock };
      // the daily summit report goes to the lead at 19:00 each evening of summit week (DL-9)
      for (const c of Object.values(dr.configs)) {
        const ev = state.events.find((e) => e.id === c.eventId);
        if (!ev) continue;
        for (let d = ev.startDate; d <= ev.endDate; d = new Date(new Date(d + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10)) {
          const seven = `${d} 19:00`;
          // stamped at 19:00 that day, even when the clock jumps past several evenings at once
          if (dr.clock < seven && action.clock >= seven) next = send({ ...ctx, now: seven }, next, c.eventId, "st_lead", `Daily Deal Room report, ${new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}`, `/dealroom/reports?day=${d}`, "Email");
        }
      }
      // an approved seeker who has not paid gets one reminder, the configured days after the link went out
      for (const a of next.apps) {
        const c = next.configs[a.eventId];
        if (!c || !feeOwed(a) || a.fee!.reminderAt) continue;
        const due = addMinutes(a.fee!.sentAt, c.seekerFee.reminderDays * 1440);
        if (dr.clock < due && action.clock >= due) {
          next = patchApp(next, a.id, (x) => note({ ...x, fee: { ...x.fee!, reminderAt: due } }, "system", "Payment reminder sent", due));
          next = send({ ...ctx, now: due }, next, a.eventId, a.id, `Reminder: pay the ${feeLabel(a.fee!)} Deal Room fee to be matched and get your badge`, `/dr/${a.id}?pay=1`, "Email and SMS");
        }
      }
      // after the summit: the seeded opportunities move on, owners get weekly digests, the lead a monthly report
      next = playForward(ctx, next, state.events, dr.clock, action.clock);
      next = { ...next, outbox: [...next.outbox].sort((a, b) => b.at.localeCompare(a.at)) };
      // tracking ends on the conversion end date: the Deal Room becomes read-only and the pack goes to the lead (DA-8)
      for (const c of Object.values(dr.configs))
        if (!next.archivedAt && action.clock.slice(0, 10) > c.rules.conversionEnd) {
          next = { ...next, archivedAt: `${c.rules.conversionEnd} 23:59` };
          next = send({ ...ctx, now: next.archivedAt! }, next, c.eventId, "st_lead", "The Deal Room is archived: the post-summit pack is ready", "/dealroom/opportunities?tab=Export", "Email");
        }
      return withDr(state, next);
    }

    case "dr/actAs":
      return dr.staff.some((s) => s.id === action.staffId && s.active) ? withDr(state, { ...dr, actingStaffId: action.staffId }) : state;

    case "dr/config": {
      const c = dr.configs[action.eventId];
      if (!c || !drCan(me, "configure")) return state;
      const structural = ["rubric", "matching", "missions"].some((k) => k in action.patch);
      const afterFreeze = at.slice(0, 10) > c.freezeDate;
      dr = { ...dr, configs: { ...dr.configs, [action.eventId]: { ...c, ...action.patch, log: [...c.log, { at, by: me!.id, what: action.note }] } } };
      if (structural && afterFreeze) dr = exception(ctx, dr, action.eventId, me!.id, "Change after freeze", action.note, "Settings");
      return withDr(state, dr);
    }

    /* ----- applications ----- */

    case "dr/saveDraft": {
      const exists = dr.apps.find((a) => a.id === action.app.id);
      if (exists && !["Lead", "Invited", "Draft"].includes(exists.status)) return state;
      const next: DrApplication = { ...action.app, status: "Draft", statusAt: exists?.status === "Draft" ? exists.statusAt : at, draftSavedAt: at };
      return withDr(state, { ...dr, apps: exists ? dr.apps.map((a) => (a.id === next.id ? next : a)) : [next, ...dr.apps] });
    }

    case "dr/submit": {
      if (!app || !cfg || !["Lead", "Invited", "Draft"].includes(app.status)) return state;
      if (formGaps(app, cfg).missing.length) return state;
      if (at.slice(0, 10) > cfg.rules.appClose) return state;
      const seq = { ...dr.seq, [app.type === "seeker" ? "cs" : "fp"]: dr.seq[app.type === "seeker" ? "cs" : "fp"] + 1 };
      const ref = refNo(app.type, app.type === "seeker" ? seq.cs : seq.fp);
      dr = { ...dr, seq };
      dr = patchApp(dr, app.id, (a) =>
        note(
          {
            ...a,
            ref,
            status: "Submitted",
            statusAt: at,
            submittedAt: at,
            verification: a.type === "provider" ? { state: "Verification pending", kyc: a.verification?.kyc ?? {}, nda: a.verification?.nda } : a.verification,
          },
          "applicant",
          `Submitted, reference ${ref}`,
          at,
        ),
      );
      dr = send(ctx, dr, app.eventId, app.id, `Application received, reference ${ref}`, portal(app));
      return withDr(state, dr);
    }

    case "dr/import": {
      if (!drCan(me, "import")) return state;
      return withDr(state, { ...dr, apps: [...action.apps.map((a) => ({ ...a, history: [{ at, by: me!.id, what: "Imported from the mobilisation pipeline" }] })), ...dr.apps] });
    }

    case "dr/invite": {
      if (!drCan(me, "import")) return state;
      for (const id of action.appIds) {
        const a = dr.apps.find((x) => x.id === id);
        if (!a || (a.status !== "Lead" && a.status !== "Invited")) continue;
        dr = patchApp(dr, id, (x) => note({ ...x, status: "Invited", statusAt: at, invite: { token: x.invite?.token ?? id, sentAt: at } }, me!.id, "Invitation sent", at));
        dr = send(ctx, dr, a.eventId, id, "Your invitation to apply to the Deal Room", `/e/connected-africa-3/deal-room/apply?invite=${a.invite?.token ?? id}`);
      }
      return withDr(state, dr);
    }

    case "dr/assign": {
      if (!drCan(me, "assign")) return state;
      const to = dr.staff.find((s) => s.id === action.staffId && s.active && s.role !== "Operations");
      if (!to) return state;
      for (const id of action.appIds) dr = patchApp(dr, id, (a) => note({ ...a, assignee: to.id }, me!.id, `Assigned to ${to.name}`, at));
      return withDr(state, dr);
    }

    case "dr/startReview": {
      if (!app || !drCan(me, "review") || app.status !== "Submitted") return state;
      return withDr(state, patchApp(dr, app.id, (a) => note({ ...a, status: "In review", statusAt: at, firstReviewAt: a.firstReviewAt ?? at, assignee: a.assignee ?? me!.id }, me!.id, "Review started", at)));
    }

    case "dr/score": {
      if (!app || !drCan(me, "review")) return state;
      if (!["In review", "Information requested", "Decided", "Submitted"].includes(app.status)) return state;
      // a score rests on a document; without one it needs a written note (PRD Qualification req. 2)
      if (action.layer !== "eligibility" && !action.docId && !action.note?.trim()) return state;
      if (action.score !== undefined && (action.score < 0 || action.score > 100)) return state;
      const entry = { id: ctx.newId("as"), layer: action.layer, criterion: action.criterion, pass: action.pass, score: action.score, docId: action.docId, note: action.note, by: me!.id, at };
      return withDr(
        state,
        patchApp(dr, app.id, (a) => ({
          ...a,
          status: a.status === "Submitted" ? "In review" : a.status,
          firstReviewAt: a.firstReviewAt ?? at,
          assessments: [...a.assessments, entry],
        })),
      );
    }

    case "dr/requestInfo": {
      if (!app || !cfg || !drCan(me, "review") || app.status !== "In review" || !action.questions.filter(Boolean).length) return state;
      dr = patchApp(dr, app.id, (a) =>
        note({ ...a, status: "Information requested", statusAt: at, rfis: [...a.rfis, { id: ctx.newId("rfi"), questions: action.questions.filter(Boolean), docs: action.docs, by: me!.id, at }] }, me!.id, `Information requested: ${action.questions.filter(Boolean).length} question${action.questions.length > 1 ? "s" : ""}`, at),
      );
      const due = new Date(at.slice(0, 10) + "T12:00:00Z");
      due.setUTCDate(due.getUTCDate() + cfg.rules.rfiDays);
      dr = send(ctx, dr, app.eventId, app.id, `Information requested on your application, reply by ${due.toISOString().slice(0, 10)}`, portal(app));
      return withDr(state, dr);
    }

    case "dr/respondRfi": {
      if (!app || app.status !== "Information requested") return state;
      const rfi = openRfi(app);
      if (!rfi || !action.text.trim()) return state;
      dr = patchApp(dr, app.id, (a) =>
        note(
          {
            ...a,
            status: "In review",
            statusAt: at,
            documents: [...a.documents, ...action.docs],
            rfis: a.rfis.map((r) => (r.id === rfi.id ? { ...r, response: { text: action.text, docIds: action.docs.map((d) => d.id), at } } : r)),
          },
          "applicant",
          `Responded to the information request${action.docs.length ? ` with ${action.docs.length} document${action.docs.length > 1 ? "s" : ""}` : ""}`,
          at,
        ),
      );
      if (a_assignee(app)) dr = send(ctx, dr, app.eventId, app.assignee!, `${app.ref} responded to your request`, `/dealroom/applications/${app.id}`, "Email");
      return withDr(state, dr);
    }

    case "dr/rfiExpiry": {
      // the lead decides what happens to an unanswered request after its expiry (PRD Qualification req. 3)
      if (!app || !cfg || me?.role !== "Lead" || app.status !== "Information requested") return state;
      const rfi = openRfi(app);
      if (!rfi) return state;
      dr = patchApp(dr, app.id, (a) =>
        note(
          {
            ...a,
            status: action.how === "Extended" ? "Information requested" : action.how === "Withdrawn" ? "Decided" : a.status,
            rfis: a.rfis.map((r) => (r.id === rfi.id ? (action.how === "Extended" ? { ...r, at } : { ...r, expiry: { how: action.how, by: me.id, at, note: action.note } }) : r)),
          },
          me.id,
          `Expired request: ${action.how.toLowerCase()}. ${action.note}`,
          at,
        ),
      );
      dr = exception(ctx, dr, app.eventId, me.id, "Expired request", `${action.how}: ${action.note}`, app.ref ?? app.id);
      if (action.how === "Referred" || action.how === "Declined") {
        return drReducer(withDr(state, dr), { type: "dr/decide", appId: app.id, decision: action.how, reason: `No response to the information request. ${action.note}`, conditions: [] }, ctx);
      }
      return withDr(state, dr);
    }

    case "dr/recommend": {
      if (!app || !drCan(me, "review") || app.status !== "In review" || !action.reason.trim()) return state;
      return withDr(state, patchApp(dr, app.id, (a) => note({ ...a, recommendations: [...a.recommendations, { id: ctx.newId("rec"), decision: action.decision, reason: action.reason, by: me!.id, at }] }, me!.id, `Recommended: ${action.decision}`, at)));
    }

    case "dr/decide": {
      // only an authorised decider or the lead, always with a reason (PRD Qualification req. 4)
      if (!app || !cfg || !drCan(me, "decide") || app.type !== "seeker" || !action.reason.trim()) return state;
      if (!["In review", "Decided", "Information requested"].includes(app.status)) return state;
      if (action.decision === "Conditional" && !action.conditions.filter((c) => c.text.trim()).length) return state;
      const usd = app.ask ? (app.ask.currency === "USD" ? app.ask.amount : app.ask.amount / 130) : 0;
      const needsSecond = (action.decision === "Declined" && cfg.secondReview.decline) || usd > cfg.secondReview.askAbove;
      const entry = {
        id: ctx.newId("dec"),
        decision: action.decision,
        reason: action.reason,
        conditions: action.conditions.filter((c) => c.text.trim()).map((c, i) => ({ id: `${ctx.newId("cond")}${i}`, text: c.text, due: c.due })),
        by: me!.id,
        at,
        needsSecond: needsSecond || undefined,
      };
      dr = patchApp(dr, app.id, (a) =>
        note({ ...a, decisions: [...a.decisions, entry], status: needsSecond ? a.status : "Decided", statusAt: needsSecond ? a.statusAt : at, reReview: needsSecond ? a.reReview : undefined }, me!.id, needsSecond ? `Decided ${action.decision}, waiting for a second decider` : `Decided: ${action.decision}`, at),
      );
      if (needsSecond) return withDr(state, dr);
      return settleDecision(ctx, withDr(state, dr), app.id);
    }

    case "dr/confirmSecond": {
      if (!app || !drCan(me, "decide")) return state;
      const p = pendingSecond(app);
      if (!p || p.by === me!.id) return state; // the second decider is a different person
      dr = patchApp(dr, app.id, (a) => note({ ...a, status: "Decided", statusAt: at, reReview: undefined, decisions: a.decisions.map((d) => (d.id === p.id ? { ...d, second: { by: me!.id, at } } : d)) }, me!.id, `Second decider confirmed: ${p.decision}`, at));
      return settleDecision(ctx, withDr(state, dr), app.id);
    }

    case "dr/meetCondition": {
      if (!app || !drCan(me, "review")) return state;
      const d = decisionOf(app);
      if (!d) return state;
      return withDr(state, patchApp(dr, app.id, (a) => note({ ...a, decisions: a.decisions.map((x) => (x.id === d.id ? { ...x, conditions: x.conditions.map((c) => (c.id === action.conditionId ? { ...c, met: { by: me!.id, at } } : c)) } : x)) }, me!.id, "Condition met", at)));
    }

    case "dr/confirmDecisionMaker": {
      if (!app || !drCan(me, "review")) return state;
      return withDr(state, patchApp(dr, app.id, (a) => note({ ...a, decisionMaker: { ...a.decisionMaker, confirmed: { by: me!.id, at } } }, me!.id, `Decision-maker confirmed: ${a.decisionMaker.name}`, at)));
    }

    case "dr/readiness": {
      if (!app || !cfg || !drCan(me, "readiness") || app.type !== "seeker" || !qualified(app)) return state;
      if (action.readiness === "Deal Room Ready" && readinessBlockers(app, cfg).length) return state;
      dr = patchApp(dr, app.id, (a) => note({ ...a, readiness: action.readiness, readinessAt: at }, me!.id, `Readiness: ${action.readiness}`, at));
      if (action.readiness === "Deal Room Ready") dr = send(ctx, dr, app.eventId, app.id, "You are Deal Room Ready", portal(app));
      return withDr(state, dr);
    }

    case "dr/payFee": {
      // the seeker pays from the link: the badge is issued and, once Deal Room Ready, matching opens. Only the
      // payment provider's confirmation settles a fee, never the browser (on the server: the verified webhook)
      if (ctx.actor?.kind !== "system") return state;
      if (!app || !feeOwed(app) || !qualified(app) || !action.reference.trim()) return state;
      const kes = action.method === "M-Pesa" ? feeInKes(app.fee!) : undefined;
      dr = patchApp(dr, app.id, (a) => note({ ...a, fee: { ...a.fee!, paid: { at, method: action.method, reference: action.reference.trim().slice(0, 40), kes } } }, "applicant", `Paid ${feeLabel(app.fee!)} by ${action.method}, ref ${action.reference.trim()}`, at));
      dr = send(ctx, dr, app.eventId, app.id, `Payment received, ${feeLabel(app.fee!)}: your Deal Room badge is ready`, `/dr/${app.id}`, "Email and SMS");
      return issueBadge(ctx, withDr(state, dr), dr.apps.find((a) => a.id === app.id)!);
    }

    case "dr/waiveFee": {
      // the lead may waive it, for a sponsored place say, always with a reason
      if (!app || me?.role !== "Lead" || !feeOwed(app) || !action.reason.trim()) return state;
      dr = patchApp(dr, app.id, (a) => note({ ...a, fee: { ...a.fee!, waived: { by: me!.id, at, reason: action.reason.trim() } } }, me!.id, `Fee waived: ${action.reason.trim()}`, at));
      dr = send(ctx, dr, app.eventId, app.id, "Your Deal Room fee is waived: your badge is ready", `/dr/${app.id}`, "Email and SMS");
      const next = withDr(state, dr);
      const updated = dr.apps.find((a) => a.id === app.id)!;
      return qualified(updated) ? issueBadge(ctx, next, updated) : next;
    }

    case "dr/updateProfile": {
      if (!app) return state;
      const decided = app.status === "Decided" || qualified(app);
      // a change to the ask or the mandate after a decision goes back for review; the status stays (PRD Qualification req. 7)
      const changed: string[] = [];
      const p = action.patch;
      if (p.ask && app.ask) for (const k of ["amount", "currency", "instrument"] as const) if (p.ask[k] !== app.ask[k]) changed.push(`ask.${k}`);
      if (p.mandate && app.mandate)
        for (const k of ["ticketMin", "ticketMax", "sectors", "exclusions", "instruments"] as const) if (JSON.stringify(p.mandate[k]) !== JSON.stringify(app.mandate[k])) changed.push(`mandate.${k}`);
      const material = changed.filter((c) => MATERIAL[app.type].includes(c));
      dr = patchApp(dr, app.id, (a) => {
        let next: DrApplication = { ...a, ...p, teaser: p.teaser ? { ...p.teaser, approved: undefined } : a.teaser };
        if (p.teaser && a.teaser && p.teaser.title === a.teaser.title && p.teaser.summary === a.teaser.summary && p.teaser.anonymous === a.teaser.anonymous) next.teaser = a.teaser;
        if (decided && material.length) next = { ...next, reReview: { fields: material, at } };
        return note(next, "applicant", material.length && decided ? `Changed ${material.join(", ")}; sent for re-review` : p.challenge ? "Challenge updated" : "Profile updated", at);
      });
      if (decided && material.length && app.assignee) dr = send(ctx, dr, app.eventId, app.assignee, `${app.ref} changed its ${app.type === "seeker" ? "ask" : "mandate"}: re-review`, `/dealroom/applications/${app.id}`, "Email");
      return withDr(state, dr);
    }

    case "dr/completeProfile": {
      if (!app || !qualified(app) || !app.teaser?.title || !app.teaser.summary) return state;
      return withDr(state, patchApp(dr, app.id, (a) => note({ ...a, profileCompletedAt: a.profileCompletedAt ?? at }, "applicant", "Matching profile completed", at)));
    }

    case "dr/approveTeaser": {
      if (!app || !drCan(me, "review") || !app.teaser) return state;
      return withDr(state, patchApp(dr, app.id, (a) => note({ ...a, teaser: { ...a.teaser!, approved: { by: me!.id, at } } }, me!.id, "Teaser approved for the directory", at)));
    }

    case "dr/reReviewDone": {
      if (!app || !drCan(me, "review") || !app.reReview) return state;
      return withDr(state, patchApp(dr, app.id, (a) => note({ ...a, reReview: undefined }, me!.id, `Re-review: decision stands. ${action.note}`, at)));
    }

    case "dr/addDoc": {
      if (!app) return state;
      return withDr(state, patchApp(dr, app.id, (a) => note({ ...a, documents: [...a.documents, action.doc] }, "applicant", `Uploaded ${action.doc.kind}`, at)));
    }

    /* ----- finance provider verification (Flow 2) ----- */

    case "dr/kyc": {
      if (!app || app.type !== "provider") return state;
      return withDr(
        state,
        patchApp(dr, app.id, (a) =>
          note(
            {
              ...a,
              documents: [...a.documents, action.doc],
              verification: { ...(a.verification ?? { state: "Verification pending", kyc: {} }), kyc: { ...(a.verification?.kyc ?? {}), [action.item]: { docId: action.doc.id } } },
            },
            "applicant",
            `KYC uploaded: ${action.item}`,
            at,
          ),
        ),
      );
    }

    case "dr/checkKyc": {
      if (!app || !drCan(me, "review") || !app.verification?.kyc[action.item]) return state;
      return withDr(state, patchApp(dr, app.id, (a) => note({ ...a, verification: { ...a.verification!, kyc: { ...a.verification!.kyc, [action.item]: { ...a.verification!.kyc[action.item]!, checked: { by: me!.id, at } } } } }, me!.id, `KYC checked: ${action.item}`, at)));
    }

    case "dr/sanctions": {
      if (!app || !drCan(me, "review") || app.type !== "provider") return state;
      return withDr(state, patchApp(dr, app.id, (a) => note({ ...a, verification: { ...(a.verification ?? { state: "Verification pending", kyc: {} }), sanctions: { result: action.result, note: action.note, by: me!.id, at } } }, me!.id, `Sanctions screening: ${action.result}`, at)));
    }

    case "dr/signNda": {
      if (!app || app.type !== "provider" || !action.name.trim() || !action.title.trim()) return state;
      const docs = action.uploaded ? [...app.documents, action.uploaded] : app.documents;
      return withDr(
        state,
        patchApp(dr, app.id, (a) =>
          note({ ...a, documents: docs, verification: { ...(a.verification ?? { state: "Verification pending", kyc: {} }), nda: { version: "CA3-NDA v1.2", name: action.name, title: action.title, at, uploaded: !!action.uploaded } } }, "applicant", `NDA signed by ${action.name}, ${action.title}`, at),
        ),
      );
    }

    case "dr/verify": {
      if (!app || app.type !== "provider" || !drCan(me, "decide") || !action.reason.trim()) return state;
      if (action.outcome === "Verified" && verificationBlockers(app).length) return state;
      dr = patchApp(dr, app.id, (a) =>
        note({ ...a, status: "Decided", statusAt: at, reReview: undefined, verification: { ...a.verification!, state: action.outcome, decided: { by: me!.id, at, reason: action.reason } } }, me!.id, `Verification: ${action.outcome}`, at),
      );
      dr = send(ctx, dr, app.eventId, app.id, action.outcome === "Verified" ? "Your organisation is verified: the Deal Room directory is open" : "A decision on your Deal Room application", portal(app));
      let next = withDr(state, dr);
      const fresh = next.dealRoom.apps.find((a) => a.id === app.id)!;
      next = action.outcome === "Verified" ? issueBadge(ctx, next, fresh) : revokeBadge(ctx, next, fresh);
      return next;
    }

    case "dr/merge": {
      if (me?.role !== "Lead") return state;
      const keep = dr.apps.find((a) => a.id === action.keepId);
      const drop = dr.apps.find((a) => a.id === action.dropId);
      if (!keep || !drop || keep.id === drop.id) return state;
      dr = {
        ...dr,
        apps: dr.apps
          .filter((a) => a.id !== drop.id)
          .map((a) => (a.id === keep.id ? note({ ...a, documents: [...a.documents, ...drop.documents.filter((d) => !a.documents.some((x) => x.name === d.name))] }, me.id, `Merged duplicate ${drop.ref ?? drop.org.name}`, at) : a)),
      };
      return withDr(state, dr);
    }

    /* ----- Algotech: staff and support access ----- */

    case "dr/staffAdd":
      return withDr(state, { ...dr, staff: [...dr.staff, action.staff], adminLog: [{ at, by: "admin", what: `Account created: ${action.staff.name}, ${action.staff.role}${action.staff.canDecide ? ", may decide" : ""}` }, ...dr.adminLog] });

    case "dr/staffSet": {
      const s = dr.staff.find((x) => x.id === action.staffId);
      if (!s) return state;
      return withDr(state, {
        ...dr,
        staff: dr.staff.map((x) => (x.id === s.id ? { ...x, role: action.role, canDecide: action.canDecide, mfa: action.mfa } : x)),
        adminLog: [{ at, by: "admin", what: `${s.name}: ${action.role}${action.canDecide ? ", may decide" : ""}, MFA ${action.mfa ? "on" : "off"}` }, ...dr.adminLog],
      });
    }

    case "dr/staffRevoke": {
      const s = dr.staff.find((x) => x.id === action.staffId);
      if (!s || !s.active) return state;
      // access stops at once (DA-3); the workspace falls back to the lead if the revoked person was signed in
      const lead = dr.staff.find((x) => x.role === "Lead" && x.active && x.id !== s.id);
      return withDr(state, {
        ...dr,
        staff: dr.staff.map((x) => (x.id === s.id ? { ...x, active: false, revokedAt: at } : x)),
        actingStaffId: dr.actingStaffId === s.id ? lead?.id ?? dr.actingStaffId : dr.actingStaffId,
        adminLog: [{ at, by: "admin", what: `Access revoked: ${s.name}` }, ...dr.adminLog],
      });
    }

    case "dr/grantSupport": {
      if (!app || !drCan(me, "grantSupport") || !action.reason.trim()) return state;
      const expires = new Date(at.replace(" ", "T") + ":00Z");
      expires.setUTCHours(expires.getUTCHours() + action.hours);
      const g = { id: ctx.newId("gr"), appId: app.id, to: action.to, reason: action.reason, by: me!.id, at, expires: expires.toISOString().slice(0, 16).replace("T", " ") };
      return withDr(state, { ...dr, grants: [g, ...dr.grants], adminLog: [{ at, by: me!.id, what: `Support access to ${app.ref ?? app.org.name} granted to ${action.to} until ${g.expires}: ${action.reason}` }, ...dr.adminLog] });
    }

    case "dr/supportView": {
      const ok = dr.grants.some((g) => g.appId === action.appId && g.to === action.viewer && g.expires > at);
      if (!ok || !app) return state;
      return withDr(state, { ...dr, access: [{ id: ctx.newId("acc"), seekerId: app.id, item: "profile", viewer: "admin", action: "view", at }, ...dr.access], adminLog: [{ at, by: "admin", what: `${action.viewer} opened ${app.ref ?? app.org.name} under a support grant` }, ...dr.adminLog] });
    }

    case "dr/exception": {
      if (!me) return state;
      return withDr(state, exception(ctx, dr, Object.keys(dr.configs)[0], me.id, action.kind, action.reason, action.ref));
    }

    default:
      if (action.type.startsWith("dr/opp") || action.type === "dr/retention") return drConvReducer(state, action as DrConvAction, ctx);
      if (action.type.startsWith("dr/session")) return drSessionReducer(state, action as DrSessionAction, ctx);
      return drMeetReducer(state, action as DrMeetAction, ctx);
  }
}

const a_assignee = (a: DrApplication) => !!a.assignee;

/** After a decision takes effect: notify, issue or revoke the badge. */
function settleDecision(ctx: Ctx, state: AppState, appId: string): AppState {
  let app = state.dealRoom.apps.find((a) => a.id === appId)!;
  const d = decisionOf(app);
  if (!d) return state;
  let dr = send(ctx, state.dealRoom, app.eventId, app.id, "A decision on your Deal Room application", `/dr/${app.id}`);
  // an approved capital seeker is sent the payment link with the decision; the badge and matching wait for it
  const fee = dr.configs[app.eventId]?.seekerFee;
  if (qualified(app) && app.type === "seeker" && !app.fee && fee && fee.amount > 0) {
    dr = patchApp(dr, app.id, (a) => note({ ...a, fee: { amount: fee.amount, currency: fee.currency, sentAt: dr.clock } }, "system", `Payment link sent: ${feeLabel(fee)}`, dr.clock));
    dr = send(ctx, dr, app.eventId, app.id, `Approved: pay the ${feeLabel(fee)} participation fee to join the Deal Room`, `/dr/${app.id}?pay=1`, "Email and SMS");
    app = dr.apps.find((a) => a.id === appId)!;
  }
  let next = withDr(state, dr);
  next = qualified(app) && feeSettled(app) ? issueBadge(ctx, next, app) : revokeBadge(ctx, next, app);
  return next;
}
