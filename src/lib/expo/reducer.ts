/**
 * Every change to the exhibition goes through here, so no screen can skip a rule: a booth sold twice, a hold
 * on an unapproved exhibitor, a payment above what is owed, an overlapping booth.
 */
import { fmtStamp } from "../time";
import type { Ctx } from "../ctx";
import type { AppState, Capability } from "../types";
import {
  bookingStage,
  expoCan,
  holdExpiresAt,
  holdProblems,
  invoiceNo,
  invoiceOwed,
  invoicesOnSigning,
  passesOver,
  isActive,
  exhibitorRef,
  kes,
  placementProblems,
  hallProblems,
} from "./logic";
import type { Booth, Exhibitor, ExpoConfig, ExpoState, Hall, Payment } from "./types";
import { note, send, withExpo } from "./util";
import { ONSITE_TYPES, onsiteReducer, type OnsiteAction } from "./onsite-reducer";
import { windowProblems } from "./onsite";
import { arrivals } from "./ops";

type CoreAction =
  | { type: "expo/clock"; clock: string }
  | { type: "expo/actAs"; memberId: string }
  | { type: "expo/config"; eventId: string; patch: Partial<ExpoConfig>; note: string }
  | { type: "expo/hall"; hall: Hall }
  | { type: "expo/hallRemove"; hallId: string }
  | { type: "expo/booth"; booth: Booth }
  | { type: "expo/boothRemove"; boothId: string }
  | { type: "expo/apply"; exhibitor: Omit<Exhibitor, "ref" | "status" | "statusAt" | "history"> }
  | { type: "expo/review"; exhibitorId: string }
  | { type: "expo/decide"; exhibitorId: string; decision: "Approved" | "Waitlisted" | "Declined"; note: string }
  | { type: "expo/profile"; exhibitorId: string; patch: Partial<Pick<Exhibitor, "name" | "sector" | "country" | "website" | "description" | "logo" | "contact">>; as?: "exhibitor" }
  | { type: "expo/hold"; id: string; exhibitorId: string; boothIds: string[]; as?: "exhibitor" }
  | { type: "expo/sign"; bookingId: string; name: string; title: string; paper?: boolean; as?: "exhibitor" }
  | { type: "expo/pay"; invoiceId: string; reference: string; as: "exhibitor" }
  | { type: "expo/recordPayment"; invoiceId: string; method: Payment["method"]; reference: string; amount: number; date: string }
  | { type: "expo/match"; bankLineId: string; invoiceId: string }
  | { type: "expo/noteLine"; bankLineId: string; note: string }
  | { type: "expo/void"; invoiceId: string; reason: string }
  | { type: "expo/cancel"; bookingId: string; reason: string }
  | { type: "expo/remind"; invoiceId: string };

export type ExpoAction = CoreAction | OnsiteAction;

/** What each staff action needs from the organiser's role matrix. Portal and public actions carry `as: "exhibitor"` instead. */
const NEEDS: Partial<Record<ExpoAction["type"], Capability[]>> = {
  "expo/config": ["expo.manage"],
  "expo/hall": ["expo.manage"],
  "expo/hallRemove": ["expo.manage"],
  "expo/booth": ["expo.manage"],
  "expo/boothRemove": ["expo.manage"],
  "expo/review": ["expo.manage"],
  "expo/decide": ["expo.manage"],
  "expo/recordPayment": ["money.markPaid"],
  "expo/match": ["money.markPaid"],
  "expo/noteLine": ["money.markPaid"],
  "expo/void": ["money.refund"],
  "expo/cancel": ["money.refund", "expo.manage"],
  "expo/remind": ["money.view"],
};

