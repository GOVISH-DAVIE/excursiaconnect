/**
 * The stand and the logistics around it, as pure functions (cut 2): stand staff and contractors, branding,
 * equipment orders, requirements, move-in, deliveries, dismantling and issues. The onsite reducer enforces
 * them; the portal and the workspace call the same functions to explain a refusal before it happens.
 */
import { splitCsv } from "../csv";
import { addMinutes, fmtStamp } from "../time";
import type { AppState, Delegate } from "../types";
import { activeBookingOf, allowance, extraPassesBought, staffOf } from "./logic";
import type { Branding, Delivery, Dismantle, ExpoConfig, ExpoDoc, ExpoState, Exhibitor, Invoice, InvoiceLine, Issue, IssueCategory, IssuePriority, RequirementKind, StandOrder } from "./types";

export const EXHIBITOR_TIER = "t_exhibitor";
export const CONTRACTOR_TIER = "t_contractor";
export const FASCIA_MAX = 24;
export const REQUIREMENT_KINDS: RequirementKind[] = ["Access", "Storage", "Rigging", "Other"];
export const ISSUE_CATEGORIES: IssueCategory[] = ["Power", "Internet", "Furniture", "Cleaning", "Security", "Other"];
export const ISSUE_PRIORITIES: IssuePriority[] = ["Urgent", "Normal", "Low"];

const day = (base: string, n: number) => addMinutes(`${base} 00:00`, n * 1440).slice(0, 10);

/** When the last show day closes: after it, nothing new is ordered or registered. */
export const showEnd = (cfg: ExpoConfig) => {
  const last = cfg.showDays[cfg.showDays.length - 1];
  return `${last.date} ${last.close}`;
};

/** The signed booking the stand services hang from: staff, branding, orders and logistics wait for the contract. */
export function signedBooking(expo: ExpoState, cfg: ExpoConfig, exhibitorId: string, now: string) {
  const k = activeBookingOf(expo, exhibitorId, cfg, now);
  return k?.contract ? k : undefined;
}

/** What still waits on the company before the stand services open, in its own words; empty when they are open. */
export function servicesClosed(expo: ExpoState, cfg: ExpoConfig, exhibitorId: string, now: string): string | undefined {
  if (!activeBookingOf(expo, exhibitorId, cfg, now)) return "Stand services open once you have a booth and a signed contract.";
  if (!signedBooking(expo, cfg, exhibitorId, now)) return "Stand services open once the contract is signed.";
  return undefined;
}

/* ---------- stand staff and contractors (POR-2, LOG-2) ---------- */

export interface NewPerson {
  name: string;
  email: string;
  phone: string;
  title: string;
}
export type PersonKind = "Staff" | "Contractor";

export const contractorsOf = (state: AppState, exhibitorId: string) => state.delegates.filter((d) => d.exhibitorId === exhibitorId && d.tierId === CONTRACTOR_TIER && !d.cancelled);

/** The passes this company can use without paying more: the stand's allowance plus what it already bought. */
export function passCap(state: AppState, cfg: ExpoConfig, exhibitorId: string) {
  const k = activeBookingOf(state.expo, exhibitorId, cfg, state.expo.clock);
  if (!k) return 0;
  return allowance(cfg, state.expo.booths.filter((b) => k.boothIds.includes(b.id))) + extraPassesBought(state.expo, exhibitorId);
}

/** How many of `adding` new staff go beyond the passes the company has: each is invoiced as an extra pass. */
export const extraNeeded = (state: AppState, cfg: ExpoConfig, exhibitorId: string, adding: number) => Math.max(0, staffOf(state, exhibitorId).length + adding - passCap(state, cfg, exhibitorId));

