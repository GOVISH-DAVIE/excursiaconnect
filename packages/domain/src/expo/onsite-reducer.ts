/**
 * The stand and its logistics (cut 2). Every rule is here, in the same functions the screens use to explain a
 * refusal: a refused action returns the state unchanged. The portal acts for its own company (`as: "exhibitor"`);
 * the team acts through the organiser's role matrix: expo.manage for people, branding, orders and move-in,
 * expo.floor for fulfilment, deliveries on the day, dismantling and issues.
 */
import { fmtStamp } from "../time";
import type { Ctx } from "../ctx";
import type { AppState, Capability } from "../types";
import { actionExhibitor, activeBookingOf, invoiceNo, memberCan, memberOf } from "./logic";
import {
  CONTRACTOR_TIER,
  EXHIBITOR_TIER,
  badgeCodeFor,
  brandingProblems,
  deliveryProblems,
  deliveryStatus,
  dismantleOpen,
  extraNeeded,
  extrasDue,
  issueProblems,
  moveInProblems,
  orderInvoice,
  orderLate,
  orderProblems,
  orderStepProblems,
  peopleProblems,
  personDelegate,
  signOffProblems,
  signedBooking,
  type NewPerson,
  type PersonKind,
} from "./onsite";
import type { Dismantle, ExpoDoc, Invoice, IssueCategory, IssuePriority, RequirementKind, StandOrder } from "./types";
import { note, send, withExpo } from "./util";

export type OnsiteAction =
  | { type: "expo/people"; exhibitorId: string; kind: PersonKind; people: NewPerson[]; idBase: string; as?: "exhibitor" }
  | { type: "expo/personRemove"; delegateId: string; as?: "exhibitor" }
  | { type: "expo/branding"; exhibitorId: string; fascia: string; logo?: ExpoDoc; artwork: ExpoDoc[]; as?: "exhibitor" }
  | { type: "expo/brandingDecide"; exhibitorId: string; decision: "Approved" | "Returned"; note: string }
  | { type: "expo/order"; id: string; exhibitorId: string; lines: StandOrder["lines"]; as?: "exhibitor" }
  | { type: "expo/orderState"; orderId: string; state: "Delivered" | "Collected" }
  | { type: "expo/requirement"; id: string; exhibitorId: string; kind: RequirementKind; text: string; as?: "exhibitor" }
  | { type: "expo/requirementAck"; id: string }
  | { type: "expo/moveIn"; exhibitorId: string; at: string }
  | { type: "expo/delivery"; id: string; exhibitorId: string; bayId: string; slot: string; vehicle: string; what: string; as?: "exhibitor" }
  | { type: "expo/deliveryState"; id: string; state: "Arrived" | "Cancelled"; as?: "exhibitor" }
  | { type: "expo/dismantleTick"; exhibitorId: string; step: "cleared" | "returned"; as?: "exhibitor" }
  | { type: "expo/signOff"; exhibitorId: string; damage: string }
  | { type: "expo/issue"; id: string; exhibitorId?: string; boothId?: string; category: IssueCategory; priority: IssuePriority; text: string; as?: "exhibitor" }
  | { type: "expo/issueAssign"; id: string; assignee: string }
  | { type: "expo/issueResolve"; id: string; note: string }
  | { type: "expo/occupancy"; exhibitorId: string; day: number; staffed: boolean | null };

export const ONSITE_TYPES = new Set<string>(["expo/people", "expo/personRemove", "expo/branding", "expo/brandingDecide", "expo/order", "expo/orderState", "expo/requirement", "expo/requirementAck", "expo/moveIn", "expo/delivery", "expo/deliveryState", "expo/dismantleTick", "expo/signOff", "expo/issue", "expo/issueAssign", "expo/issueResolve", "expo/occupancy"]);

