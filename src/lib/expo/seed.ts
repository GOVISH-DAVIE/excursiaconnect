/**
 * The Exhibition at the Nairobi Brand & PR Summit 2026, as of show day 1 (25 Nov, 10:30). Built from a fixed
 * table so every stage shows: paid in full, deposit only with the balance overdue, reserved and unpaid, held,
 * an expired hold, a cancellation, applicants, a waitlist and a decline. It runs after the platform seed's own
 * random draws, with its own generator, so nothing else in the seed shifts and server and browser agree.
 */
import { addMinutes, fmtStamp } from "../time";
import type { Delegate, Tier } from "../types";
import { EV_NBS, invoiceNo, invoicesOnSigning, invoiceTotal, exhibitorRef } from "./logic";
import type { BankLine, Booking, Booth, BoothCategory, Exhibitor, ExpoConfig, ExpoMessage, ExpoState, Hall, Invoice, Payment } from "./types";

export const EXPO_CLOCK = "2026-11-25 10:30";

export const expoConfig: ExpoConfig = {
  eventId: EV_NBS,
  rates: { "Shell scheme": 15000, "Space only": 12000 },
  factors: { Standard: 1, Corner: 1.1, Island: 1.25, "Premium location": 1.2 },
  vatPct: 16,
  holdHours: 48,
  depositPct: 50,
  depositDays: 7,
  balanceDue: "2026-11-11",
  fullInvoiceDays: 14,
  cancellation: "Cancel more than 30 days before the show and the deposit is kept; within 30 days the full fee is due.",
  contractVersion: "NBS-EXH v2.1",
  passPer9: 2,
  extraPass: 2500,
  orderDeadline: "2026-11-13",
  lateSurchargePct: 25,
  brandingDeadline: "2026-11-16",
  catalogue: [
    { id: "c_table", group: "Furniture", name: "Table, 120 × 60 cm", unit: "each", price: 2500 },
    { id: "c_chair", group: "Furniture", name: "Chair", unit: "each", price: 800 },
    { id: "c_counter", group: "Furniture", name: "Counter with lockable storage", unit: "each", price: 6500 },
    { id: "c_rack", group: "Furniture", name: "Brochure stand", unit: "each", price: 1800 },
    { id: "c_socket", group: "Power", name: "13 A socket, 2 kW", unit: "each", price: 3500 },
    { id: "c_3phase", group: "Power", name: "Three-phase supply, 10 kW", unit: "each", price: 15000 },
    { id: "c_water", group: "Water", name: "Water point and sink", unit: "each", price: 9000 },
    { id: "c_wifi", group: "Internet", name: "Dedicated Wi-Fi, 20 Mbps", unit: "for the show", price: 6000 },
    { id: "c_wired", group: "Internet", name: "Wired line, 50 Mbps", unit: "for the show", price: 8500 },
    { id: "c_screen", group: "AV", name: "55-inch screen on a stand", unit: "for the show", price: 12000 },
  ],
  bays: [
    { id: "bay1", name: "Loading bay 1, Expo Hall" },
    { id: "bay2", name: "Loading bay 2, Pavilion" },
  ],
  slotMin: 30,
  vehiclesPerSlot: 2,
  buildUp: { from: "2026-11-23 07:00", to: "2026-11-24 22:00" },
  dismantle: { from: "2026-11-27 18:00", to: "2026-11-28 14:00" },
  showDays: [
    { date: "2026-11-25", open: "09:00", close: "18:00" },
    { date: "2026-11-26", open: "09:00", close: "18:00" },
    { date: "2026-11-27", open: "09:00", close: "17:00" },
  ],
  exhibitorOpen: "07:30",
  log: [{ at: "2026-08-01 09:00", by: "u_staff2", what: "Exhibition opened for applications" }],
};

/* ---------- the halls and the plan ---------- */