export function expoReducer(state: AppState, action: ExpoAction, ctx: Ctx): AppState {
  let expo = state.expo;
  const at = ctx.now;
  const me = state.team.find((m) => m.id === expo.actingMemberId);
  const by = "as" in action && action.as === "exhibitor" ? "exhibitor" : me?.id ?? "system";

  // the stand and its logistics have their own reducer, with the same conventions
  if (ONSITE_TYPES.has(action.type)) return onsiteReducer(state, action as OnsiteAction, ctx);
  // a staff action needs one of its capabilities; the portal and the public form act for the exhibitor
  const needs = NEEDS[action.type];
  const asExhibitor = "as" in action && action.as === "exhibitor";
  if (needs && !needs.some((c) => expoCan(state, c))) return state;

  switch (action.type) {
    case "expo/clock": {
      // forward only, so nothing recorded can predate the clock
      if (action.clock <= expo.clock) return state;
      const was = expo.clock;
      // a hold that lapses as the clock passes its expiry is logged and the company told, once (BTH-4)
      const expiry = (k: (typeof expo.bookings)[number]) => holdExpiresAt(k, expo.configs[k.eventId]);
      for (const k of [...state.expo.bookings].sort((a, b) => expiry(a).localeCompare(expiry(b)))) {
        const until = expiry(k);
        if (k.contract || k.cancelled || !(was < until && action.clock >= until)) continue;
        const codes = k.boothIds.map((id) => expo.booths.find((b) => b.id === id)?.code).join(", ");
        expo = { ...expo, bookings: expo.bookings.map((x) => (x.id === k.id ? { ...x, history: [...x.history, note(`Hold lapsed unsigned; ${codes} back on sale`, "system", until)] } : x)) };
        // the message is dated when the hold lapsed, not when the clock was moved
        expo = send({ ...ctx, now: until }, expo, k.eventId, k.exhibitorId, `Your hold on ${codes} has lapsed`, `/exhibitor/${k.exhibitorId}`, "Email and SMS");
      }
      let next = withExpo(state, { ...expo, clock: action.clock });
      // passing the exhibitors' opening time on a later show day plays that morning's arrivals (OPS-1, OPS-3)
      for (const cfg of Object.values(expo.configs))
        cfg.showDays.forEach((d, i) => {
          const open = `${d.date} ${cfg.exhibitorOpen}`;
          if (i > 0 && was < open && action.clock >= open) next = arrivals(next, cfg, i + 1, action.clock);
        });
      return next;
    }

    case "expo/actAs":
      return state.team.some((m) => m.id === action.memberId && m.status === "Active") ? withExpo(state, { ...expo, actingMemberId: action.memberId }) : state;

    case "expo/config": {
      const c = expo.configs[action.eventId];
      if (!c) return state;
      // the build-up and dismantling windows stay around the show (LOG-1)
      if ((action.patch.buildUp || action.patch.dismantle) && windowProblems(c, action.patch.buildUp ?? c.buildUp, action.patch.dismantle ?? c.dismantle).length) return state;
      return withExpo(state, { ...expo, configs: { ...expo.configs, [c.eventId]: { ...c, ...action.patch, log: [...c.log, note(action.note, by, at)] } } });
    }

    case "expo/hall": {
      const h = { ...action.hall, name: action.hall.name.trim() };
      // a hall cannot shrink past its booths, and its doors and pillars stay inside it and clear of the booths (SET-1)
      if (hallProblems(expo, h).length) return state;
      const exists = expo.halls.some((x) => x.id === h.id);
      const was = expo.halls.find((x) => x.id === h.id);
      const what = !was ? `Hall added: ${h.name}, ${h.width} × ${h.depth} m` : `Hall ${h.name}: ${h.width} × ${h.depth} m, ${h.features.length} doors and pillars`;
      const cfg = expo.configs[h.eventId];
      return withExpo(state, {
        ...expo,
        halls: exists ? expo.halls.map((x) => (x.id === h.id ? h : x)) : [...expo.halls, h],
        configs: cfg ? { ...expo.configs, [h.eventId]: { ...cfg, log: [...cfg.log, note(what, by, at)] } } : expo.configs,
      });
    }

    case "expo/booth": {
      const b = { ...action.booth, code: action.booth.code.trim() };
      if (placementProblems(expo, b).length) return state;
      const exists = expo.booths.some((x) => x.id === b.id);
      return withExpo(state, { ...expo, booths: exists ? expo.booths.map((x) => (x.id === b.id ? b : x)) : [...expo.booths, b] });
    }

    case "expo/hallRemove": {
      const h = expo.halls.find((x) => x.id === action.hallId);
      // a hall goes only once it is empty, and an event keeps at least one
      if (!h || expo.booths.some((b) => b.hallId === h.id) || expo.halls.filter((x) => x.eventId === h.eventId).length < 2) return state;
      const cfg = expo.configs[h.eventId];
      return withExpo(state, {
        ...expo,
        halls: expo.halls.filter((x) => x.id !== h.id),
        configs: cfg ? { ...expo.configs, [h.eventId]: { ...cfg, log: [...cfg.log, note(`Hall removed: ${h.name}`, by, at)] } } : expo.configs,
      });
    }

    case "expo/boothRemove": {
      const b = expo.booths.find((x) => x.id === action.boothId);
      if (!b) return state;
      const cfg = expo.configs[b.eventId];
      // a booth that is held or sold stays until its booking is cancelled
      if (expo.bookings.some((k) => k.boothIds.includes(b.id) && isActive(bookingStage(expo, k, cfg, at)))) return state;
      return withExpo(state, { ...expo, booths: expo.booths.filter((x) => x.id !== b.id) });
    }

    case "expo/apply": {
      const x = action.exhibitor;
      if (!x.name.trim() || !x.contact.email.trim() || expo.exhibitors.some((e) => e.id === x.id)) return state;
      const n = expo.seq.exhibitor + 1;
      const ex: Exhibitor = { ...x, ref: exhibitorRef(n), status: "Applied", statusAt: at, history: [note("Applied", "public", at)] };
      expo = { ...expo, exhibitors: [...expo.exhibitors, ex], seq: { ...expo.seq, exhibitor: n } };
      expo = send(ctx, expo, ex.eventId, ex.id, `Application received, reference ${ex.ref}`, `/exhibitor/${ex.id}`, "Email and SMS");
      return withExpo(state, expo);
    }

    case "expo/review":
      return withExpo(state, patchEx(expo, action.exhibitorId, (e) => (e.status === "Applied" ? { ...e, status: "Under review", statusAt: at, history: [...e.history, note("Review started", by, at)] } : e)));

    case "expo/decide": {
      const e = expo.exhibitors.find((x) => x.id === action.exhibitorId);
      if (!e || e.status === action.decision || (action.decision !== "Approved" && !action.note.trim())) return state;
      expo = patchEx(expo, e.id, (x) => ({ ...x, status: action.decision, statusAt: at, decisionNote: action.note.trim() || undefined, history: [...x.history, note(`${action.decision}${action.note.trim() ? `: ${action.note.trim()}` : ""}`, by, at)] }));
      expo = send(ctx, expo, e.eventId, e.id, action.decision === "Approved" ? "Approved to exhibit: choose your booth" : action.decision === "Waitlisted" ? "Your application is on the waitlist" : "A decision on your application", `/exhibitor/${e.id}`, "Email and SMS");
      // approving a company approves the people waiting under it (EXH-6)
      const delegates = action.decision === "Approved" ? state.delegates.map((d) => (d.exhibitorId === e.id && d.status === "Pending" ? { ...d, status: "Confirmed" as const } : d)) : state.delegates;
      return { ...withExpo(state, expo), delegates };
    }

    case "expo/profile": {
      const e = expo.exhibitors.find((x) => x.id === action.exhibitorId);
      if (!e || (!asExhibitor && !expoCan(state, "expo.manage"))) return state;
      const p = action.patch;
      if (p.name !== undefined && !p.name.trim()) return state;
      return withExpo(state, patchEx(expo, e.id, (x) => ({ ...x, ...p, contact: { ...x.contact, ...p.contact }, history: [...x.history, note("Profile updated", by, at)] })));
    }

    case "expo/hold": {
      const e = expo.exhibitors.find((x) => x.id === action.exhibitorId);
      if (!e) return state;
      // the portal holds for its own company; anyone else allocating needs to manage the exhibition
      if (!asExhibitor && !expoCan(state, "expo.manage")) return state;
      const cfg = expo.configs[e.eventId];
      if (holdProblems(expo, cfg, e, action.boothIds, at).length || expo.bookings.some((k) => k.id === action.id)) return state;
      const codes = action.boothIds.map((id) => expo.booths.find((b) => b.id === id)!.code).join(", ");
      expo = { ...expo, bookings: [...expo.bookings, { id: action.id, eventId: e.eventId, exhibitorId: e.id, boothIds: action.boothIds, heldAt: at, heldBy: by, history: [note(`${asExhibitor ? "Chose" : "Allocated"} ${codes}, held for ${cfg.holdHours} hours`, by, at)] }] };
      expo = send(ctx, expo, e.eventId, e.id, `Booth ${codes} is held for you: sign the contract within ${cfg.holdHours} hours`, `/exhibitor/${e.id}`, "Email and SMS");
      return withExpo(state, expo);
    }

    case "expo/sign": {
      const k = expo.bookings.find((x) => x.id === action.bookingId);
      if (!k || !action.name.trim() || !action.title.trim()) return state;
      const cfg = expo.configs[k.eventId];
      if (bookingStage(expo, k, cfg, at) !== "Held") return state;
      // a paper copy is recorded by the team; otherwise the exhibitor signs in the portal
      if (!asExhibitor && !(expoCan(state, "money.markPaid") || expoCan(state, "expo.manage"))) return state;
      const e = expo.exhibitors.find((x) => x.id === k.exhibitorId)!;
      let n = expo.seq.invoice;
      let i = expo.invoices.length;
      const invoices = invoicesOnSigning(cfg, e, k, expo.booths.filter((b) => k.boothIds.includes(b.id)), at, () => invoiceNo(++n), () => `inv_${++i}`, passesOver(state, cfg, e.id, k.boothIds));
      expo = {
        ...expo,
        seq: { ...expo.seq, invoice: n },
        invoices: [...expo.invoices, ...invoices],
        bookings: expo.bookings.map((x) => (x.id === k.id ? { ...x, contract: { version: cfg.contractVersion, name: action.name.trim(), title: action.title.trim(), at, paper: action.paper }, history: [...x.history, note(`Contract ${cfg.contractVersion} signed by ${action.name.trim()}, ${action.title.trim()}${action.paper ? " (paper copy recorded)" : ""}`, by, at), ...invoices.map((v) => note(`${v.number} issued: ${v.kind.toLowerCase()}, due ${fmtStamp(v.due, false)}`, "system", at))] } : x)),
      };
      expo = send(ctx, expo, k.eventId, e.id, invoices.length ? `Contract signed: ${invoices.length === 1 ? "your invoice is" : "your invoices are"} ready` : "Contract signed: your stand is confirmed", `/exhibitor/${e.id}`);
      return withExpo(state, expo);
    }

    case "expo/pay":
    case "expo/recordPayment": {
      const inv = expo.invoices.find((x) => x.id === action.invoiceId);
      if (!inv) return state;
      const owed = invoiceOwed(expo, inv);
      const amount = action.type === "expo/pay" ? owed : action.amount;
      // a payment settles what is owed and no more: an overpayment stays on the bank line for Finance to resolve
      if (owed <= 0 || amount <= 0 || amount > owed || !action.reference.trim()) return state;
      const pay: Payment = { id: ctx.newId("pay"), eventId: inv.eventId, invoiceId: inv.id, method: action.type === "expo/pay" ? "M-Pesa" : action.method, reference: action.reference.trim(), amount, at: action.type === "expo/recordPayment" && action.date ? `${action.date} ${at.slice(11)}` : at, by };
      expo = { ...expo, payments: [...expo.payments, pay] };
      expo = logBooking(expo, inv.bookingId, `${kes(amount)} received for ${inv.number} by ${pay.method}, ${pay.reference}`, by, at);
      expo = send(ctx, expo, inv.eventId, inv.exhibitorId, `Payment received for ${inv.number}`, `/exhibitor/${inv.exhibitorId}`);
      return withExpo(state, expo);
    }

    case "expo/match": {
      const line = expo.bankLines.find((x) => x.id === action.bankLineId);
      const inv = expo.invoices.find((x) => x.id === action.invoiceId);
      if (!line || !inv || line.matched) return state;
      const owed = invoiceOwed(expo, inv);
      if (line.amount <= 0 || line.amount > owed) return state;
      const pay: Payment = { id: ctx.newId("pay"), eventId: inv.eventId, invoiceId: inv.id, method: "Bank", reference: line.reference, amount: line.amount, at: `${line.date} ${at.slice(11)}`, by, bankLineId: line.id };
      expo = { ...expo, payments: [...expo.payments, pay], bankLines: expo.bankLines.map((x) => (x.id === line.id ? { ...x, matched: { invoiceId: inv.id, paymentId: pay.id, by, at } } : x)) };
      expo = logBooking(expo, inv.bookingId, `${kes(line.amount)} matched from the bank statement to ${inv.number}`, by, at);
      return withExpo(state, expo);
    }

    case "expo/noteLine": {
      if (!action.note.trim()) return state;
      return withExpo(state, { ...expo, bankLines: expo.bankLines.map((x) => (x.id === action.bankLineId && !x.matched ? { ...x, note: action.note.trim() } : x)) });
    }

    case "expo/void": {
      const inv = expo.invoices.find((x) => x.id === action.invoiceId);
      // an invoice with money on it is never voided: the payment would vanish from the books
      if (!inv || inv.state === "Void" || expo.payments.some((p) => p.invoiceId === inv.id) || !action.reason.trim()) return state;
      expo = { ...expo, invoices: expo.invoices.map((x) => (x.id === inv.id ? { ...x, state: "Void" as const, voidReason: action.reason.trim() } : x)) };
      return withExpo(state, logBooking(expo, inv.bookingId, `${inv.number} voided: ${action.reason.trim()}`, by, at));
    }

    case "expo/cancel": {
      const k = expo.bookings.find((x) => x.id === action.bookingId);
      if (!k || k.cancelled || !action.reason.trim()) return state;
      const cfg = expo.configs[k.eventId];
      if (!isActive(bookingStage(expo, k, cfg, at))) return state;
      // the booths go back on sale; what is unpaid is voided; what was paid stays, as the terms say
      const voidable = expo.invoices.filter((i) => i.bookingId === k.id && i.state === "Issued" && !expo.payments.some((p) => p.invoiceId === i.id));
      expo = {
        ...expo,
        invoices: expo.invoices.map((i) => (voidable.some((v) => v.id === i.id) ? { ...i, state: "Void" as const, voidReason: "Booking cancelled" } : i)),
        bookings: expo.bookings.map((x) => (x.id === k.id ? { ...x, cancelled: { at, by, reason: action.reason.trim() }, history: [...x.history, note(`Cancelled: ${action.reason.trim()}`, by, at)] } : x)),
      };
      expo = send(ctx, expo, k.eventId, k.exhibitorId, "Your booking is cancelled", `/exhibitor/${k.exhibitorId}`);
      return withExpo(state, expo);
    }

    case "expo/remind": {
      const inv = expo.invoices.find((x) => x.id === action.invoiceId);
      if (!inv || invoiceOwed(expo, inv) <= 0) return state;
      expo = logBooking(expo, inv.bookingId, `Reminder sent for ${inv.number}`, by, at);
      return withExpo(state, send(ctx, expo, inv.eventId, inv.exhibitorId, `Reminder: ${inv.number} ${inv.due < at.slice(0, 10) ? "was" : "is"} due ${fmtStamp(inv.due, false)}`, `/exhibitor/${inv.exhibitorId}`, "Email and SMS"));
    }
  }
  return state;
}

function patchEx(expo: ExpoState, id: string, fn: (e: Exhibitor) => Exhibitor): ExpoState {
  return { ...expo, exhibitors: expo.exhibitors.map((e) => (e.id === id ? fn(e) : e)) };
}
function logBooking(expo: ExpoState, bookingId: string | undefined, what: string, by: string, at: string): ExpoState {
  if (!bookingId) return expo;
  return { ...expo, bookings: expo.bookings.map((k) => (k.id === bookingId ? { ...k, history: [...k.history, note(what, by, at)] } : k)) };
}

