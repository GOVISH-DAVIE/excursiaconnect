/**
 * The stand and logistics records for the seeded exhibition, as of show day 1 (cut 2): build-up is over, so
 * move-ins happened, most branding is approved and printed, orders were delivered to the stands, and the
 * dismantling collections are booked. Everything goes through the same functions the reducer uses.
 */
import { addMinutes } from "../time";
import type { Delegate, Tier } from "../types";
import { CONTRACTOR_TIER, badgeCodeFor, orderInvoice, orderLate, personDelegate, slotTimes } from "./onsite";
import type { Booking, Booth, Branding, Delivery, ExpoConfig, ExpoDoc, ExpoMessage, Exhibitor, Invoice, Issue, MoveIn, Payment, Requirement, StandOrder } from "./types";

export interface OnsiteSeed {
  cfg: ExpoConfig;
  exhibitors: Exhibitor[];
  bookings: Booking[];
  booths: Booth[];
  delegates: Delegate[];
  invoices: Invoice[];
  payments: Payment[];
  between: (a: number, b: number) => number;
  pay: (inv: Invoice, at: string, method: Payment["method"]) => Payment;
  msg: (at: string, to: string, subject: string, channel?: ExpoMessage["channel"]) => void;
  nextInvoice: () => { number: string; id: string };
  first: string[];
  last: string[];
}

const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const later = (a: string, b: string) => (a > b ? a : b);
const hh = (h: number) => String(h).padStart(2, "0");
/** A seeded time moved into working hours: after 18:00 it waits for the next morning, before 08:00 for that morning. */
const office = (t: string) => {
  const h = Number(t.slice(11, 13));
  if (h >= 18) return `${addMinutes(`${t.slice(0, 10)} 00:00`, 1440).slice(0, 10)} 09:${t.slice(14, 16)}`;
  if (h < 8) return `${t.slice(0, 10)} 09:${t.slice(14, 16)}`;
  return t;
};