/** Why these people cannot be registered. Going over the allowance is not a problem: the extra passes are invoiced. */
export function peopleProblems(state: AppState, cfg: ExpoConfig, exhibitorId: string, people: NewPerson[], now: string): string[] {
  const out: string[] = [];
  const closed = servicesClosed(state.expo, cfg, exhibitorId, now);
  if (closed) out.push(closed);
  if (now >= showEnd(cfg)) out.push("The show is over");
  if (!people.length) out.push("Add at least one person");
  const known = new Set(state.delegates.filter((d) => d.exhibitorId === exhibitorId && !d.cancelled).map((d) => d.email.trim().toLowerCase()));
  people.forEach((p, i) => {
    const row = people.length > 1 ? `Row ${i + 1}: ` : "";
    const email = p.email.trim().toLowerCase();
    if (!p.name.trim()) out.push(`${row}a name is needed`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.push(`${row}${p.email.trim() || "the email"} is not an email address`);
    else if (known.has(email)) out.push(`${row}${p.email.trim()} is already registered`);
    else known.add(email);
  });
  return out;
}

/** People from a pasted or uploaded CSV: a header row naming the columns, or name, email, phone, title in that order. */
export function peopleFromCsv(text: string): NewPerson[] {
  const rows = splitCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((c) => c.trim().toLowerCase());
  const hasHeader = head.some((c) => c.includes("email"));
  const col = (names: string[], fallback: number) => {
    const i = head.findIndex((c) => names.some((n) => c.includes(n)));
    return hasHeader ? i : fallback;
  };
  const at = { name: col(["name"], 0), email: col(["email", "e-mail"], 1), phone: col(["phone", "mobile"], 2), title: col(["title", "role", "job"], 3) };
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  return (hasHeader ? rows.slice(1) : rows).map((r) => ({ name: cell(r, at.name), email: cell(r, at.email), phone: cell(r, at.phone), title: cell(r, at.title) })).filter((p) => p.name || p.email);
}

/** A badge code no other delegate has, derived from the delegate's id so the seed and a replay agree. */
export function badgeCodeFor(used: Set<string>, id: string, prefix: string) {
  let n = id.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9000, 7);
  let code = `EXC-${prefix}-${1000 + n}`;
  while (used.has(code)) {
    n = (n + 1) % 9000;
    code = `EXC-${prefix}-${1000 + n}`;
  }
  return code;
}

/** The delegate record behind a stand pass: staff on the exhibitor tier, contractors on their own. */
export function personDelegate(ex: Exhibitor, id: string, p: NewPerson, kind: PersonKind, badgeCode: string): Delegate {
  return {
    id,
    eventId: ex.eventId,
    name: p.name.trim(),
    email: p.email.trim(),
    phone: p.phone.trim(),
    organisation: ex.name,
    jobTitle: p.title.trim() || (kind === "Staff" ? "Stand staff" : "Stand contractor"),
    country: ex.country,
    category: kind === "Staff" ? "Exhibitor" : "Contractor",
    tierId: kind === "Staff" ? EXHIBITOR_TIER : CONTRACTOR_TIER,
    status: "Confirmed",
    accredited: false,
    checkIns: [],
    zoneLog: [],
    sessions: [],
    bookable: false,
    badgeCode,
    exhibitorId: ex.id,
  };
}

/** When something invoiced before the show is due: in a week, never after the first show day, at once from then. */
export function extrasDue(cfg: ExpoConfig, at: string) {
  const today = at.slice(0, 10);
  const show = cfg.showDays[0].date;
  if (today >= show) return today;
  const week = day(today, 7);
  return week < show ? week : show;
}

/* ---------- branding (POR-3, POR-6) ---------- */

export type BrandingState = "Not sent" | "Waiting for approval" | "Approved" | "Returned";
export const brandingState = (b?: Branding): BrandingState => (!b ? "Not sent" : (b.decision?.state ?? "Waiting for approval"));

export function brandingProblems(expo: ExpoState, cfg: ExpoConfig, exhibitorId: string, b: { fascia: string; logo?: ExpoDoc }, now: string): string[] {
  const out: string[] = [];
  const closed = servicesClosed(expo, cfg, exhibitorId, now);
  if (closed) out.push(closed);
  if (now >= showEnd(cfg)) out.push("The show is over");
  const fascia = b.fascia.trim();
  if (!fascia) out.push("The fascia name is needed");
  else if (fascia.length > FASCIA_MAX) out.push(`The fascia takes ${FASCIA_MAX} characters; this is ${fascia.length}`);
  if (!b.logo) out.push("Add your logo");
  return out;
}

/* ---------- equipment and services (POR-4, LOG-4) ---------- */

export const orderLate = (cfg: ExpoConfig, at: string) => at.slice(0, 10) > cfg.orderDeadline;

