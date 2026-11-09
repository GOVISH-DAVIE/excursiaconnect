/**
 * The Exhibition module's rules as pure functions. The reducer enforces them; screens call the same functions
 * to explain a refusal before it happens. "Now" is always the exhibition clock, never the wall clock.
 */
import { can } from "../roles";
import { addMinutes, daysBetween } from "../time";
import type { AppState, Capability, Delegate } from "../types";
import type { BankLine, Booking, Booth, BoothStatus, BoothType, Exhibitor, ExpoConfig, ExpoState, Hall, HallFeature, Invoice } from "./types";

export const EV_NBS = "ev_nairobi_summit";
export const EXPO_TIERS = ["t_exhibitor", "t_contractor"];

/* ---------- who is acting ---------- */

export const actingMember = (state: AppState) => state.team.find((m) => m.id === state.expo.actingMemberId);
/** The organiser's own role matrix decides (src/lib/roles.ts); an invited member cannot act yet. */
export function expoCan(state: AppState, cap: Capability) {
  const m = actingMember(state);
  return !!m && m.status === "Active" && can(state.grants, m.role, cap);
}
export const memberName = (state: AppState, id: string) => (id === "exhibitor" ? "The exhibitor" : id === "public" ? "Applicant" : id === "system" ? "System" : state.team.find((m) => m.id === id)?.name ?? id);

/* ---------- money ---------- */

export const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en")}`;
export const area = (b: Booth) => b.w * b.d;

/* ---------- what a stand includes, and the sizes an applicant asks for (SET-3, EXH-2) ---------- */

/** What each booth type comes with, as set in Settings. The pass allowance is added from the terms, so it never disagrees. */
export const DEFAULT_INCLUDES: Record<BoothType, string[]> = {
  "Shell scheme": ["Walls on the closed sides, carpet and a fascia board with your name", "A table, two chairs and a 13 A socket", "Lighting and daily cleaning"],
  "Space only": ["The floor space marked out, for your own stand build", "Power, water and internet ordered separately"],
};
export const includesOf = (cfg: ExpoConfig, t: BoothType) => cfg.includes?.[t] ?? DEFAULT_INCLUDES[t];
export const passLine = (cfg: ExpoConfig) => `${cfg.passPer9} exhibitor pass${cfg.passPer9 === 1 ? "" : "es"} per 9 m²`;

export const SIZES = ["3 × 3 m", "3 × 6 m", "6 × 6 m", "Larger"] as const;
/** Whether a booth is the size an applicant asked for: by floor area, so 6 × 3 m answers 3 × 6 m. */
export function sizeFits(size: string, b: Booth) {
  const a = area(b);
  if (size === "Larger") return a > 36;
  const m = size.match(/(\d+) × (\d+)/);
  return !m || a === Number(m[1]) * Number(m[2]);
}

/* ---------- the hall's walls, doors and pillars (SET-1) ---------- */