export function onsiteReducer(state: AppState, action: OnsiteAction, ctx: Ctx): AppState {
  let expo = state.expo;
  const at = ctx.now;
  const me = memberOf(state, ctx.actor);
  // an exhibitor acts only for their own company; the team needs one of the capabilities of their role
  const asExhibitor = ctx.actor?.kind === "exhibitor" && ctx.actor.exhibitorId === actionExhibitor(state, action as OnsiteAction & Record<string, unknown>);
  const can = (cap: Capability) => memberCan(state, me, cap);
  const by = asExhibitor ? "exhibitor" : (me?.id ?? "system");
  const allowed = (...caps: Capability[]) => asExhibitor || caps.some((c) => can(c));
  const cfgOf = (exhibitorId: string) => {
    const e = expo.exhibitors.find((x) => x.id === exhibitorId);
    return e ? { e, cfg: expo.configs[e.eventId] } : undefined;
  };

  switch (action.type) {
    case "expo/people": {
      const c = cfgOf(action.exhibitorId);
      if (!c || !allowed("expo.manage")) return state;
      if (peopleProblems(state, c.cfg, c.e.id, action.people, at).length) return state;
      // staff beyond the passes the company has are invoiced as extra passes, in one invoice for the batch
      const extra = action.kind === "Staff" ? extraNeeded(state, c.cfg, c.e.id, action.people.length) : 0;
      const used = new Set(state.delegates.map((d) => d.badgeCode));
      const added = action.people.map((p, i) => {
        const id = `${action.idBase}_${i + 1}`;
        const code = badgeCodeFor(used, id, action.kind === "Staff" ? "EX" : "CT");
        used.add(code);
        return personDelegate(c.e, id, p, action.kind, code);
      });
      if (added.some((d) => state.delegates.some((x) => x.id === d.id))) return state;
      const k = activeBookingOf(expo, c.e.id, c.cfg, at)!;
      let invoice: Invoice | undefined;
      if (extra > 0) {
        const n = expo.seq.invoice + 1;
        invoice = { id: ctx.newId("inv"), eventId: c.e.eventId, exhibitorId: c.e.id, bookingId: k.id, number: invoiceNo(n), kind: "Extras", lines: [{ label: "Extra exhibitor pass", qty: extra, unit: c.cfg.extraPass }], vatPct: c.cfg.vatPct, issuedAt: at, due: extrasDue(c.cfg, at), state: "Issued" };
        expo = { ...expo, invoices: [...expo.invoices, invoice], seq: { ...expo.seq, invoice: n } };
      }
      const what = `${added.length} ${action.kind === "Staff" ? (added.length === 1 ? "staff pass" : "staff passes") : added.length === 1 ? "contractor pass" : "contractor passes"} issued: ${added.map((d) => d.name).join(", ")}${invoice ? `; ${invoice.number} for ${extra} extra ${extra === 1 ? "pass" : "passes"}` : ""}`;
      expo = { ...expo, bookings: expo.bookings.map((x) => (x.id === k.id ? { ...x, history: [...x.history, note(what, by, at)] } : x)) };
      expo = send(ctx, expo, c.e.eventId, c.e.id, `${added.length} ${added.length === 1 ? "pass" : "passes"} issued${invoice ? ", and an invoice for the extra passes" : ""}`, `/exhibitor/${c.e.id}`);
      const tier = action.kind === "Staff" ? EXHIBITOR_TIER : CONTRACTOR_TIER;
      return { ...withExpo(state, expo), delegates: [...added, ...state.delegates], tiers: state.tiers.map((t) => (t.id === tier ? { ...t, sold: t.sold + added.length } : t)) };
    }

    case "expo/personRemove": {
      const d = state.delegates.find((x) => x.id === action.delegateId);
      if (!d?.exhibitorId || d.cancelled || !allowed("expo.manage")) return state;
      // someone already through the desk keeps the pass: it was used
      if (d.accredited || d.status === "Checked in") return state;
      const k = activeBookingOf(expo, d.exhibitorId, expo.configs[d.eventId], at);
      if (k) expo = { ...expo, bookings: expo.bookings.map((x) => (x.id === k.id ? { ...x, history: [...x.history, note(`${d.name}'s pass cancelled`, by, at)] } : x)) };
      return { ...withExpo(state, expo), delegates: state.delegates.map((x) => (x.id === d.id ? { ...x, cancelled: true, status: "Cancelled" as const } : x)), tiers: state.tiers.map((t) => (t.id === d.tierId && d.status === "Confirmed" ? { ...t, sold: Math.max(0, t.sold - 1) } : t)) };
    }

    case "expo/branding": {
      const c = cfgOf(action.exhibitorId);
      if (!c || !allowed("expo.manage")) return state;
      if (brandingProblems(expo, c.cfg, c.e.id, action, at).length) return state;
      const late = at.slice(0, 10) > c.cfg.brandingDeadline;
      const prev = expo.branding.find((b) => b.exhibitorId === c.e.id);
      // an approved design is changed only by sending it again, which needs approving again
      const b = { eventId: c.e.eventId, exhibitorId: c.e.id, fascia: action.fascia.trim().toUpperCase(), logo: action.logo, artwork: action.artwork, submittedAt: at, late, history: [...(prev?.history ?? []), note(`${prev ? "Sent again" : "Sent"}${late ? " after the deadline" : ""}: fascia ${action.fascia.trim().toUpperCase()}, ${action.artwork.length} artwork ${action.artwork.length === 1 ? "file" : "files"}`, by, at)] };
      expo = { ...expo, branding: prev ? expo.branding.map((x) => (x.exhibitorId === c.e.id ? b : x)) : [...expo.branding, b] };
      return withExpo(state, expo);
    }

    case "expo/brandingDecide": {
      const b = expo.branding.find((x) => x.exhibitorId === action.exhibitorId);
      if (!b || b.decision || !can("expo.manage") || (action.decision === "Returned" && !action.note.trim())) return state;
      const decision = { state: action.decision, by, at, note: action.note.trim() || undefined };
      expo = { ...expo, branding: expo.branding.map((x) => (x.exhibitorId === b.exhibitorId ? { ...x, decision, history: [...x.history, note(`${action.decision}${action.note.trim() ? `: ${action.note.trim()}` : ""}`, by, at)] } : x)) };
      expo = send(ctx, expo, b.eventId, b.exhibitorId, action.decision === "Approved" ? "Your stand branding is approved" : "Your stand branding needs a change", `/exhibitor/${b.exhibitorId}`);
      return withExpo(state, expo);
    }

    case "expo/order": {
      const c = cfgOf(action.exhibitorId);
      if (!c || !allowed("expo.manage") || expo.orders.some((o) => o.id === action.id)) return state;
      if (orderProblems(expo, c.cfg, c.e.id, action.lines, at).length) return state;
      const k = signedBooking(expo, c.cfg, c.e.id, at)!;
      const late = orderLate(c.cfg, at);
      const n = expo.seq.invoice + 1;
      const order: StandOrder = { id: action.id, eventId: c.e.eventId, exhibitorId: c.e.id, lines: action.lines.filter((l) => l.qty > 0), at, by, late, state: "Ordered", history: [] };
      const inv = orderInvoice(c.cfg, order, k.id, invoiceNo(n), ctx.newId("inv"));
      order.invoiceId = inv.id;
      order.history = [note(`Ordered${late ? `, after the ${fmtStamp(c.cfg.orderDeadline, false)} deadline, with the ${c.cfg.lateSurchargePct}% surcharge` : ""}; ${inv.number} issued`, by, at)];
      expo = { ...expo, orders: [...expo.orders, order], invoices: [...expo.invoices, inv], seq: { ...expo.seq, invoice: n } };
      expo = send(ctx, expo, c.e.eventId, c.e.id, `Order received: ${inv.number} is ready`, `/exhibitor/${c.e.id}`);
      return withExpo(state, expo);
    }

    case "expo/orderState": {
      const o = expo.orders.find((x) => x.id === action.orderId);
      if (!o || !can("expo.floor")) return state;
      if (orderStepProblems(expo.configs[o.eventId], o, action.state, at).length) return state;
      return withExpo(state, { ...expo, orders: expo.orders.map((x) => (x.id === o.id ? { ...x, state: action.state, history: [...x.history, note(action.state, by, at)] } : x)) });
    }

    case "expo/requirement": {
      const c = cfgOf(action.exhibitorId);
      if (!c || !allowed("expo.manage") || c.e.status !== "Approved" || !action.text.trim() || action.text.length > 500 || expo.requirements.some((r) => r.id === action.id)) return state;
      if (at >= `${c.cfg.showDays[c.cfg.showDays.length - 1].date} ${c.cfg.showDays[c.cfg.showDays.length - 1].close}`) return state;
      return withExpo(state, { ...expo, requirements: [...expo.requirements, { id: action.id, eventId: c.e.eventId, exhibitorId: c.e.id, kind: action.kind, text: action.text.trim(), at, by }] });
    }

    case "expo/requirementAck": {
      const r = expo.requirements.find((x) => x.id === action.id);
      if (!r || r.ack || !can("expo.floor")) return state;
      return withExpo(state, { ...expo, requirements: expo.requirements.map((x) => (x.id === r.id ? { ...x, ack: { by, at } } : x)) });
    }

    case "expo/moveIn": {
      const c = cfgOf(action.exhibitorId);
      if (!c || !can("expo.manage") || !signedBooking(expo, c.cfg, c.e.id, at) || moveInProblems(c.cfg, action.at, at).length) return state;
      const m = { eventId: c.e.eventId, exhibitorId: c.e.id, at: action.at, by };
      expo = { ...expo, moveIns: expo.moveIns.some((x) => x.exhibitorId === c.e.id) ? expo.moveIns.map((x) => (x.exhibitorId === c.e.id ? m : x)) : [...expo.moveIns, m] };
      expo = send(ctx, expo, c.e.eventId, c.e.id, `Your move-in time is ${fmtStamp(action.at)}`, `/exhibitor/${c.e.id}`);
      return withExpo(state, expo);
    }

    case "expo/delivery": {
      const c = cfgOf(action.exhibitorId);
      if (!c || !allowed("expo.floor", "expo.manage") || expo.deliveries.some((d) => d.id === action.id)) return state;
      if (deliveryProblems(expo, c.cfg, action, at).length) return state;
      expo = { ...expo, deliveries: [...expo.deliveries, { id: action.id, eventId: c.e.eventId, exhibitorId: c.e.id, bayId: action.bayId, slot: action.slot, vehicle: action.vehicle.trim().toUpperCase(), what: action.what.trim(), at, by }] };
      expo = send(ctx, expo, c.e.eventId, c.e.id, `Delivery booked for ${fmtStamp(action.slot)}`, `/exhibitor/${c.e.id}`);
      return withExpo(state, expo);
    }

    case "expo/deliveryState": {
      const d = expo.deliveries.find((x) => x.id === action.id);
      if (!d) return state;
      const st = deliveryStatus(expo.configs[d.eventId], d, at);
      // the bay team records arrivals; a booking still ahead can be cancelled by the company or the team
      if (action.state === "Arrived" && (asExhibitor || !can("expo.floor") || (st !== "Booked" && st !== "Missed") || d.slot > at)) return state;
      if (action.state === "Cancelled" && (!allowed("expo.floor", "expo.manage") || st !== "Booked" || d.slot <= at)) return state;
      const patch = action.state === "Arrived" ? { arrived: { at, by } } : { cancelled: { at, by } };
      return withExpo(state, { ...expo, deliveries: expo.deliveries.map((x) => (x.id === d.id ? { ...x, ...patch } : x)) });
    }

    case "expo/dismantleTick": {
      const c = cfgOf(action.exhibitorId);
      if (!c || !allowed("expo.floor") || !dismantleOpen(c.cfg, at) || !signedBooking(expo, c.cfg, c.e.id, at)) return state;
      const prev = expo.dismantles.find((x) => x.exhibitorId === c.e.id);
      if (prev?.signedOff || prev?.[action.step]) return state;
      const d: Dismantle = { ...(prev ?? { eventId: c.e.eventId, exhibitorId: c.e.id }), [action.step]: { at, by } };
      return withExpo(state, { ...expo, dismantles: prev ? expo.dismantles.map((x) => (x.exhibitorId === c.e.id ? d : x)) : [...expo.dismantles, d] });
    }

    case "expo/signOff": {
      const c = cfgOf(action.exhibitorId);
      if (!c || !can("expo.floor") || signOffProblems(expo, c.cfg, c.e.id, at).length) return state;
      expo = { ...expo, dismantles: expo.dismantles.map((x) => (x.exhibitorId === c.e.id ? { ...x, signedOff: { at, by, damage: action.damage.trim() || undefined } } : x)) };
      expo = send(ctx, expo, c.e.eventId, c.e.id, action.damage.trim() ? "Your stand is signed off, with damage noted" : "Your stand is signed off", `/exhibitor/${c.e.id}`);
      return withExpo(state, expo);
    }

    case "expo/issue": {
      if (!allowed("expo.floor") || expo.issues.some((i) => i.id === action.id)) return state;
      const eventId = action.exhibitorId ? expo.exhibitors.find((e) => e.id === action.exhibitorId)?.eventId : expo.booths.find((b) => b.id === action.boothId)?.eventId;
      if (!eventId) return state;
      const cfg = expo.configs[eventId];
      if (issueProblems(expo, cfg, action, at, asExhibitor).length) return state;
      // an exhibitor reports for its own stand
      const boothId = action.boothId ?? (action.exhibitorId ? activeBookingOf(expo, action.exhibitorId, cfg, at)?.boothIds[0] : undefined);
      return withExpo(state, { ...expo, issues: [...expo.issues, { id: action.id, eventId, exhibitorId: action.exhibitorId, boothId, category: action.category, priority: action.priority, text: action.text.trim(), at, by, history: [note(`Reported: ${action.priority.toLowerCase()} priority`, by, at)] }] });
    }

    case "expo/issueAssign": {
      const i = expo.issues.find((x) => x.id === action.id);
      const m = state.team.find((x) => x.id === action.assignee && x.status === "Active");
      if (!i || i.resolved || !m || i.assignee === m.id || !can("expo.floor")) return state;
      return withExpo(state, { ...expo, issues: expo.issues.map((x) => (x.id === i.id ? { ...x, assignee: m.id, history: [...x.history, note(`Assigned to ${m.name}`, by, at)] } : x)) });
    }

    case "expo/issueResolve": {
      const i = expo.issues.find((x) => x.id === action.id);
      if (!i || i.resolved || !action.note.trim() || !can("expo.floor")) return state;
      expo = { ...expo, issues: expo.issues.map((x) => (x.id === i.id ? { ...x, resolved: { at, by, note: action.note.trim() }, history: [...x.history, note(`Resolved: ${action.note.trim()}`, by, at)] } : x)) };
      if (i.exhibitorId) expo = send(ctx, expo, i.eventId, i.exhibitorId, `Your ${i.category.toLowerCase()} issue is resolved`, `/exhibitor/${i.exhibitorId}`, "SMS");
      return withExpo(state, expo);
    }

    case "expo/occupancy": {
      // the floor walk: set a stand staffed or not for a show day, or hand it back to the check-ins (null)
      const c = cfgOf(action.exhibitorId);
      if (!c || !can("expo.floor") || action.day < 1 || action.day > c.cfg.showDays.length || !signedBooking(expo, c.cfg, c.e.id, at)) return state;
      // a day not yet started is not walked
      if (`${c.cfg.showDays[action.day - 1].date} ${c.cfg.exhibitorOpen}` > at) return state;
      const rest = expo.occupancy.filter((o) => !(o.exhibitorId === c.e.id && o.day === action.day));
      return withExpo(state, { ...expo, occupancy: action.staffed === null ? rest : [...rest, { eventId: c.e.eventId, exhibitorId: c.e.id, day: action.day, staffed: action.staffed, by, at }] });
    }
  }
  return state;
}