/** The invoice lines for an order: each catalogue item at its price, and the surcharge on a late order. */
export function orderLines(cfg: ExpoConfig, lines: StandOrder["lines"], late: boolean): InvoiceLine[] {
  const out: InvoiceLine[] = lines
    .filter((l) => l.qty > 0)
    .map((l) => {
      const it = cfg.catalogue.find((c) => c.id === l.itemId)!;
      return { label: it.name, qty: l.qty, unit: it.price };
    });
  const net = out.reduce((n, l) => n + l.qty * l.unit, 0);
  if (late && net > 0) out.push({ label: `Late order surcharge, ${cfg.lateSurchargePct}%`, qty: 1, unit: Math.round((net * cfg.lateSurchargePct) / 100) });
  return out;
}

export function orderProblems(expo: ExpoState, cfg: ExpoConfig, exhibitorId: string, lines: StandOrder["lines"], now: string): string[] {
  const out: string[] = [];
  const closed = servicesClosed(expo, cfg, exhibitorId, now);
  if (closed) out.push(closed);
  if (now >= showEnd(cfg)) out.push("The show is over");
  const real = lines.filter((l) => l.qty > 0);
  if (!real.length) out.push("Choose at least one item");
  for (const l of real) {
    if (!cfg.catalogue.some((c) => c.id === l.itemId)) out.push("An item is no longer in the catalogue");
    if (!Number.isInteger(l.qty) || l.qty > 50) out.push("Order whole numbers, up to 50 of an item");
  }
  return out;
}

export function orderInvoice(cfg: ExpoConfig, order: StandOrder, bookingId: string | undefined, number: string, id: string): Invoice {
  return { id, eventId: order.eventId, exhibitorId: order.exhibitorId, bookingId, number, kind: "Extras", lines: orderLines(cfg, order.lines, order.late), vatPct: cfg.vatPct, issuedAt: order.at, due: extrasDue(cfg, order.at), orderId: order.id, state: "Issued" };
}

/** Fulfilment moves forward only; rentals are collected once dismantling starts. */
export function orderStepProblems(cfg: ExpoConfig, o: StandOrder, to: StandOrder["state"], now: string): string[] {
  if (o.state === "Ordered" && to === "Delivered") return [];
  if (o.state === "Delivered" && to === "Collected") return now >= cfg.dismantle.from ? [] : [`Rentals are collected from ${fmtStamp(cfg.dismantle.from)}, when dismantling starts`];
  return [`An order ${o.state.toLowerCase()} cannot become ${to.toLowerCase()}`];
}

/* ---------- move-in and deliveries (LOG-1, LOG-3) ---------- */

/** The slot starts inside a window: every slot length, during working hours (07:00 to 20:00) on each day. */
export function slotTimes(cfg: ExpoConfig, window: { from: string; to: string }): string[] {
  const out: string[] = [];
  for (let t = window.from; addMinutes(t, cfg.slotMin) <= window.to; t = addMinutes(t, cfg.slotMin)) {
    const hm = t.slice(11);
    if (hm >= "07:00" && addMinutes(t, cfg.slotMin).slice(11) <= "20:00" && addMinutes(t, cfg.slotMin).slice(0, 10) === t.slice(0, 10)) out.push(t);
  }
  return out;
}
export const deliverySlots = (cfg: ExpoConfig) => [...slotTimes(cfg, cfg.buildUp), ...slotTimes(cfg, cfg.dismantle)];

/** Build-up ends before the show opens; dismantling starts after it closes; each window runs forward. */
export function windowProblems(cfg: ExpoConfig, buildUp: { from: string; to: string }, dismantle: { from: string; to: string }): string[] {
  const out: string[] = [];
  const first = cfg.showDays[0];
  if (!(buildUp.from < buildUp.to)) out.push("Build-up must end after it starts");
  if (!(dismantle.from < dismantle.to)) out.push("Dismantling must end after it starts");
  if (buildUp.to > `${first.date} ${first.open}`) out.push(`Build-up must end before the show opens, ${fmtStamp(`${first.date} ${first.open}`)}`);
  if (dismantle.from < showEnd(cfg)) out.push(`Dismantling cannot start before the show closes, ${fmtStamp(showEnd(cfg))}`);
  return out;
}