const halls: Hall[] = [
  {
    id: "h_expo",
    eventId: EV_NBS,
    name: "Expo Hall",
    zoneId: "z_exhib",
    width: 42,
    depth: 24,
    features: [
      { id: "f1", kind: "Entrance", x: 19, y: 23.4, w: 4, d: 0.6 },
      { id: "f2", kind: "Pillar", x: 11, y: 13, w: 1, d: 1 },
      { id: "f3", kind: "Pillar", x: 30, y: 13, w: 1, d: 1 },
      { id: "f4", kind: "Loading door", x: 41.4, y: 8, w: 0.6, d: 4 },
      { id: "f5", kind: "Fire exit", x: 0, y: 13, w: 0.6, d: 2 },
    ],
  },
  {
    id: "h_pav",
    eventId: EV_NBS,
    name: "Pavilion",
    zoneId: "z_exhib",
    width: 24,
    depth: 18,
    features: [
      { id: "f6", kind: "Entrance", x: 10, y: 17.4, w: 4, d: 0.6 },
      { id: "f7", kind: "Loading door", x: 0, y: 6.5, w: 0.6, d: 2 },
      { id: "f8", kind: "Pillar", x: 11.5, y: 16, w: 1, d: 1 },
    ],
  },
];

const booths: Booth[] = [];
const add = (hallId: string, code: string, x: number, y: number, w: number, d: number, type: Booth["type"], category: BoothCategory, extra: Partial<Booth> = {}) =>
  booths.push({ id: `b_${code.toLowerCase()}`, eventId: EV_NBS, hallId, code, x, y, w, d, type, category, openSides: category === "Island" ? 4 : category === "Corner" ? 2 : 1, ...extra });
for (let i = 0; i < 14; i++) add("h_expo", `A${i + 1}`, i * 3, 0, 3, 3, "Shell scheme", i === 0 || i === 13 ? "Corner" : "Standard");
add("h_expo", "I1", 3, 6, 6, 6, "Space only", "Island");
add("h_expo", "I2", 33, 6, 6, 6, "Space only", "Island");
for (let i = 0; i < 6; i++) add("h_expo", `B${i + 1}`, 12 + i * 3, 6, 3, 3, "Shell scheme", i === 0 || i === 5 ? "Corner" : "Standard", i === 2 ? { blocked: "Kept clear for the fire hose reel" } : {});
for (let i = 0; i < 6; i++) add("h_expo", `C${i + 1}`, 12 + i * 3, 9, 3, 3, "Shell scheme", i === 0 || i === 5 ? "Corner" : "Standard");
for (let i = 0; i < 6; i++) add("h_expo", `D${i + 1}`, 3 + i * 3, 15, 3, 3, "Shell scheme", i === 0 || i === 5 ? "Corner" : "Standard");
for (let i = 0; i < 6; i++) add("h_expo", `E${i + 1}`, 3 + i * 3, 18, 3, 3, "Shell scheme", i === 0 || i === 5 ? "Corner" : "Standard");
add("h_expo", "I3", 24, 15, 6, 6, "Space only", "Premium location");
add("h_expo", "F1", 33, 15, 3, 6, "Shell scheme", "Standard");
add("h_expo", "F2", 36, 15, 3, 6, "Shell scheme", "Corner");
add("h_pav", "P1", 0, 0, 9, 6, "Space only", "Premium location", { priceOverride: 0, overrideNote: "Included in the Headline sponsorship" });
add("h_pav", "P2", 12, 0, 6, 6, "Space only", "Premium location", { priceOverride: 300000, overrideNote: "Gold sponsorship rate" });
add("h_pav", "P3", 18, 0, 6, 6, "Space only", "Premium location", { priceOverride: 300000, overrideNote: "Gold sponsorship rate" });
for (let i = 0; i < 6; i++) add("h_pav", `M${i + 1}`, i * 3, 9, 3, 3, "Shell scheme", i === 0 || i === 5 ? "Corner" : "Standard");
for (let i = 0; i < 6; i++) add("h_pav", `M${i + 7}`, i * 3, 12, 3, 3, "Shell scheme", i === 0 || i === 5 ? "Corner" : "Standard", i === 3 ? { blocked: "The organiser's press point" } : {});
add("h_pav", "S1", 18, 9, 3, 3, "Shell scheme", "Standard");
add("h_pav", "S2", 21, 9, 3, 6, "Shell scheme", "Corner");