export const DOOR_DEPTH = 0.6;
export type Wall = "North" | "East" | "South" | "West";
export const WALLS: Wall[] = ["North", "East", "South", "West"];
/** The wall a door sits on; pillars stand on the floor. */
export function wallOf(h: Hall, f: HallFeature): Wall | undefined {
  if (f.kind === "Pillar") return undefined;
  if (f.y + f.d >= h.depth && f.d <= DOOR_DEPTH) return "South";
  if (f.y <= 0 && f.d <= DOOR_DEPTH) return "North";
  if (f.x <= 0 && f.w <= DOOR_DEPTH) return "West";
  return "East";
}
/** Where a door starts along its wall, and how wide it is, in metres. */
export const doorAlong = (h: Hall, f: HallFeature) => (wallOf(h, f) === "North" || wallOf(h, f) === "South" ? { at: f.x, len: f.w } : { at: f.y, len: f.d });
/** A door on a wall, as a rectangle on the plan. */
export function doorOn(h: Hall, wall: Wall, at: number, len: number): Pick<HallFeature, "x" | "y" | "w" | "d"> {
  if (wall === "North") return { x: at, y: 0, w: len, d: DOOR_DEPTH };
  if (wall === "South") return { x: at, y: h.depth - DOOR_DEPTH, w: len, d: DOOR_DEPTH };
  if (wall === "West") return { x: 0, y: at, w: DOOR_DEPTH, d: len };
  return { x: h.width - DOOR_DEPTH, y: at, w: DOOR_DEPTH, d: len };
}
/** A hall resized keeps its doors on the walls they were on. */
export function resizeHall(h: Hall, width: number, depth: number): Hall {
  const next = { ...h, width, depth };
  return { ...next, features: h.features.map((f) => (f.kind === "Pillar" ? f : { ...f, ...doorOn(next, wallOf(h, f)!, doorAlong(h, f).at, doorAlong(h, f).len) })) };
}
const overlaps = (a: { x: number; y: number; w: number; d: number }, b: { x: number; y: number; w: number; d: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

/** Why a hall cannot be saved as it stands: its size, its booths and its features must agree (SET-1). */
export function hallProblems(expo: ExpoState, h: Hall): string[] {
  const out: string[] = [];
  if (!h.name.trim()) out.push("Give the hall a name");
  if (expo.halls.some((x) => x.id !== h.id && x.eventId === h.eventId && x.name.trim().toLowerCase() === h.name.trim().toLowerCase())) out.push(`There is already a hall called ${h.name.trim()}`);
  if (h.width < 6 || h.depth < 6) out.push("A hall is at least 6 × 6 m");
  const booths = expo.booths.filter((b) => b.hallId === h.id);
  if (booths.some((b) => b.x + b.w > h.width || b.y + b.d > h.depth)) out.push("Booths sit beyond that size; move them first");
  for (const f of h.features) {
    const name = f.kind.toLowerCase();
    if (f.x < 0 || f.y < 0 || f.x + f.w > h.width || f.y + f.d > h.depth) out.push(`The ${name} at ${f.x}, ${f.y} m is outside the hall`);
    else if (f.kind === "Pillar") {
      const under = booths.find((b) => overlaps(b, f));
      if (under) out.push(`The pillar at ${f.x}, ${f.y} m is under ${under.code}; move the booth first`);
    }
    if (f.kind !== "Pillar" && (f.w < 1 && f.d < 1)) out.push(`The ${name} needs a width`);
  }
  if (!h.features.some((f) => f.kind === "Entrance")) out.push("A hall needs an entrance");
  return out;
}
/** A booth's fee, net of VAT: m² × the type's rate × the category's factor, unless a price was agreed. */
export const boothNet = (cfg: ExpoConfig, b: Booth) => b.priceOverride ?? Math.round((area(b) * cfg.rates[b.type] * cfg.factors[b.category]) / 100) * 100;
export const gross = (net: number, vatPct: number) => Math.round(net * (1 + vatPct / 100));

export const invoiceNet = (inv: Invoice) => inv.lines.reduce((n, l) => n + l.qty * l.unit, 0);
export const invoiceTotal = (inv: Invoice) => gross(invoiceNet(inv), inv.vatPct);
export const invoicePaid = (expo: ExpoState, inv: Invoice) => expo.payments.filter((p) => p.invoiceId === inv.id).reduce((n, p) => n + p.amount, 0);
export const invoiceOwed = (expo: ExpoState, inv: Invoice) => (inv.state === "Issued" ? Math.max(0, invoiceTotal(inv) - invoicePaid(expo, inv)) : 0);

export type InvoiceStatus = "Draft" | "Issued" | "Part paid" | "Paid" | "Overdue" | "Void";
export function invoiceStatus(expo: ExpoState, inv: Invoice, now: string): InvoiceStatus {
  if (inv.state !== "Issued") return inv.state;
  const paid = invoicePaid(expo, inv);
  if (paid >= invoiceTotal(inv)) return "Paid";
  if (inv.due < now.slice(0, 10)) return "Overdue";
  return paid > 0 ? "Part paid" : "Issued";
}
export type Age = "Not due" | "1–14 days" | "15+ days";
export function ageOf(inv: Invoice, now: string): Age {
  const late = daysBetween(inv.due, now.slice(0, 10));
  return late <= 0 ? "Not due" : late <= 14 ? "1–14 days" : "15+ days";
}
export const owedBy = (expo: ExpoState, exhibitorId: string) => expo.invoices.filter((i) => i.exhibitorId === exhibitorId).reduce((n, i) => n + invoiceOwed(expo, i), 0);

/* ---------- bookings and booths ---------- */

export const holdExpiresAt = (b: Booking, cfg: ExpoConfig) => addMinutes(b.heldAt, cfg.holdHours * 60);
export type BookingStage = "Held" | "Expired" | "Reserved" | "Booked" | "Cancelled";

/** Held until the contract is signed (or the hold runs out); Reserved until the first invoice is paid; then Booked. */
export function bookingStage(expo: ExpoState, b: Booking, cfg: ExpoConfig, now: string): BookingStage {
  if (b.cancelled) return "Cancelled";
  if (!b.contract) return holdExpiresAt(b, cfg) < now ? "Expired" : "Held";
  const first = expo.invoices.find((i) => i.bookingId === b.id && i.state === "Issued" && (i.kind === "Deposit" || i.kind === "Full"));
  if (!first) return "Booked"; // a stand included in a sponsorship package has nothing to pay
  return invoicePaid(expo, first) >= invoiceTotal(first) ? "Booked" : "Reserved";
}
export const isActive = (stage: BookingStage) => stage === "Held" || stage === "Reserved" || stage === "Booked";

export function activeBookingOfBooth(expo: ExpoState, boothId: string, cfg: ExpoConfig, now: string) {
  return expo.bookings.find((b) => b.boothIds.includes(boothId) && isActive(bookingStage(expo, b, cfg, now)));
}
export function activeBookingOf(expo: ExpoState, exhibitorId: string, cfg: ExpoConfig, now: string) {
  return expo.bookings.find((b) => b.exhibitorId === exhibitorId && isActive(bookingStage(expo, b, cfg, now)));
}
export function boothStatus(expo: ExpoState, booth: Booth, cfg: ExpoConfig, now: string): BoothStatus {
  if (booth.blocked) return "Blocked";
  const b = activeBookingOfBooth(expo, booth.id, cfg, now);
  if (!b) return "Available";
  const st = bookingStage(expo, b, cfg, now);
  return st === "Held" ? "Held" : st === "Reserved" ? "Reserved" : "Booked";
}

/** Paid in full: every issued invoice of the exhibitor settled. The desk admits its staff only then (OPS-1). */
/** The booking is paid in full: the stand fee and its passes. Equipment orders are billed apart and do not hold up the stand. */
export function paidInFull(expo: ExpoState, exhibitorId: string) {
  return expo.invoices.filter((i) => i.exhibitorId === exhibitorId && i.state === "Issued" && !i.orderId).every((i) => invoicePaid(expo, i) >= invoiceTotal(i));
}

/** Where a booth may go: inside its hall, not over a pillar, not over another booth, its code unique. */
export function placementProblems(expo: ExpoState, cand: Booth): string[] {
  const hall = expo.halls.find((h) => h.id === cand.hallId);
  if (!hall) return ["Choose a hall"];
  const out: string[] = [];
  if (cand.w < 2 || cand.d < 2) out.push("A booth is at least 2 × 2 m");
  if (cand.x < 0 || cand.y < 0 || cand.x + cand.w > hall.width || cand.y + cand.d > hall.depth) out.push(`Outside ${hall.name}`);
  const hits = (a: { x: number; y: number; w: number; d: number }, b: { x: number; y: number; w: number; d: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
  for (const o of expo.booths) if (o.id !== cand.id && o.hallId === cand.hallId && hits(o, cand)) out.push(`Overlaps ${o.code}`);
  if (hall.features.some((f) => f.kind === "Pillar" && hits(f, cand))) out.push("Sits over a pillar");
  if (!cand.code.trim()) out.push("Give it a code");
  else if (expo.booths.some((o) => o.id !== cand.id && o.eventId === cand.eventId && o.code.toLowerCase() === cand.code.trim().toLowerCase())) out.push(`Code ${cand.code} is taken`);
  return out;
}

/** Why a set of booths cannot be held for an exhibitor right now (BTH-2, BTH-3, BTH-5). */
export function holdProblems(expo: ExpoState, cfg: ExpoConfig, ex: Exhibitor, boothIds: string[], now: string): string[] {
  const out: string[] = [];
  if (ex.status !== "Approved") out.push("Only an approved exhibitor can hold a booth");
  if (!boothIds.length) out.push("Choose a booth");
  const mine = activeBookingOf(expo, ex.id, cfg, now);
  if (mine) out.push(`${ex.name} already has ${mine.boothIds.map((id) => expo.booths.find((b) => b.id === id)?.code).join(", ")}; cancel that booking first`);
  for (const id of boothIds) {
    const b = expo.booths.find((x) => x.id === id);
    if (!b) out.push("No such booth");
    else {
      const st = boothStatus(expo, b, cfg, now);
      if (st !== "Available") out.push(`${b.code} is ${st.toLowerCase()}`);
    }
  }
  if (now.slice(0, 10) > cfg.showDays[cfg.showDays.length - 1].date) out.push("The show is over");
  return out;
}

/** Passes that come with the stand: two per 9 m², never fewer than two. */
export const allowance = (cfg: ExpoConfig, booths: Booth[]) => Math.max(cfg.passPer9, Math.floor(booths.reduce((n, b) => n + area(b), 0) / 9) * cfg.passPer9);
export const extraPassesBought = (expo: ExpoState, exhibitorId: string) =>
  expo.invoices.filter((i) => i.exhibitorId === exhibitorId && i.state !== "Void").reduce((n, i) => n + i.lines.filter((l) => l.label.startsWith("Extra exhibitor pass")).reduce((m, l) => m + l.qty, 0), 0);
export const staffOf = (state: AppState, exhibitorId: string) => state.delegates.filter((d) => d.exhibitorId === exhibitorId && d.tierId === "t_exhibitor" && !d.cancelled);
/** People registered beyond what the stand includes and what was already bought; signing the contract invoices them (POR-2). */
export const passesOver = (state: AppState, cfg: ExpoConfig, exhibitorId: string, boothIds: string[]) =>
  Math.max(0, staffOf(state, exhibitorId).length - allowance(cfg, state.expo.booths.filter((b) => boothIds.includes(b.id))) - extraPassesBought(state.expo, exhibitorId));

/* ---------- the invoices a signed contract issues (SAL-2) ---------- */

/** When a contract signed on `day` is paid: in full at once inside the last days before the show, else a deposit and a balance. */
export function scheduleOnSigning(cfg: ExpoConfig, day: string) {
  if (daysBetween(day, cfg.showDays[0].date) <= cfg.fullInvoiceDays) return { full: true as const, due: day };
  const depositDue = addMinutes(`${day} 00:00`, cfg.depositDays * 1440).slice(0, 10);
  return { full: false as const, depositDue, balanceDue: cfg.balanceDue > depositDue ? cfg.balanceDue : depositDue };
}

export function invoicesOnSigning(cfg: ExpoConfig, ex: Exhibitor, booking: Booking, booths: Booth[], at: string, nextNumber: () => string, nextId: () => string, extraPasses = 0): Invoice[] {
  const net = booths.reduce((n, b) => n + boothNet(cfg, b), 0);
  const what = booths.map((b) => `${b.code}, ${b.w} × ${b.d} m ${b.type.toLowerCase()}, ${b.category.toLowerCase()}`).join("; ");
  const day = at.slice(0, 10);
  const base = { eventId: ex.eventId, exhibitorId: ex.id, bookingId: booking.id, vatPct: cfg.vatPct, issuedAt: at, state: "Issued" as const };
  const plan = scheduleOnSigning(cfg, day);
  const out: Invoice[] = [];
  if (net > 0 && plan.full) out.push({ ...base, id: nextId(), number: nextNumber(), kind: "Full", lines: [{ label: `Stand fee: ${what}`, qty: 1, unit: net }], due: plan.due });
  if (net > 0 && !plan.full) {
    const deposit = Math.round((net * cfg.depositPct) / 100);
    out.push(
      { ...base, id: nextId(), number: nextNumber(), kind: "Deposit", lines: [{ label: `Deposit, ${cfg.depositPct}% of the stand fee: ${what}`, qty: 1, unit: deposit }], due: plan.depositDue },
      { ...base, id: nextId(), number: nextNumber(), kind: "Balance", lines: [{ label: `Balance of the stand fee: ${what}`, qty: 1, unit: net - deposit }], due: plan.balanceDue },
    );
  }
  // people registered beyond the allowance before signing: their passes are invoiced now, due with the first payment
  if (extraPasses > 0) out.push({ ...base, id: nextId(), number: nextNumber(), kind: "Extras", lines: [{ label: "Extra exhibitor pass", qty: extraPasses, unit: cfg.extraPass }], due: out[0]?.due ?? day });
  return out;
}

/** An invoice line as people read it: "2 × Extra exhibitor pass, KES 2,500 each". */
export const lineText = (l: Invoice["lines"][number]) => (l.qty > 1 ? `${l.qty} × ${l.label}, ${kes(l.unit)} each` : l.label);

export const exhibitorRef = (n: number) => `NBS-EX-${String(n).padStart(4, "0")}`;
export const invoiceNo = (n: number) => `INV-EX-${String(n).padStart(4, "0")}`;

/** A bank line that could settle an invoice: its reference names the invoice or the exhibitor, or its amount is exactly what is owed. */
export function suggestMatch(expo: ExpoState, line: BankLine): Invoice | undefined {
  const open = expo.invoices.filter((i) => i.eventId === line.eventId && invoiceOwed(expo, i) > 0);
  const ref = line.reference.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    open.find((i) => ref.includes(i.number.toLowerCase().replace(/[^a-z0-9]/g, ""))) ??
    open.find((i) => ref.includes((expo.exhibitors.find((e) => e.id === i.exhibitorId)?.ref ?? "#").toLowerCase().replace(/[^a-z0-9]/g, "")) && invoiceOwed(expo, i) === line.amount) ??
    open.find((i) => invoiceOwed(expo, i) === line.amount)
  );
}

/* ---------- the invariants, shown on Settings, Checks ---------- */

export function validateExpo(state: AppState): string[] {
  const expo = state.expo;
  const out: string[] = [];
  for (const b of expo.booths) for (const p of placementProblems(expo, b)) out.push(`${b.code}: ${p}`);
  for (const cfg of Object.values(expo.configs)) {
    const now = expo.clock;
    for (const b of expo.booths.filter((x) => x.eventId === cfg.eventId)) {
      const active = expo.bookings.filter((k) => k.boothIds.includes(b.id) && isActive(bookingStage(expo, k, cfg, now)));
      if (active.length > 1) out.push(`${b.code} is booked ${active.length} times`);
      if (active.length && b.blocked) out.push(`${b.code} is blocked but booked`);
    }
    for (const e of expo.exhibitors.filter((x) => x.eventId === cfg.eventId)) {
      const k = activeBookingOf(expo, e.id, cfg, now);
      const staff = staffOf(state, e.id).length;
      // while a booth is only held, extra people are a charge to come; once signed, every pass is paid for
      if (k?.contract) {
        const cap = allowance(cfg, expo.booths.filter((b) => k.boothIds.includes(b.id))) + extraPassesBought(expo, e.id);
        if (staff > cap) out.push(`${e.name} has ${staff} passes for an allowance of ${cap}`);
      }
      if (e.status !== "Approved" && expo.bookings.some((x) => x.exhibitorId === e.id && isActive(bookingStage(expo, x, cfg, now)))) out.push(`${e.name} holds a booth without approval`);
    }
  }
  for (const inv of expo.invoices) if (invoicePaid(expo, inv) > invoiceTotal(inv)) out.push(`${inv.number} is paid more than its total`);
  const slots = new Map<string, number>();
  for (const d of expo.deliveries) if (!d.cancelled) slots.set(`${d.bayId} ${d.slot}`, (slots.get(`${d.bayId} ${d.slot}`) ?? 0) + 1);
  for (const [k, n] of slots) {
    const d = expo.deliveries.find((x) => `${x.bayId} ${x.slot}` === k)!;
    if (n > expo.configs[d.eventId].vehiclesPerSlot) out.push(`${k} has ${n} vehicles for ${expo.configs[d.eventId].vehiclesPerSlot} places`);
  }
  for (const o of expo.orders) if (!expo.invoices.some((i) => i.id === o.invoiceId && i.orderId === o.id)) out.push(`Order ${o.id} has no invoice`);
  const codes = new Map<string, number>();
  for (const d of state.delegates) codes.set(d.badgeCode, (codes.get(d.badgeCode) ?? 0) + 1);
  for (const [c, n] of codes) if (n > 1) out.push(`Badge code ${c} is used ${n} times`);
  return out;
}

export const linkedExhibitor = (state: AppState, d: Delegate) => (d.exhibitorId ? state.expo.exhibitors.find((e) => e.id === d.exhibitorId) : undefined);