export function moveInProblems(cfg: ExpoConfig, at: string, now: string): string[] {
  if (!slotTimes(cfg, cfg.buildUp).includes(at)) return [`Move-in is during build-up, on the ${cfg.slotMin}-minute slots`];
  return at <= now ? ["That time has passed"] : [];
}

export type DeliveryStatus = "Booked" | "Arrived" | "Missed" | "Cancelled";
export function deliveryStatus(cfg: ExpoConfig, d: Delivery, now: string): DeliveryStatus {
  if (d.cancelled) return "Cancelled";
  if (d.arrived) return "Arrived";
  return addMinutes(d.slot, cfg.slotMin) <= now ? "Missed" : "Booked";
}
export const inSlot = (expo: ExpoState, bayId: string, slot: string) => expo.deliveries.filter((d) => d.bayId === bayId && d.slot === slot && !d.cancelled);

export function deliveryProblems(expo: ExpoState, cfg: ExpoConfig, d: { exhibitorId: string; bayId: string; slot: string; vehicle: string }, now: string): string[] {
  const out: string[] = [];
  const closed = servicesClosed(expo, cfg, d.exhibitorId, now);
  if (closed) out.push(closed);
  const bay = cfg.bays.find((b) => b.id === d.bayId);
  if (!bay) out.push("Choose a loading bay");
  if (!deliverySlots(cfg).includes(d.slot)) out.push("Deliveries are booked on the slots in build-up and dismantling");
  else if (d.slot <= now) out.push("That slot has passed");
  else if (bay && inSlot(expo, bay.id, d.slot).length >= cfg.vehiclesPerSlot) out.push(`${bay.name} is full at ${d.slot.slice(11)}: ${cfg.vehiclesPerSlot} vehicles a slot`);
  if (!d.vehicle.trim()) out.push("Give the vehicle's registration");
  return out;
}

/* ---------- dismantling (LOG-5) ---------- */

export const dismantleOpen = (cfg: ExpoConfig, now: string) => now >= cfg.dismantle.from;
export type DismantleState = "Not started" | "In progress" | "Signed off";
export const dismantleState = (d?: Dismantle): DismantleState => (d?.signedOff ? "Signed off" : d?.cleared || d?.returned ? "In progress" : "Not started");
/** Rentals still on the stand: delivered and not yet collected. */
export const rentalsOut = (expo: ExpoState, exhibitorId: string) => expo.orders.filter((o) => o.exhibitorId === exhibitorId && o.state === "Delivered");

export function signOffProblems(expo: ExpoState, cfg: ExpoConfig, exhibitorId: string, now: string): string[] {
  const out: string[] = [];
  const d = expo.dismantles.find((x) => x.exhibitorId === exhibitorId);
  if (!dismantleOpen(cfg, now)) out.push(`Dismantling starts ${fmtStamp(cfg.dismantle.from)}`);
  if (d?.signedOff) out.push("Already signed off");
  if (!d?.cleared) out.push("The stand is not cleared yet");
  if (rentalsOut(expo, exhibitorId).length) out.push("Rentals are still to be collected");
  return out;
}

/* ---------- issues (OPS-4; resolved in operations, cut 3) ---------- */

export const issueDue = (cfg: ExpoConfig, i: Issue) => addMinutes(i.at, cfg.slaMin[i.priority]);
export type IssueStatus = "Open" | "Assigned" | "Overdue" | "Resolved";
export function issueStatus(cfg: ExpoConfig, i: Issue, now: string): IssueStatus {
  if (i.resolved) return "Resolved";
  if (issueDue(cfg, i) < now) return "Overdue";
  return i.assignee ? "Assigned" : "Open";
}
export function issueProblems(expo: ExpoState, cfg: ExpoConfig, i: { exhibitorId?: string; text: string }, now: string, asExhibitor: boolean): string[] {
  const out: string[] = [];
  if (asExhibitor && i.exhibitorId && !signedBooking(expo, cfg, i.exhibitorId, now)) out.push("Issues are reported for a booked stand");
  if (!i.text.trim()) out.push("Say what is wrong");
  if (now > `${cfg.dismantle.to}`) out.push("The exhibition is over");
  return out;
}