/* ---------- the companies ---------- */

type Plan = "full" | "deposit" | "unpaid" | "late-full" | "late-unpaid" | "held" | "today" | "expired" | "cancelled" | "package";
type Row = { name: string; sector: string; booths?: string[]; plan?: Plan; status?: Exhibitor["status"]; sponsorId?: string; was?: string; note?: string };

/** company → booths and stage. `was` renames a seeded organisation that would not exhibit at a brand summit. */
const TABLE: Row[] = [
  { name: "KCB Group", sector: "Financial services", booths: ["P1"], plan: "package", sponsorId: "sp1" },
  { name: "Nation Media", sector: "Media", booths: ["P2"], plan: "full", sponsorId: "sp2" },
  { name: "Britam", sector: "Financial services", booths: ["P3"], plan: "full", sponsorId: "sp3" },
  { name: "iHub", sector: "Technology", booths: ["S2"], plan: "full", sponsorId: "sp4" },
  { name: "Strathmore University", sector: "Education", booths: ["S1"], plan: "deposit", sponsorId: "sp5" },
  { name: "Safaricom", sector: "Telecoms", booths: ["I1"], plan: "full" },
  { name: "Equity Bank", sector: "Financial services", booths: ["I2"], plan: "full" },
  { name: "Twiga Foods", sector: "Consumer brand", booths: ["A2"], plan: "full" },
  { name: "M-KOPA", sector: "Technology", booths: ["A3"], plan: "deposit" },
  { name: "Kenya Airways", sector: "Travel", booths: ["A5"], plan: "full" },
  { name: "Jubilee Insurance", sector: "Financial services", booths: ["A6"], plan: "full" },
  { name: "Absa Kenya", sector: "Financial services", booths: ["I3"], plan: "full" },
  { name: "Davis & Shirtliff", sector: "Consumer brand", booths: ["F1"], plan: "full" },
  { name: "Gearbox", sector: "Technology", booths: ["A8"], plan: "deposit" },
  { name: "NCBA", sector: "Financial services", booths: ["A9"], plan: "full" },
  { name: "Sanlam", sector: "Financial services", booths: ["F2"], plan: "full" },
  { name: "Bidco Africa", sector: "Consumer brand", booths: ["A10"], plan: "unpaid" },
  { name: "Kilele Media", sector: "Media", booths: ["B1"], plan: "full", was: "Ministry of ICT" },
  { name: "Nuru Digital", sector: "Digital agency", booths: ["B2"], plan: "full", was: "UNDP Kenya" },
  { name: "Mawimbi Events", sector: "Events and AV", booths: ["B4"], plan: "deposit", was: "Kenya Red Cross" },
  { name: "Tembo Signage", sector: "Print and signage", booths: ["C1"], plan: "full" },
  { name: "Savanna Print Works", sector: "Print and signage", booths: ["C2"], plan: "full" },
  { name: "Pamoja Research", sector: "Research", booths: ["C3"], plan: "full" },
  { name: "Upesi Displays", sector: "Print and signage", booths: ["C4"], plan: "late-full" },
  { name: "Jua Creative", sector: "Creative agency", booths: ["C5"], plan: "late-unpaid" },
  { name: "Bahari Audio Visual", sector: "Events and AV", booths: ["C6"], plan: "full" },
  { name: "Sauti Studios", sector: "Media", booths: ["D1"], plan: "full" },
  { name: "Zawadi Gifting", sector: "Promotional products", booths: ["D2"], plan: "deposit" },
  { name: "Kijani Packaging", sector: "Consumer brand", booths: ["D3"], plan: "full" },
  { name: "Msafiri Travel Media", sector: "Media", booths: ["D4"], plan: "held" },
  { name: "Duka Retail Tech", sector: "Technology", booths: ["D5"], plan: "expired" },
  { name: "Mwanga Lighting", sector: "Events and AV", booths: ["E1"], plan: "full" },
  { name: "Chui Outdoor", sector: "Out-of-home media", booths: ["E2"], plan: "full" },
  { name: "Nyota PR", sector: "PR agency", booths: ["E3"], plan: "cancelled" },
  { name: "Pazia Interiors", sector: "Stand design", booths: ["E4"], plan: "full" },
  { name: "Ari Software", sector: "Martech", booths: ["E5"], plan: "deposit" },
  { name: "Haraka Couriers", sector: "Logistics", booths: ["A1"], plan: "full" },
  { name: "Kibanda Coffee", sector: "Consumer brand", booths: ["A4"], plan: "full" },
  { name: "Imara Media Monitoring", sector: "Research", booths: ["M1"], plan: "full" },
  { name: "Kesho Influencer Network", sector: "Digital agency", booths: ["M2"], plan: "full" },
  { name: "Ufanisi Events Hire", sector: "Events and AV", booths: ["M3"], plan: "deposit" },
  { name: "Baraka Branding", sector: "Creative agency", booths: ["M4"], plan: "today" },
  { name: "Mtandao ISP", sector: "Technology", booths: ["M5"], plan: "full" },
  { name: "Sikio Podcasts", sector: "Media", booths: ["M7"], plan: "full" },
  { name: "Tausi Fashion House", sector: "Consumer brand", booths: ["M8"], plan: "full" },
  { name: "Taa Solar", sector: "Consumer brand", booths: ["M9"], plan: "full" },
  { name: "Rafiki Translation Services", sector: "Language services", status: "Approved", note: "Approved yesterday; has not chosen a booth yet" },
  { name: "Lulu Cosmetics", sector: "Consumer brand", status: "Under review" },
  { name: "Simba Merchandise", sector: "Promotional products", status: "Under review" },
  { name: "Ndege Drone Media", sector: "Media", status: "Applied" },
  { name: "Kito Jewellery", sector: "Consumer brand", status: "Waitlisted", note: "No shell-scheme space left in the Pavilion; next if a booth comes free" },
  { name: "Pesa Point Loans", sector: "Lending", status: "Declined", note: "Outside the summit's brand, media and events focus" },
];