export function seedOnsite(c: OnsiteSeed) {
  const { cfg, between } = c;
  const signed = c.bookings.filter((k) => k.contract && !k.cancelled);
  const exOf = (k: Booking) => c.exhibitors.find((e) => e.id === k.exhibitorId)!;
  const boothsOf = (k: Booking) => c.booths.filter((b) => k.boothIds.includes(b.id));
  const spaceOnly = (k: Booking) => boothsOf(k).some((b) => b.type === "Space only");
  const bayOf = (k: Booking) => (boothsOf(k)[0].hallId === "h_pav" ? "bay2" : "bay1");
  const log = (k: Booking, at: string, by: string, what: string) => k.history.push({ at, by, what });

  /* move-in (LOG-1): space-only stands build on the first day, an hour apart; shell schemes on the second, from 08:00 */
  const slots = slotTimes(cfg, cfg.buildUp);
  const firstDay = slots.filter((s) => s.startsWith(cfg.buildUp.from.slice(0, 10)));
  const secondDay = slots.filter((s) => !s.startsWith(cfg.buildUp.from.slice(0, 10)));
  let a = 0;
  let b = 2;
  const moveIns: MoveIn[] = signed.map((k) => {
    const at = spaceOnly(k) ? firstDay[(a++ * 2) % firstDay.length] : secondDay[b++ % secondDay.length];
    const set = office(later("2026-11-16 10:00", addMinutes(k.contract!.at, 120)));
    c.msg(set, k.exhibitorId, `Your move-in time is ${at.slice(8, 10)} Nov, ${at.slice(11)}`);
    return { eventId: k.eventId, exhibitorId: k.exhibitorId, at, by: "u_staff2" };
  });
  const moveInOf = (k: Booking) => moveIns.find((m) => m.exhibitorId === k.exhibitorId)!.at;

  /* branding (POR-3, POR-6): most approved before the deadline, a few late and waiting, one returned, a few never sent */
  const doc = (id: string, name: string, kind: string, at: string): ExpoDoc => ({ id, name, kind, size: between(60, 2400) * 1024, at });
  const branding: Branding[] = [];
  signed.forEach((k, n) => {
    const e = exOf(k);
    if (n % 13 === 5) return;
    // never before the contract: a late signer sends late
    const planned = n % 9 === 4 ? `2026-11-${18 + (n % 5)} ${hh(10 + (n % 6))}:${n % 2 ? "15" : "40"}` : `2026-11-${hh(4 + (n % 10))} ${hh(9 + (n % 8))}:${n % 2 ? "05" : "35"}`;
    const sent = office(later(planned, addMinutes(k.contract!.at, 180)));
    const late = sent.slice(0, 10) > cfg.brandingDeadline;
    const returned = !late && n % 11 === 7;
    const fascia = e.name.toUpperCase().slice(0, 24).trim();
    const artwork = spaceOnly(k) ? [doc(`doc_aw_${n}a`, `${slug(e.name)}-stand-render.pdf`, "Artwork", sent), doc(`doc_aw_${n}b`, `${slug(e.name)}-header.pdf`, "Artwork", sent)] : [doc(`doc_aw_${n}`, `${slug(e.name)}-back-wall.pdf`, "Artwork", sent)];
    const br: Branding = { eventId: k.eventId, exhibitorId: e.id, fascia, logo: doc(`doc_lg_${n}`, `${slug(e.name)}-logo.${n % 3 ? "svg" : "png"}`, "Logo", sent), artwork, submittedAt: sent, late, history: [{ at: sent, by: "exhibitor", what: `Sent${late ? " after the deadline" : ""}: fascia ${fascia}, ${artwork.length} artwork ${artwork.length === 1 ? "file" : "files"}` }] };
    if (!late) {
      const at = addMinutes(sent, 60 * 26);
      const note = returned ? "The logo is too small to print on the fascia; send a vector file (SVG or PDF)" : undefined;
      br.decision = { state: returned ? "Returned" : "Approved", by: "u_staff2", at, note };
      br.history.push({ at, by: "u_staff2", what: returned ? `Returned: ${note}` : "Approved" });
      c.msg(at, e.id, returned ? "Your stand branding needs a change" : "Your stand branding is approved");
    }
    branding.push(br);
  });

  /* equipment and services (POR-4, LOG-4): ordered in early November, a few after the deadline, all delivered at build-up but two from yesterday and this morning */
  const orders: StandOrder[] = [];
  const picks = [
    ["c_table", "c_chair"],
    ["c_socket"],
    ["c_counter", "c_rack"],
    ["c_wifi"],
    ["c_screen", "c_socket"],
    ["c_chair", "c_rack"],
    ["c_wired"],
    ["c_water"],
    ["c_3phase", "c_screen"],
  ];
  const chosen = signed.filter((_, n) => n % 2 === 0);
  chosen.forEach((k, n) => {
    const e = exOf(k);
    const recent = n === chosen.length - 1 ? "2026-11-25 09:40" : n === chosen.length - 2 ? "2026-11-24 16:20" : undefined;
    const planned = n % 6 === 4 ? `2026-11-${18 + (n % 4)} ${hh(11 + (n % 5))}:20` : `2026-11-${hh(3 + (n % 9))} ${hh(9 + (n % 7))}:${n % 2 ? "10" : "45"}`;
    const at = recent ?? office(later(planned, addMinutes(k.contract!.at, 120)));
    const lines = picks[n % picks.length].map((itemId, i) => ({ itemId, qty: itemId === "c_chair" ? 2 + (n % 3) : i === 0 ? 1 + (n % 2) : 1 }));
    const late = orderLate(cfg, at);
    const id = `ord_${n + 1}`;
    const o: StandOrder = { id, eventId: k.eventId, exhibitorId: e.id, lines, at, by: "exhibitor", late, state: "Ordered", history: [] };
    const { number, id: invId } = c.nextInvoice();
    const inv = orderInvoice(cfg, o, k.id, number, invId);
    c.invoices.push(inv);
    o.invoiceId = inv.id;
    o.history.push({ at, by: "exhibitor", what: `Ordered${late ? ", after the deadline, with the surcharge" : ""}; ${inv.number} issued` });
    c.msg(at, e.id, `Order received: ${inv.number} is ready`);
    if (!recent) {
      const delivered = later(`2026-11-${spaceOnly(k) ? "23" : "24"} ${hh(8 + (n % 9))}:${n % 2 ? "30" : "00"}`, addMinutes(at, 180));
      o.state = "Delivered";
      o.history.push({ at: delivered, by: "u_staff3", what: "Delivered" });
    }
    // paid by M-Pesa within a day or two, except a few still owed
    if (!recent && n % 7 !== 3) c.pay(inv, addMinutes(at, 60 * between(2, 40)), "M-Pesa");
    orders.push(o);
  });

  /* requirements (POR-5) for the floor team */
  const req = (id: string, exhibitorId: string, kind: Requirement["kind"], text: string, at: string, ack?: string): Requirement[] =>
    signed.some((k) => k.exhibitorId === exhibitorId) ? [{ id, eventId: signed[0].eventId, exhibitorId, kind, text, at, by: "exhibitor", ack: ack ? { by: "u_staff3", at: ack } : undefined }] : [];
  const requirements: Requirement[] = [
    ...req("rq_1", "ex_kcb-group", "Rigging", "A 4 m banner hung from the roof truss above P1; our rigger is certified and brings the harness.", "2026-11-09 11:20", "2026-11-10 09:15"),
    ...req("rq_2", "ex_safaricom", "Storage", "Forty boxes of giveaways stored overnight, close to I1.", "2026-11-12 14:05", "2026-11-13 10:00"),
    ...req("rq_3", "ex_equity-bank", "Access", "One of our team uses a wheelchair: a ramp onto the raised floor of I2, please.", "2026-11-14 09:30", "2026-11-14 15:40"),
    ...req("rq_4", "ex_nation-media", "Access", "Early access at 07:00 on 25 November to set up the live broadcast.", "2026-11-19 16:10", "2026-11-20 08:50"),
    ...req("rq_5", "ex_twiga-foods", "Other", "Fresh produce on the stand: a cold box and a bin collection each evening.", "2026-11-23 12:00"),
    ...req("rq_6", "ex_sauti-studios", "Other", "We record podcasts on the stand: please keep the PA speakers away from D1.", "2026-11-24 17:45"),
  ];

  /* deliveries (LOG-3): build-up drop-offs at each loading bay, mostly arrived; collections booked for dismantling */
  const deliveries: Delivery[] = [];
  const reg = (n: number) => `K${"CDB"[n % 3]}${String.fromCharCode(65 + ((n * 7) % 26))} ${100 + ((n * 37) % 900)}${String.fromCharCode(65 + ((n * 11) % 26))}`;
  const what = ["Stand build materials", "Brochures and giveaways", "Screens and AV kit", "Furniture and display stands", "Product samples"];
  signed
    .filter((k, n) => spaceOnly(k) || n % 3 === 0)
    .forEach((k, n) => {
      const slot = moveInOf(k);
      const bay = bayOf(k);
      if (deliveries.filter((d) => d.bayId === bay && d.slot === slot && !d.cancelled).length >= cfg.vehiclesPerSlot) return;
      const d: Delivery = { id: `dl_${deliveries.length + 1}`, eventId: k.eventId, exhibitorId: k.exhibitorId, bayId: bay, slot, vehicle: reg(n), what: what[n % what.length], at: office(later(addMinutes(k.contract!.at, 180), "2026-11-17 10:00")), by: "exhibitor" };
      if (n === 5) d.cancelled = { at: "2026-11-22 09:00", by: "exhibitor" };
      else if (n !== 8) d.arrived = { at: addMinutes(slot, between(0, 25)), by: "u_staff3" }; // one never came: it shows as missed
      deliveries.push(d);
    });
  const collect = slotTimes(cfg, cfg.dismantle);
  signed
    .filter((k) => spaceOnly(k))
    .slice(0, 6)
    .forEach((k, n) => {
      // the first two share the first slot at the Expo Hall bay, which fills it
      const slot = n < 2 ? collect[0] : collect[2 + n * 2];
      deliveries.push({ id: `dl_${deliveries.length + 1}`, eventId: k.eventId, exhibitorId: k.exhibitorId, bayId: n < 2 ? "bay1" : bayOf(k), slot, vehicle: reg(n + 20), what: "Stand collection", at: `2026-11-24 ${10 + n}:30`, by: "exhibitor" });
    });

  /* contractors (LOG-2): two stand builders for each space-only stand */
  const used = new Set(c.delegates.map((d) => d.badgeCode));
  const builders = ["Pazia Interiors", "Expo Craft Kenya", "Upesi Displays"];
  const contractors: Delegate[] = [];
  signed
    .filter((k) => spaceOnly(k))
    .forEach((k, n) => {
      const e = exOf(k);
      for (let i = 0; i < 2; i++) {
        const f = c.first[(n * 5 + i * 3 + 2) % c.first.length];
        const l = c.last[(n * 3 + i * 7 + 5) % c.last.length];
        const id = `d_ct_${slug(e.name)}_${i + 1}`;
        const code = badgeCodeFor(used, id, "CT");
        used.add(code);
        const builder = builders[(n + i) % builders.length];
        contractors.push(personDelegate(e, id, { name: `${f} ${l}`, email: `${f.toLowerCase()}.${l.toLowerCase()}@${slug(builder)}.example`, phone: `+2547${String(20000000 + ((n * 7919 + i * 104729) % 79999999))}`, title: `Stand builder, ${builder}` }, "Contractor", code));
      }
      log(k, office(later(addMinutes(k.contract!.at, 240), "2026-11-18 09:00")), "exhibitor", `2 contractor passes issued`);
    });
  // they collected their badges at the desk during build-up; no show-day check-in
  for (const d of contractors) d.accredited = true;
  c.delegates.push(...contractors);
  /* stand staff (POR-2): every stand has at least two people; on a paid stand most were through the desk this morning */
  const paidUp = (exhibitorId: string) =>
    c.invoices.filter((i) => i.exhibitorId === exhibitorId && i.state === "Issued" && !i.orderId).every((i) => c.payments.filter((p) => p.invoiceId === i.id).reduce((n, p) => n + p.amount, 0) >= Math.round(i.lines.reduce((n, l) => n + l.qty * l.unit, 0) * (1 + i.vatPct / 100)));
  const roles = ["Stand lead", "Sales", "Product specialist", "Marketing", "Business development"];
  const staff: Delegate[] = [];
  signed.forEach((k, n) => {
    const e = exOf(k);
    const have = c.delegates.filter((d) => d.exhibitorId === e.id && !d.cancelled && d.tierId !== CONTRACTOR_TIER).length;
    const paid = paidUp(e.id);
    for (let i = have; i < 2; i++) {
      const f = c.first[(n * 7 + i * 11 + 3) % c.first.length];
      const l = c.last[(n * 5 + i * 3 + 1) % c.last.length];
      const id = `d_st_${slug(e.name)}_${i + 1}`;
      const code = badgeCodeFor(used, id, "EX");
      used.add(code);
      const d = personDelegate(e, id, { name: `${f} ${l}`, email: `${f.toLowerCase()}.${l.toLowerCase()}@${slug(e.name)}.example`, phone: `+2547${String(30000000 + ((n * 7907 + i * 3571) % 69999999))}`, title: roles[(n + i) % roles.length] }, "Staff", code);
      // most people of a paid stand came through the desk between 07:35 and 09:40; one stand in eight is still empty
      if (paid && n % 8 !== 3 && (i === 0 || n % 3 !== 1)) {
        d.accredited = true;
        d.status = "Checked in";
        d.checkIns = [{ day: 1, at: addMinutes("2026-11-25 07:35", (n * 13 + i * 29) % 125).slice(11) }];
      }
      staff.push(d);
    }
  });
  c.delegates.push(...staff);

  const contractorTier: Tier = {
    id: CONTRACTOR_TIER,
    eventId: signed[0].eventId,
    name: "Contractor pass",
    price: 0,
    currency: "KES",
    cap: 200,
    sold: contractors.length,
    visibility: "invite",
    approval: "organiser",
    entitlements: ["z_exhib"],
    description: "For stand builders and suppliers, registered by the exhibiting company. Opens the hall doors in build-up and dismantling only.",
  };

  /* issues (OPS-4) reported this morning */
  const boothOf = (id: string) => c.bookings.find((k) => k.exhibitorId === id && k.contract && !k.cancelled)?.boothIds[0];
  const issue = (id: string, exhibitorId: string, category: Issue["category"], priority: Issue["priority"], text: string, at: string, by: string, assignee?: string): Issue[] => {
    const boothId = boothOf(exhibitorId);
    if (!boothId) return [];
    const history = [{ at, by, what: `Reported: ${priority.toLowerCase()} priority` }];
    if (assignee) history.push({ at: addMinutes(at, 4), by: "u_staff2", what: `Assigned to ${assignee === "u_staff3" ? "Brian Kiptoo" : "Kevin Oduya"}` });
    return [{ id, eventId: cfg.eventId, exhibitorId, boothId, category, priority, text, at, by, assignee, history }];
  };
  const issues: Issue[] = [
    ...issue("is_1", "ex_upesi-displays", "Power", "Urgent", "The socket on the back wall is dead, so our screens are off.", "2026-11-25 09:05", "exhibitor"),
    ...issue("is_2", "ex_kibanda-coffee", "Cleaning", "Normal", "Coffee spilled across the aisle in front of A4.", "2026-11-25 09:50", "u_staff3", "u_staff3"),
    ...issue("is_3", "ex_mtandao-isp", "Internet", "Normal", "The stand's wired line does not connect.", "2026-11-25 10:12", "exhibitor"),
  ];

  return { branding, orders, requirements, moveIns, deliveries, dismantles: [], issues, contractorTier, staffAdded: staff.length };
}