const first = ["Achieng", "Baraka", "Chebet", "Daudi", "Esther", "Fatuma", "Gideon", "Halima", "Imani", "Jabali", "Kerubo", "Lemayian", "Makena", "Nekesa", "Otieno", "Pendo", "Rehema", "Sefu", "Tumaini", "Wairimu"];
const last = ["Mwangi", "Odhiambo", "Kamau", "Njoroge", "Otieno", "Wafula", "Kiprop", "Mutua", "Omondi", "Ndungu", "Karanja", "Maina", "Wambui", "Kimani", "Ochieng", "Barasa"];
const titles = ["Marketing Director", "Head of Brand", "Events Manager", "Managing Director", "Communications Lead", "Partnerships Manager"];

function pseudo(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const stamp = (date: string, h: number, m = 0) => `${date} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const day = (base: string, n: number) => addMinutes(`${base} 00:00`, n * 1440).slice(0, 10);

export function seedExpo(delegates: Delegate[], sponsorTier: Tier): { expo: ExpoState; exhibitorTier: Tier } {
  const rand = pseudo(2611);
  const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const cfg = expoConfig;
  const exhibitors: Exhibitor[] = [];
  const bookings: Booking[] = [];
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const bankLines: BankLine[] = [];
  const outbox: ExpoMessage[] = [];
  let invSeq = 0;
  let invId = 0;
  const msg = (at: string, to: string, subject: string, channel: ExpoMessage["channel"] = "Email") => outbox.push({ id: `xm_s${outbox.length + 1}`, eventId: EV_NBS, at, to, channel, subject, link: `/exhibitor/${to}` });
  const pay = (inv: Invoice, at: string, method: Payment["method"], amount = invoiceTotal(inv)) => {
    const reference = method === "M-Pesa" ? `S${Math.floor(rand() * 36 ** 9).toString(36).toUpperCase().padStart(9, "0")}` : `FT26${between(10000000, 99999999)}`;
    const p: Payment = { id: `pay_s${payments.length + 1}`, eventId: EV_NBS, invoiceId: inv.id, method, reference, amount, at, by: method === "M-Pesa" ? "exhibitor" : "u_fin" };
    // a bank transfer arrives on the statement: reconciled when Finance recorded it
    if (method === "Bank") {
      const line: BankLine = { id: `bl_${bankLines.length + 1}`, eventId: EV_NBS, date: at.slice(0, 10), reference: `${inv.number} ${exhibitors.find((e) => e.id === inv.exhibitorId)?.name.toUpperCase()}`, payer: exhibitors.find((e) => e.id === inv.exhibitorId)!.name, amount, matched: { invoiceId: inv.id, paymentId: p.id, by: "u_fin", at: addMinutes(at, 90) } };
      p.bankLineId = line.id;
      bankLines.push(line);
    }
    payments.push(p);
    return p;
  };

  TABLE.forEach((row, n) => {
    const id = `ex_${slug(row.name)}`;
    const f = first[n % first.length];
    const l = last[(n * 7) % last.length];
    const plan = row.plan;
    // when it applied: the early bookings in August to October, the late ones in November
    const applied = plan === "late-full" ? "2026-11-12" : plan === "late-unpaid" ? "2026-11-17" : plan === "today" ? "2026-11-21" : row.status === "Applied" ? "2026-11-23" : row.status === "Approved" ? "2026-11-19" : row.status ? "2026-11-10" : day("2026-08-10", n * 2 + between(0, 2));
    const decided = row.status === "Approved" || plan === "today" ? "2026-11-24" : day(applied, between(2, 4));
    const status: Exhibitor["status"] = row.status ?? "Approved";
    const ex: Exhibitor = {
      id,
      eventId: EV_NBS,
      ref: exhibitorRef(n + 1),
      name: row.name,
      sector: row.sector,
      country: "Kenya",
      website: `https://${slug(row.name)}.example`,
      description: `${row.name} ${row.sector === "Media" ? "reaches audiences across East Africa in print, broadcast and online" : row.sector === "Financial services" ? "shows its brand and customer campaigns for the year ahead" : `brings its ${row.sector.toLowerCase()} work to brand and communications teams`}.`,
      sponsorId: row.sponsorId,
      contact: { name: `${f} ${l}`, title: titles[n % titles.length], email: `${f.toLowerCase()}.${l.toLowerCase()}@${slug(row.name)}.example`, phone: `+2547${String(between(10000000, 99999999))}` },
      application: { products: `${row.sector} for brand and communications teams`, size: row.booths ? (booths.find((b) => b.code === row.booths![0])?.w === 6 ? "6 × 6 m" : "3 × 3 m") : "3 × 3 m", hallId: row.booths?.[0]?.startsWith("P") || row.booths?.[0]?.startsWith("M") || row.booths?.[0]?.startsWith("S") ? "h_pav" : "h_expo", boothPref: row.booths?.[0], at: stamp(applied, between(8, 17), between(0, 59)) },
      status,
      statusAt: status === "Applied" ? stamp(applied, 11) : status === "Under review" ? stamp(day(applied, 1), 9, 30) : stamp(decided, 10),
      decisionNote: row.note,
      history: [{ at: stamp(applied, 11), by: "public", what: "Applied" }],
    };
    if (status !== "Applied") ex.history.push({ at: stamp(day(applied, 1), 9, 30), by: "u_staff2", what: "Review started" });
    if (status === "Approved" || status === "Waitlisted" || status === "Declined") ex.history.push({ at: stamp(decided, 10), by: "u_staff2", what: `${status}${row.note && status !== "Approved" ? `: ${row.note}` : ""}` });
    exhibitors.push(ex);
    if (status === "Approved") msg(stamp(decided, 10), id, "Approved to exhibit: choose your booth", "Email and SMS");
    if (!row.booths || !plan) return;

    // the booking, from hold to the stage the table names
    const heldAt = plan === "held" ? "2026-11-24 15:00" : plan === "today" ? "2026-11-25 09:10" : plan === "expired" ? "2026-11-20 11:00" : stamp(day(decided, 1), 10);
    const k: Booking = { id: `bk_${n + 1}`, eventId: EV_NBS, exhibitorId: id, boothIds: row.booths.map((c) => `b_${c.toLowerCase()}`), heldAt, heldBy: plan === "today" || plan === "held" ? "u_staff2" : "exhibitor", history: [{ at: heldAt, by: plan === "today" || plan === "held" ? "u_staff2" : "exhibitor", what: `${plan === "today" || plan === "held" ? "Allocated" : "Chose"} ${row.booths.join(", ")}, held for ${cfg.holdHours} hours` }] };
    bookings.push(k);
    if (plan === "held" || plan === "today" || plan === "expired") return;
    const signedAt = addMinutes(heldAt, 60 * between(3, 26));
    k.contract = { version: cfg.contractVersion, name: ex.contact.name, title: ex.contact.title, at: signedAt };
    k.history.push({ at: signedAt, by: "exhibitor", what: `Contract ${cfg.contractVersion} signed by ${ex.contact.name}, ${ex.contact.title}` });
    const issued = invoicesOnSigning(cfg, ex, k, booths.filter((b) => k.boothIds.includes(b.id)), signedAt, () => invoiceNo(++invSeq), () => `inv_${++invId}`);
    invoices.push(...issued);
    for (const v of issued) k.history.push({ at: signedAt, by: "system", what: `${v.number} issued: ${v.kind.toLowerCase()}, due ${fmtStamp(v.due, false)}` });
    msg(signedAt, id, issued.length ? "Contract signed: your invoices are ready" : "Contract signed: your stand is confirmed");
    const [first1, second] = issued;
    const method = (inv: Invoice) => (invoiceTotal(inv) <= 200000 ? "M-Pesa" : "Bank") as Payment["method"];
    if (plan === "full" || plan === "deposit" || plan === "cancelled") {
      const p = pay(first1, addMinutes(signedAt, 60 * 24 * between(1, 5)), method(first1));
      k.history.push({ at: p.at, by: p.by, what: `Deposit received by ${p.method}, ${p.reference}` });
    }
    if (plan === "full" && second) {
      const p = pay(second, stamp(day("2026-11-03", between(0, 7)), between(9, 16), between(0, 59)), method(second));
      k.history.push({ at: p.at, by: p.by, what: `Balance received by ${p.method}, ${p.reference}` });
    }
    if (plan === "late-full") {
      const p = pay(first1, addMinutes(signedAt, 60 * 20), "M-Pesa");
      k.history.push({ at: p.at, by: p.by, what: `Paid in full by M-Pesa, ${p.reference}` });
    }
    if (plan === "deposit" || plan === "unpaid") msg("2026-11-12 09:00", id, `Reminder: ${(second ?? first1).number} was due ${fmtStamp(cfg.balanceDue, false)}`, "Email and SMS");
    if (plan === "cancelled") {
      const at = "2026-11-02 14:20";
      k.cancelled = { at, by: "u_fin", reason: "Withdrew: the budget moved to digital" };
      k.history.push({ at, by: "u_fin", what: "Cancelled: Withdrew: the budget moved to digital" });
      if (second) {
        second.state = "Void";
        second.voidReason = "Booking cancelled";
      }
    }
  });

  // three lines on the statement that match nothing yet (SAL-5)
  const jua = invoices.find((i) => i.exhibitorId === "ex_jua-creative")!;
  const gear = invoices.find((i) => i.exhibitorId === "ex_gearbox" && i.kind === "Balance")!;
  bankLines.push(
    { id: `bl_${bankLines.length + 1}`, eventId: EV_NBS, date: "2026-11-23", reference: "JUA CREATIVE STAND C5", payer: "Jua Creative Ltd", amount: invoiceTotal(jua) },
    { id: `bl_${bankLines.length + 2}`, eventId: EV_NBS, date: "2026-11-24", reference: "GEARBOX EXHIBITION", payer: "Gearbox", amount: invoiceTotal(gear) + 10000 },
    { id: `bl_${bankLines.length + 3}`, eventId: EV_NBS, date: "2026-11-24", reference: "DEPOSIT", payer: "Sample Traders", amount: 50000 },
  );

  /* ---------- the people: seeded Exhibitor and Sponsor delegates become each company's staff ---------- */
  const nbs = delegates.filter((d) => d.eventId === EV_NBS);
  const paid = (name: string) => `ex_${slug(name)}`;
  const queue = (list: string[]) => {
    let i = 0;
    return () => list[i++ % list.length];
  };
  const sponsorIn = queue(["KCB Group", "Nation Media", "Britam", "iHub"]);
  const sponsorOther = queue(["KCB Group", "Nation Media", "Strathmore University", "Britam", "iHub", "KCB Group"]);
  const exhIn = queue(["Safaricom", "Equity Bank", "Twiga Foods", "Kilele Media", "Sanlam", "Pamoja Research"]);
  const exhOther = queue(["Safaricom", "Equity Bank", "Absa Kenya", "M-KOPA", "Gearbox", "Tembo Signage", "Pamoja Research", "Bidco Africa"]);
  const exhPending = queue(["Lulu Cosmetics", "Lulu Cosmetics", "Lulu Cosmetics", "Simba Merchandise", "Simba Merchandise", "Ndege Drone Media"]);
  for (const d of nbs) {
    if (d.category !== "Exhibitor" && d.category !== "Sponsor") continue;
    // a free pass is never "awaiting payment": that seeded status was a slip
    if (d.status === "Awaiting payment") d.status = "Confirmed";
    const company =
      d.category === "Sponsor"
        ? d.status === "Checked in"
          ? sponsorIn()
          : sponsorOther()
        : d.status === "Checked in"
          ? exhIn()
          : d.status === "Pending"
            ? exhPending()
            : exhOther();
    d.organisation = company;
    d.exhibitorId = paid(company);
    if (d.category === "Exhibitor") d.tierId = "t_exhibitor";
  }
  // a seeded organisation renamed in the table keeps no delegate under its old name
  for (const row of TABLE) if (row.was) for (const d of nbs) if (d.organisation === row.was && (d.category === "Exhibitor" || d.category === "Sponsor")) d.organisation = row.name;

  const counted = (t: string) => nbs.filter((d) => d.tierId === t && (d.status === "Confirmed" || d.status === "Checked in")).length;
  sponsorTier.sold = counted("t_sponsor");
  sponsorTier.description = "Complimentary pass for sponsor staff; organiser approval required.";
  const exhibitorTier: Tier = {
    id: "t_exhibitor",
    eventId: EV_NBS,
    name: "Exhibitor staff pass",
    price: 0,
    currency: "KES",
    cap: 300,
    sold: counted("t_exhibitor"),
    visibility: "invite",
    approval: "organiser",
    entitlements: ["all-days", "z_main", "z_exhib", "z_dining"],
    description: "Comes with an exhibitor's stand: two passes per 9 m², more on the stand invoice.",
  };

  return {
    expo: {
      clock: EXPO_CLOCK,
      actingMemberId: "u_staff2",
      configs: { [EV_NBS]: cfg },
      halls,
      booths,
      exhibitors,
      bookings,
      invoices,
      payments,
      bankLines,
      outbox: outbox.sort((a, b) => b.at.localeCompare(a.at)),
      seq: { exhibitor: exhibitors.length, invoice: invSeq },
    },
    exhibitorTier,
  };
}
