/**
 * The Deal Room seed: Bouer's Connected Africa 3.0 (summit 15 to 18 March 2027) as of summit day 2,
 * 10:40. Mission names, the venue and the rubric weights are stand-ins until Bouer confirms them;
 * each is editable in Settings. Its own random sequence, so the platform seed does not shift.
 */
import type { Delegate, EventRecord, Organiser, Room, Tier, Zone } from "../types";
import { DR_TIER, DR_ZONE, EV_CA3, refNo } from "./logic";
import type {
  DealRoomState,
  DrApplication,
  DrAssessment,
  DrConfig,
  DrDecisionEntry,
  DrDocument,
  DrStaff,
  Instrument,
  Mandate,
  ProviderKind,
  Stage,
} from "./types";

function pseudo(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
const rand = pseudo(2027);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => Math.round(a + rand() * (b - a));
/** n items in a shuffled order. A Fisher-Yates shuffle, not sort() with a random comparator, whose call count
 *  differs between JavaScript engines and would give the server and the browser different seeds. */
function pickSome<T>(arr: readonly T[], n: number) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

const CLOCK = "2027-03-16 10:40";

/* ---------- the event on the platform ---------- */

export const bouer: Organiser = { id: "org_bouer", name: "Bouer", kycStatus: "Verified", kraPin: "P052207731K", registrationNo: "PVT-2018-30176", payoutAccount: "Stanbic ****2093", licenceFee: 120000, commissionPct: 5 };

export const ca3: EventRecord = {
  id: EV_CA3,
  slug: "connected-africa-3",
  organiserId: "org_bouer",
  name: "Connected Africa 3.0",
  tagline: "Four days on capital, trade and infrastructure across three investment missions.",
  venue: "Summit venue to be confirmed",
  city: "Nairobi",
  startDate: "2027-03-15",
  endDate: "2027-03-18",
  days: 4,
  state: "Live",
  commissionPct: 5,
  oneOffFee: 0,
  licenceFee: 120000,
  gatewayFeesBorneBy: "Algotech",
  staffCount: 6,
  stations: 4,
  expectedAttendance: 1200,
  brand: { primary: "#1F5F4A", logoText: "CA3" },
  registrationsByDay: [12, 18, 9, 22, 31, 27, 19, 24, 33, 28, 15, 11],
  dealRoom: { enabled: true, addOnPrice: 450000, deskStaff: 3 },
  history: [
    { at: "2026-11-20 10:00", what: "Approved with the Deal Room add-on, KES 450,000, desk staffing 3 per day" },
    { at: "2026-12-01 09:00", what: "Live" },
  ],
};

export const ca3Tiers: Tier[] = [
  { id: "t_ca3_pass", eventId: EV_CA3, name: "Summit pass", price: 25000, currency: "KES", cap: 1000, sold: 0, visibility: "public", approval: "auto", entitlements: ["all-days", "z_ca3_main"], description: "All four days of plenaries and the exhibition." },
  { id: DR_TIER, eventId: EV_CA3, name: "Deal Room participant", price: 0, currency: "KES", cap: 400, sold: 0, visibility: "invite", approval: "organiser", entitlements: ["all-days", "z_ca3_main", DR_ZONE], description: "Issued with a Deal Room approval or verification; not on sale." },
];

export const ca3Zones: Zone[] = [
  { id: "z_ca3_main", eventId: EV_CA3, name: "Plenary hall", capacity: 1200, occupancy: 0 },
  { id: DR_ZONE, eventId: EV_CA3, name: "Deal Room", capacity: 160, occupancy: 0 },
];

export const ca3Rooms: Room[] = [
  { id: "r_dr1", zoneId: DR_ZONE, name: "Boardroom 1", capacity: 6 },
  { id: "r_dr2", zoneId: DR_ZONE, name: "Boardroom 2", capacity: 6 },
  { id: "r_dr3", zoneId: DR_ZONE, name: "Boardroom 3", capacity: 6 },
  { id: "r_dr4", zoneId: DR_ZONE, name: "Boardroom 4", capacity: 6 },
  { id: "r_dr5", zoneId: DR_ZONE, name: "Deal floor A", capacity: 16 },
  { id: "r_dr6", zoneId: DR_ZONE, name: "Deal floor B", capacity: 16 },
  { id: "r_dr7", zoneId: DR_ZONE, name: "Deal floor C", capacity: 16 },
];

/* ---------- rules ---------- */

const MISSIONS = [
  { id: "m1", code: "M1", name: "Energy and infrastructure", description: "Generation, grids, transport and water projects and the companies that build them." },
  { id: "m2", code: "M2", name: "Agriculture and food systems", description: "Production, processing, storage and logistics from farm to market." },
  { id: "m3", code: "M3", name: "Digital and financial services", description: "Payments, lending, connectivity and digital services for businesses and households." },
];
const SECTORS_BY_MISSION: Record<string, string[]> = {
  m1: ["Energy", "Infrastructure", "Water"],
  m2: ["Agribusiness", "Food processing", "Logistics"],
  m3: ["Fintech", "Digital services", "Health"],
};
const SECTORS = ["Energy", "Infrastructure", "Water", "Agribusiness", "Food processing", "Logistics", "Fintech", "Digital services", "Health", "Manufacturing"];
const COUNTRIES = ["Kenya", "Uganda", "Tanzania", "Rwanda", "Ethiopia", "Nigeria", "Ghana", "Côte d'Ivoire", "Senegal", "Zambia", "South Africa"];
const SOURCES = ["Referral", "Partner", "Outreach campaign", "Inbound", "Mission team"];
const KINDS: ProviderKind[] = ["Investor", "Fund", "DFI", "Bank", "Buyer or offtaker", "Distributor", "Project sponsor"];

export const ca3Config: DrConfig = {
  eventId: EV_CA3,
  missions: MISSIONS,
  sources: SOURCES,
  providerKinds: KINDS,
  sectors: SECTORS,
  countries: COUNTRIES,
  rubric: {
    eligibility: [
      { id: "e1", text: "Sector in scope for the mission" },
      { id: "e2", text: "Active in the mission geography" },
      { id: "e3", text: "Legally registered" },
      { id: "e4", text: "Post-revenue, or a bankable project" },
      { id: "e5", text: "Seeking a named instrument" },
    ],
    assessment: [
      { id: "a1", text: "Value proposition", weight: 30 },
      { id: "a2", text: "Feasibility and traction", weight: 30 },
      { id: "a3", text: "Sustainability and scalability, incl. management", weight: 20 },
      { id: "a4", text: "Investment appeal for the stage", weight: 15 },
      { id: "a5", text: "Quality of submission", weight: 5 },
    ],
    readiness: [
      { id: "r1", text: "Bankability" },
      { id: "r2", text: "Technical readiness" },
      { id: "r3", text: "Environmental and social" },
      { id: "r4", text: "Decision-maker named and available" },
      { id: "r5", text: "Documents complete" },
    ],
  },
  matching: [
    { field: "sector", mandatory: true },
    { field: "country", mandatory: true },
    { field: "stage", mandatory: false },
    { field: "ticket", mandatory: true },
    { field: "instrument", mandatory: true },
    { field: "exclusions", mandatory: true },
  ],
  fields: {
    "org.name": "required", "org.regNo": "required", "org.country": "required", "org.sector": "required", "org.website": "advisory",
    "ask.amount": "required", "ask.instrument": "required", "ask.useOfFunds": "required", "ask.stage": "required",
    "traction.revenueBand": "required", "traction.customers": "advisory",
    decisionMaker: "required", mission: "required", source: "required",
    "doc.deck": "required", "doc.financials": "required", "doc.registration": "required", "doc.feasibility": "advisory", "doc.es": "advisory",
    providerKind: "required", "mandate.sectors": "required", "mandate.countries": "required", "mandate.stages": "required", "mandate.ticket": "required",
    "mandate.instruments": "required", "mandate.exclusions": "advisory", "mandate.timeline": "advisory",
  },
  ordering: "criteria",
  rules: {
    appOpen: "2027-01-11",
    appClose: "2027-03-18", // kept open through summit week so the demo can apply at the default clock
    profileDays: 5,
    rfiDays: 7,
    introDays: 5,
    meetingMin: 20,
    bufferMin: 5,
    flaggedMin: 30,
    seekerCap: 5,
    providerCapDay: 6,
    confirmHours: 48,
    lateMin: 10,
    conversionEnd: "2027-09-18",
    retentionMonths: 12,
    dayStart: "09:00",
    dayEnd: "17:30",
  },
  freezeDate: "2027-02-19",
  secondReview: { decline: true, askAbove: 10_000_000 },
  multiplePerOrg: true,
  rooms: {
    r_dr1: { tables: 1, from: "09:00", to: "17:30" },
    r_dr2: { tables: 1, from: "09:00", to: "17:30" },
    r_dr3: { tables: 1, from: "09:00", to: "17:30" },
    r_dr4: { tables: 1, from: "09:00", to: "17:30" },
    r_dr5: { tables: 4, from: "09:00", to: "17:30" },
    r_dr6: { tables: 4, from: "09:00", to: "17:30" },
    r_dr7: { tables: 3, from: "09:00", to: "16:00" },
  },
  log: [
    { at: "2026-12-04 15:20", by: "st_lead", what: "Missions, sources, rubric and matching fields set" },
    { at: "2026-12-11 09:05", by: "st_lead", what: "Rules: 20 + 5 minute meetings, seekers capped at 5, providers at 6 a day" },
  ],
};

export const ca3Staff: DrStaff[] = [
  { id: "st_lead", eventId: EV_CA3, name: "Wairimu Gathoni", email: "wairimu@bouer.example", role: "Lead", canDecide: true, mfa: true, active: true, addedAt: "2026-12-02 10:00" },
  { id: "st_rev1", eventId: EV_CA3, name: "Daniel Ochieng", email: "daniel@bouer.example", role: "Reviewer", canDecide: true, mfa: true, active: true, addedAt: "2026-12-02 10:05" },
  { id: "st_rev2", eventId: EV_CA3, name: "Aisha Mohamed", email: "aisha@bouer.example", role: "Reviewer", canDecide: false, mfa: true, active: true, addedAt: "2026-12-02 10:06" },
  { id: "st_rev3", eventId: EV_CA3, name: "Tom Kiplagat", email: "tom@bouer.example", role: "Reviewer", canDecide: true, mfa: true, active: true, addedAt: "2026-12-02 10:07" },
  { id: "st_rev4", eventId: EV_CA3, name: "Grace Akinyi", email: "grace@bouer.example", role: "Reviewer", canDecide: false, mfa: true, active: true, addedAt: "2027-01-08 09:00" },
  { id: "st_ops1", eventId: EV_CA3, name: "Joy Achola", email: "joy@bouer.example", role: "Operations", canDecide: false, mfa: false, active: true, addedAt: "2027-02-15 09:00" },
  { id: "st_ops2", eventId: EV_CA3, name: "Ben Mutiso", email: "ben@bouer.example", role: "Operations", canDecide: false, mfa: false, active: true, addedAt: "2027-02-15 09:02" },
  { id: "st_ops3", eventId: EV_CA3, name: "Linet Chepkoech", email: "linet@bouer.example", role: "Operations", canDecide: false, mfa: false, active: true, addedAt: "2027-02-15 09:03" },
];

/* ---------- applications ---------- */

const FIRST = ["Achieng", "Kofi", "Amara", "Tendai", "Fatou", "Musa", "Wanjiku", "Chidi", "Zanele", "Yared", "Nia", "Kwame", "Halima", "Ibrahim", "Esi", "Juma", "Ruth", "Sipho", "Adaeze", "Moses", "Grace", "Tariq", "Lindiwe", "Omar"];
const LAST = ["Otieno", "Mensah", "Diallo", "Moyo", "Ndiaye", "Bello", "Kamau", "Okafor", "Dlamini", "Tesfaye", "Mwale", "Asante", "Hassan", "Ouedraogo", "Boateng", "Mushi", "Wekesa", "Nkosi", "Eze", "Kato"];
const PLACES = ["Savanna", "Rift", "Kilima", "Nile", "Sahel", "Baobab", "Tana", "Volta", "Zambezi", "Mara", "Lakeside", "Highland", "Equator", "Kivu", "Turkana", "Limpopo", "Atlas", "Ruvuma"];
const TRADE: Record<string, string[]> = {
  Energy: ["Solar", "Power", "Mini-grids", "Energy"],
  Infrastructure: ["Builders", "Roads", "Housing", "Ports"],
  Water: ["Water", "Irrigation", "Pure Water"],
  Agribusiness: ["Agro", "Farms", "Grain", "Dairy"],
  "Food processing": ["Foods", "Mills", "Processors"],
  Logistics: ["Cold Chain", "Logistics", "Freight"],
  Fintech: ["Pay", "Credit", "Capital Tech"],
  "Digital services": ["Digital", "Connect", "Data"],
  Health: ["Health", "Diagnostics", "Pharma"],
};
const USES: Record<string, string> = {
  Energy: "Build out solar mini-grids for 40 rural trading centres",
  Infrastructure: "Equipment and working capital for two road maintenance contracts",
  Water: "Expand metered water kiosks to three new counties",
  Agribusiness: "Out-grower finance and a second aggregation centre",
  "Food processing": "A new milling line and packaging to double capacity",
  Logistics: "Twelve refrigerated trucks and a cold store at the port",
  Fintech: "Lending book growth and a licence in a second market",
  "Digital services": "Network roll-out and enterprise sales in two markets",
  Health: "Ten diagnostic centres and a regional supply hub",
};
const REVENUE = ["Pre-revenue, contracted offtake", "Under USD 250k", "USD 250k to 1m", "USD 1m to 5m", "USD 5m to 20m"];

const kb = () => between(180, 9800) * 1024;
const date = (d: string, h = 9, m = 0) => `${d} ${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;

function addDaysTo(day: string, n: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function person() {
  const f = pick(FIRST);
  const l = pick(LAST);
  return { name: `${f} ${l}`, email: `${f.toLowerCase()}.${l.toLowerCase()}@mail.example`, phone: `+2547${between(10000000, 99999999)}` };
}

type SeekerState = "Lead" | "Invited" | "Draft" | "Submitted" | "In review" | "Info" | "InfoExpired" | "PendingSecond" | "Declined" | "Waitlisted" | "CondOpen" | "CondMet" | "Ready" | "ReadyReReview" | "Prep" | "NotReady";
type ProviderState = "Lead" | "Invited" | "Draft" | "Submitted" | "In review" | "Info" | "Declined" | "Verified";

const SEEKER_PLAN: [SeekerState, number][] = [
  ["Lead", 4], ["Invited", 4], ["Draft", 3], ["Submitted", 5], ["In review", 6], ["PendingSecond", 1], ["Info", 2], ["InfoExpired", 1],
  ["Declined", 7], ["Waitlisted", 5], ["CondOpen", 4], ["CondMet", 5], ["Ready", 34], ["ReadyReReview", 2], ["Prep", 3], ["NotReady", 1],
];
const PROVIDER_PLAN: [ProviderState, number][] = [["Lead", 2], ["Invited", 2], ["Draft", 2], ["Submitted", 3], ["In review", 4], ["Info", 2], ["Declined", 2], ["Verified", 31]];

const REVIEWERS = ["st_rev1", "st_rev2", "st_rev3", "st_rev4"];
const DECIDER: Record<string, string> = { st_rev1: "st_rev1", st_rev2: "st_lead", st_rev3: "st_rev3", st_rev4: "st_rev1" };

function docs(kinds: DrDocument["kind"][], at: string, id: string): DrDocument[] {
  return kinds.map((kind, i) => ({ id: `${id}_d${i + 1}`, name: `${kind.replace(/\W+/g, "-").toLowerCase()}.pdf`, kind, size: kb(), at, download: kind !== "Financial statements" }));
}

function scores(app: DrApplication, cfg: DrConfig, by: string, at: string, opts: { low?: boolean; readiness?: boolean; readinessPartial?: boolean; failOne?: boolean }): DrAssessment[] {
  const deck = app.documents.find((d) => d.kind === "Pitch deck")?.id;
  const fin = app.documents.find((d) => d.kind === "Financial statements")?.id;
  const reg = app.documents.find((d) => d.kind === "Registration certificate")?.id;
  const out: DrAssessment[] = [];
  let n = 0;
  const id = () => `${app.id}_as${++n}`;
  cfg.rubric.eligibility.forEach((c, i) => out.push({ id: id(), layer: "eligibility", criterion: c.id, pass: !(opts.failOne && i === 3), docId: c.id === "e3" ? reg : undefined, note: c.id === "e3" ? undefined : "From the application form", by, at }));
  cfg.rubric.assessment.forEach((c) => out.push({ id: id(), layer: "assessment", criterion: c.id, score: opts.low ? between(28, 54) : between(58, 92), docId: c.id === "a2" ? fin : deck, by, at }));
  if (opts.readiness || opts.readinessPartial) {
    const later = date(addDaysTo(at.slice(0, 10), between(4, 9)), 14, 10);
    cfg.rubric.readiness.forEach((c, i) => {
      if (opts.readinessPartial && i >= 3) return;
      out.push({ id: id(), layer: "readiness", criterion: c.id, score: between(64, 95), docId: c.id === "r1" ? fin : c.id === "r5" ? deck : undefined, note: c.id === "r1" || c.id === "r5" ? undefined : c.id === "r4" ? "Confirmed by phone with the decision-maker" : "Reviewed in the documents", by, at: later });
    });
  }
  return out;
}

function seekerTeaser(sector: string, country: string, name: string, anonymous: boolean, amount: number) {
  const what: Record<string, string> = {
    Energy: "Solar mini-grid developer",
    Infrastructure: "Road and housing contractor",
    Water: "Metered water service operator",
    Agribusiness: "Out-grower agribusiness",
    "Food processing": "Grain and dairy processor",
    Logistics: "Cold-chain logistics operator",
    Fintech: "SME lending platform",
    "Digital services": "Enterprise connectivity provider",
    Health: "Diagnostics network",
  };
  return {
    title: anonymous ? `${what[sector] ?? sector}, ${country}` : name,
    summary: `${what[sector] ?? sector} in ${country} seeking ${amount >= 1e6 ? `USD ${(amount / 1e6).toFixed(1)}m` : `USD ${Math.round(amount / 1e3)}k`}. Revenue-generating, with a named decision-maker and audited accounts; the raise funds expansion into new markets over 24 months.`,
    anonymous,
  };
}

const MANDATE_BY_KIND: Record<ProviderKind, { min: number; max: number; instruments: Instrument[]; stages: Stage[] }> = {
  Investor: { min: 250_000, max: 3_000_000, instruments: ["Equity", "Mezzanine"], stages: ["Early revenue", "Growth"] },
  Fund: { min: 500_000, max: 8_000_000, instruments: ["Equity", "Mezzanine", "Debt"], stages: ["Growth", "Expansion"] },
  DFI: { min: 5_000_000, max: 60_000_000, instruments: ["Debt", "Equity", "Grant"], stages: ["Bankable project", "Expansion"] },
  Bank: { min: 1_000_000, max: 25_000_000, instruments: ["Debt", "Trade finance"], stages: ["Growth", "Expansion"] },
  "Buyer or offtaker": { min: 100_000, max: 2_000_000, instruments: ["Trade finance", "Other"], stages: ["Early revenue", "Growth"] },
  Distributor: { min: 100_000, max: 1_500_000, instruments: ["Trade finance", "Other"], stages: ["Early revenue", "Growth"] },
  "Project sponsor": { min: 2_000_000, max: 40_000_000, instruments: ["Equity", "Debt"], stages: ["Bankable project", "Expansion"] },
};
const PROVIDER_NAMES = ["Capital Partners", "Growth Fund", "Development Finance", "Bank", "Impact Investors", "Trade Finance", "Infrastructure Fund", "Ventures", "Agri Fund", "Holdings"];

export function seedDealRoom(): { dr: DealRoomState; delegates: Delegate[]; drZoneInside: number } {
  const cfg = ca3Config;
  const apps: DrApplication[] = [];
  let cs = 0;
  let fp = 0;
  const usedNames = new Set<string>();

  /* seekers */
  let i = 0;
  for (const [st, count] of SEEKER_PLAN) {
    for (let k = 0; k < count; k++, i++) {
      const mission = MISSIONS[i % 3].id;
      const sector = pick(SECTORS_BY_MISSION[mission]);
      let name = "";
      do name = `${pick(PLACES)} ${pick(TRADE[sector])} Ltd`; while (usedNames.has(name));
      usedNames.add(name);
      const country = pick(COUNTRIES.slice(0, 9));
      const stage: Stage = sector === "Energy" || sector === "Infrastructure" || sector === "Water" ? pick(["Bankable project", "Growth", "Expansion"] as Stage[]) : pick(["Early revenue", "Growth", "Expansion"] as Stage[]);
      const amount = pick([350_000, 600_000, 900_000, 1_500_000, 2_500_000, 4_000_000, 6_500_000, 12_000_000, 20_000_000]);
      const instrument: Instrument = pick(sector === "Fintech" ? ["Equity", "Debt"] : sector === "Agribusiness" || sector === "Logistics" ? ["Debt", "Trade finance", "Equity"] : ["Equity", "Debt", "Mezzanine"]);
      const id = `dr_cs${(i + 1).toString().padStart(2, "0")}`;
      const contact = person();
      const dm = rand() < 0.5 ? { ...contact, title: "Chief Executive" } : { ...person(), title: pick(["Chief Executive", "Managing Director", "Chief Financial Officer", "Founder"]) };
      const early = ["Lead", "Invited", "Draft"].includes(st);
      const submittedDay =
        st === "Submitted" || st === "In review" || st === "PendingSecond" ? addDaysTo("2027-03-08", between(0, 7)) : st === "Info" ? addDaysTo("2027-03-01", between(0, 6)) : st === "InfoExpired" ? "2027-02-26" : addDaysTo("2027-01-12", between(0, 36));
      const submitted = date(submittedDay, between(8, 17), between(0, 59));
      const assignee = st === "Lead" || st === "Invited" || st === "Draft" || (st === "Submitted" && k < 2) ? undefined : REVIEWERS[i % 4];
      const base: DrApplication = {
        id,
        eventId: EV_CA3,
        type: "seeker",
        mission,
        source: pick(SOURCES),
        owner: pick(["st_lead", "st_rev1", "st_rev3"]),
        assignee,
        org: { name, regNo: `${country.slice(0, 2).toUpperCase()}-${between(2009, 2023)}-${between(10000, 99999)}`, country, sector, founded: String(between(2009, 2022)), website: rand() < 0.7 ? `https://${name.split(" ")[0].toLowerCase()}${name.split(" ")[1].toLowerCase().replace(/\W/g, "")}.example` : undefined },
        contact,
        decisionMaker: dm,
        ask: st === "Lead" || st === "Invited" ? undefined : { amount, currency: "USD", instrument, useOfFunds: USES[sector], stage },
        traction: early ? undefined : { revenueBand: stage === "Bankable project" ? REVENUE[0] : pick(REVENUE.slice(1)), customers: `${between(40, 9000)} customers`, metrics: `${between(15, 140)}% revenue growth last year` },
        documents: early ? [] : docs(sector === "Energy" || sector === "Infrastructure" ? ["Pitch deck", "Financial statements", "Registration certificate", "Feasibility study", "E&S study"] : ["Pitch deck", "Financial statements", "Registration certificate"], submitted, id),
        status: "Draft",
        statusAt: submitted,
        decisions: [],
        recommendations: [],
        assessments: [],
        readiness: "Not ready",
        rfis: [],
        history: [],
      };
      const a = base;
      if (st === "Lead" || st === "Invited") {
        a.status = st;
        a.statusAt = date("2026-12-1" + between(0, 9), 11, 0);
        a.invite = { token: `inv_${id}`, sentAt: st === "Invited" ? date("2027-01-1" + between(1, 9), 9, 30) : undefined };
        a.history.push({ at: a.statusAt, by: a.owner, what: "Imported from the mobilisation pipeline" });
        if (st === "Invited") a.history.push({ at: a.invite.sentAt!, by: a.owner, what: "Invitation sent" });
        apps.push(a);
        continue;
      }
      if (st === "Draft") {
        a.status = "Draft";
        a.statusAt = date("2027-03-1" + between(2, 5), 19, 20);
        a.draftSavedAt = date("2027-03-15", 21, between(0, 59));
        a.documents = a.documents.slice(0, 1);
        a.history.push({ at: a.statusAt, by: "applicant", what: "Started an application" });
        apps.push(a);
        continue;
      }
      a.ref = refNo("seeker", ++cs);
      a.submittedAt = submitted;
      a.status = "Submitted";
      a.history.push({ at: submitted, by: "applicant", what: `Submitted, reference ${a.ref}` });
      if (st === "Submitted") {
        apps.push(a);
        continue;
      }
      const reviewAt = date(addDaysTo(submittedDay, between(1, 3)), 10, between(0, 59));
      a.firstReviewAt = reviewAt;
      a.history.push({ at: reviewAt, by: assignee!, what: "Review started" });
      const reviewer = assignee!;
      if (st === "In review" || st === "PendingSecond") {
        a.status = "In review";
        a.statusAt = reviewAt;
        a.assessments = st === "PendingSecond" ? scores(a, cfg, reviewer, reviewAt, { low: true, failOne: true }) : scores(a, cfg, reviewer, reviewAt, {}).slice(0, between(3, 10));
        if (st === "PendingSecond") {
          const decider = DECIDER[reviewer];
          a.decisions.push({ id: `${id}_dec1`, decision: "Declined", reason: "Eligibility fails: pre-revenue with no contracted offtake.", conditions: [], by: decider, at: date("2027-03-15", 16, 20), needsSecond: true });
          a.history.push({ at: "2027-03-15 16:20", by: decider, what: "Decided Declined, waiting for a second decider" });
        }
        apps.push(a);
        continue;
      }
      if (st === "Info" || st === "InfoExpired") {
        a.status = "Information requested";
        a.statusAt = date(addDaysTo(submittedDay, 2), 15, 0);
        a.assessments = scores(a, cfg, reviewer, reviewAt, {}).slice(0, 6);
        a.rfis.push({ id: `${id}_rfi1`, questions: ["Please send audited accounts for the last two years.", "Who signs for the company on a term sheet?"], docs: ["Financial statements"], by: reviewer, at: a.statusAt });
        a.history.push({ at: a.statusAt, by: reviewer, what: "Information requested: 2 questions" });
        apps.push(a);
        continue;
      }
      // decided
      const decidedDay = addDaysTo(submittedDay, between(6, 14));
      const decidedAt = date(decidedDay, between(10, 17), between(0, 59));
      const decider = DECIDER[reviewer];
      const hadRfi = rand() < 0.35;
      if (hadRfi) {
        const rAt = date(addDaysTo(submittedDay, 2), 11, 0);
        a.rfis.push({ id: `${id}_rfi1`, questions: ["Please confirm the use of funds and the timeline."], docs: [], by: reviewer, at: rAt, response: { text: "Attached the 24-month plan; funds are drawn in two tranches.", docIds: [], at: date(addDaysTo(submittedDay, 4), 9, 15) } });
        a.history.push({ at: rAt, by: reviewer, what: "Information requested: 1 question" }, { at: date(addDaysTo(submittedDay, 4), 9, 15), by: "applicant", what: "Responded to the information request" });
      }
      const low = st === "Declined";
      const qualifies = ["CondOpen", "CondMet", "Ready", "ReadyReReview", "Prep", "NotReady"].includes(st);
      a.assessments = scores(a, cfg, reviewer, reviewAt, { low, failOne: st === "Declined" && rand() < 0.5, readiness: ["CondMet", "Ready", "ReadyReReview"].includes(st), readinessPartial: st === "Prep" || st === "CondOpen" });
      if (reviewer !== decider) {
        const rec = st === "Declined" ? "Declined" : st === "Waitlisted" ? "Waitlisted" : st.startsWith("Cond") ? "Conditional" : "Approved";
        a.recommendations.push({ id: `${id}_rec1`, decision: rec, reason: "Scores and documents support it; see the assessment.", by: reviewer, at: date(addDaysTo(decidedDay, -1), 16, 0) });
        a.history.push({ at: date(addDaysTo(decidedDay, -1), 16, 0), by: reviewer, what: `Recommended: ${rec}` });
      }
      const decision = st === "Declined" ? "Declined" : st === "Waitlisted" ? "Waitlisted" : st.startsWith("Cond") ? "Conditional" : "Approved";
      const entry: DrDecisionEntry = {
        id: `${id}_dec1`,
        decision,
        reason:
          decision === "Declined"
            ? "Below the threshold on feasibility and traction; outside the mission's stage."
            : decision === "Waitlisted"
              ? "Eligible, but the mission's places for this ticket band are taken; reopens if one is released."
              : decision === "Conditional"
                ? "Strong proposition; two documents outstanding."
                : "Meets every eligibility criterion and scores above 70 on assessment.",
        conditions:
          decision === "Conditional"
            ? [
                { id: `${id}_c1`, text: "Audited accounts for 2025", due: addDaysTo(decidedDay, 10), met: st === "CondMet" ? { by: reviewer, at: date(addDaysTo(decidedDay, 6), 11, 0) } : undefined },
                { id: `${id}_c2`, text: "Environmental and social screening summary", due: addDaysTo(decidedDay, 14), met: st === "CondMet" ? { by: reviewer, at: date(addDaysTo(decidedDay, 8), 11, 0) } : undefined },
              ]
            : [],
        by: decider,
        at: decidedAt,
        needsSecond: decision === "Declined" || amount > cfg.secondReview.askAbove ? true : undefined,
        second: decision === "Declined" || amount > cfg.secondReview.askAbove ? { by: decider === "st_lead" ? "st_rev3" : "st_lead", at: date(decidedDay, 18, 5) } : undefined,
      };
      a.decisions.push(entry);
      a.history.push({ at: decidedAt, by: decider, what: `Decided: ${decision}` });
      if (entry.second) a.history.push({ at: entry.second.at, by: entry.second.by, what: `Second decider confirmed: ${decision}` });
      a.status = "Decided";
      a.statusAt = entry.second?.at ?? decidedAt;
      if (qualifies) {
        const anonymous = rand() < 0.4;
        a.teaser = seekerTeaser(sector, country, name, anonymous, amount);
        if (st !== "NotReady") {
          a.profileCompletedAt = date(addDaysTo(decidedDay, between(1, 4)), 12, 0);
          a.history.push({ at: a.profileCompletedAt, by: "applicant", what: "Matching profile completed" });
        }
        if (["CondMet", "Ready", "ReadyReReview", "Prep"].includes(st)) {
          a.decisionMaker = { ...a.decisionMaker, confirmed: { by: reviewer, at: date(addDaysTo(decidedDay, 3), 10, 0) } };
        }
        if (["CondMet", "Ready", "ReadyReReview"].includes(st)) {
          a.readiness = "Deal Room Ready";
          a.readinessAt = date(addDaysTo(decidedDay, between(8, 12)), 15, 30);
          a.teaser.approved = { by: reviewer, at: a.readinessAt };
          a.history.push({ at: a.readinessAt, by: reviewer, what: "Readiness: Deal Room Ready" });
        } else if (st === "Prep" || st === "CondOpen") {
          a.readiness = "In preparation";
          a.readinessAt = date(addDaysTo(decidedDay, 6), 15, 30);
        }
        if (st === "ReadyReReview") {
          a.reReview = { fields: ["ask.amount"], at: "2027-03-15 20:10" };
          a.ask = { ...a.ask!, amount: Math.round(a.ask!.amount * 1.6) };
          a.history.push({ at: "2027-03-15 20:10", by: "applicant", what: "Changed ask.amount; sent for re-review" });
        }
      }
      apps.push(a);
    }
  }

  /* providers */
  let j = 0;
  for (const [st, count] of PROVIDER_PLAN) {
    for (let k = 0; k < count; k++, j++) {
      const kind = KINDS[j % KINDS.length];
      const m = MANDATE_BY_KIND[kind];
      let name = "";
      do name = `${pick(PLACES)} ${kind === "Bank" ? "Bank" : kind === "DFI" ? "Development Finance" : pick(PROVIDER_NAMES)}`; while (usedNames.has(name));
      usedNames.add(name);
      const id = `dr_fp${(j + 1).toString().padStart(2, "0")}`;
      const contact = person();
      const mission = MISSIONS[j % 3].id;
      const sectors = [...new Set([...SECTORS_BY_MISSION[mission], ...pickSome(SECTORS, 2)])].slice(0, between(3, 5));
      const mandate: Mandate = {
        sectors,
        countries: pickSome(COUNTRIES, between(5, 9)),
        stages: m.stages,
        ticketMin: m.min,
        ticketMax: m.max,
        currency: "USD",
        instruments: m.instruments,
        exclusions: rand() < 0.3 ? [pick(["coal", "tobacco", "weapons", "gambling"])] : [],
        timeline: pick(["4 to 6 weeks", "2 to 3 months", "3 to 6 months"]),
      };
      const early = ["Lead", "Invited", "Draft"].includes(st);
      const submittedDay = st === "Submitted" || st === "In review" ? addDaysTo("2027-03-07", between(0, 8)) : st === "Info" ? addDaysTo("2027-03-03", between(0, 5)) : addDaysTo("2027-01-12", between(0, 30));
      const submitted = date(submittedDay, between(8, 17), between(0, 59));
      const assignee = early || (st === "Submitted" && k < 1) ? undefined : REVIEWERS[(j + 1) % 4];
      const a: DrApplication = {
        id,
        eventId: EV_CA3,
        type: "provider",
        providerKind: kind,
        mission,
        source: pick(SOURCES),
        owner: pick(["st_lead", "st_rev1", "st_rev3"]),
        assignee,
        org: { name, regNo: `REG-${between(1995, 2021)}-${between(1000, 9999)}`, country: pick(["Kenya", "Nigeria", "South Africa", "Côte d'Ivoire", "Ghana", "Rwanda"]), sector: "Finance", website: `https://${name.split(" ")[0].toLowerCase()}${name.split(" ")[1].toLowerCase()}.example` },
        contact,
        decisionMaker: { ...person(), title: pick(["Managing Partner", "Investment Director", "Head of Corporate Banking", "Chief Investment Officer", "Head of Sourcing"]) },
        mandate: early && st !== "Draft" ? undefined : mandate,
        caps: { perDay: between(4, 8), perEvent: between(12, 24) },
        documents: [],
        status: "Draft",
        statusAt: submitted,
        decisions: [],
        recommendations: [],
        assessments: [],
        readiness: "Not ready",
        rfis: [],
        history: [],
      };
      if (st === "Lead" || st === "Invited") {
        a.status = st;
        a.statusAt = date("2026-12-1" + between(0, 9), 11, 30);
        a.invite = { token: `inv_${id}`, sentAt: st === "Invited" ? date("2027-01-1" + between(1, 9), 9, 45) : undefined };
        a.history.push({ at: a.statusAt, by: a.owner, what: "Imported from the mobilisation pipeline" });
        apps.push(a);
        continue;
      }
      if (st === "Draft") {
        a.statusAt = date("2027-03-14", 18, 0);
        a.draftSavedAt = date("2027-03-15", 22, 10);
        a.history.push({ at: a.statusAt, by: "applicant", what: "Started an application" });
        apps.push(a);
        continue;
      }
      a.ref = refNo("provider", ++fp);
      a.submittedAt = submitted;
      a.status = "Submitted";
      a.history.push({ at: submitted, by: "applicant", what: `Submitted, reference ${a.ref}` });
      const kycDocs = docs(["Registration certificate", "Beneficial owners", "Signatory ID"], date(addDaysTo(submittedDay, 1), 10, 0), id);
      const full = st === "Verified" || st === "Declined";
      const reviewer = assignee ?? "st_rev1";
      const checkAt = date(addDaysTo(submittedDay, between(2, 5)), 14, 0);
      a.documents = full ? kycDocs : st === "In review" || st === "Info" ? kycDocs.slice(0, 2) : [];
      a.verification = {
        state: "Verification pending",
        kyc: Object.fromEntries(a.documents.map((d, n) => [["Registration", "Beneficial owners", "Signatory ID"][n], { docId: d.id, checked: full || n === 0 ? { by: reviewer, at: checkAt } : undefined }])),
        nda: full || (st === "In review" && k % 2 === 0) ? { version: "CA3-NDA v1.2", name: a.decisionMaker.name, title: a.decisionMaker.title, at: date(addDaysTo(submittedDay, 1), 16, 0) } : undefined,
        sanctions: full ? { result: st === "Declined" ? "Match found" : "Clear", note: st === "Declined" ? "Name match on a consolidated sanctions list; not cleared." : "No match", by: reviewer, at: checkAt } : undefined,
      };
      if (st === "Submitted") {
        apps.push(a);
        continue;
      }
      a.status = "In review";
      a.statusAt = date(addDaysTo(submittedDay, 1), 11, 0);
      a.firstReviewAt = a.statusAt;
      a.history.push({ at: a.statusAt, by: reviewer, what: "Review started" });
      if (st === "Info") {
        a.status = "Information requested";
        a.statusAt = date(addDaysTo(submittedDay, 2), 15, 0);
        a.rfis.push({ id: `${id}_rfi1`, questions: ["Please upload the signatory's ID.", "Confirm the ticket range for trade finance."], docs: ["Signatory ID"], by: reviewer, at: a.statusAt });
        a.history.push({ at: a.statusAt, by: reviewer, what: "Information requested: 2 questions" });
      }
      if (full) {
        if (st === "Verified") a.decisionMaker = { ...a.decisionMaker, confirmed: { by: reviewer, at: checkAt } };
        const decider = DECIDER[reviewer];
        const dAt = date(addDaysTo(submittedDay, between(5, 10)), 12, 0);
        a.verification.state = st === "Verified" ? "Verified" : "Declined";
        a.verification.decided = { by: decider, at: dAt, reason: st === "Verified" ? "Mandate reviewed, KYC checked, NDA signed, sanctions clear." : "Sanctions screening returned a match that was not cleared." };
        a.status = "Decided";
        a.statusAt = dAt;
        a.history.push({ at: checkAt, by: reviewer, what: "KYC checked; sanctions screening entered" }, { at: dAt, by: decider, what: `Verification: ${a.verification.state}` });
      }
      apps.push(a);
    }
  }

  // one duplicate pair for the merge demo: the same seeker applied twice
  const dupOf = apps.find((a) => a.id === "dr_cs13")!;
  apps.push({ ...structuredClone(dupOf), id: "dr_cs99", ref: refNo("seeker", ++cs), assignee: undefined, submittedAt: "2027-03-15 21:40", status: "Submitted", statusAt: "2027-03-15 21:40", history: [{ at: "2027-03-15 21:40", by: "applicant", what: "Submitted" }], assessments: [] });

  /* badges for everyone qualified, most accredited at the desk on day 1 or 2 */
  const delegates: Delegate[] = [];
  let inside = 0;
  for (const a of apps) {
    const ok = a.type === "provider" ? a.verification?.state === "Verified" : ["Approved", "Conditional"].includes(a.decisions.filter((d) => !d.needsSecond || d.second).pop()?.decision ?? "");
    if (!ok) continue;
    const accredited = rand() < 0.78;
    const day = rand() < 0.6 ? 1 : 2;
    const d: Delegate = {
      id: `d_dr_${a.id}`,
      eventId: EV_CA3,
      name: a.contact.name,
      email: a.contact.email,
      phone: a.contact.phone,
      organisation: a.org.name,
      jobTitle: a.type === "seeker" ? "Capital seeker" : a.providerKind ?? "Finance provider",
      country: a.org.country,
      category: "Deal Room",
      tierId: DR_TIER,
      status: accredited ? "Checked in" : "Confirmed",
      accredited,
      checkIns: accredited ? [{ day, at: `0${between(8, 9)}:${between(10, 55)}` }] : [],
      zoneLog: [],
      sessions: [],
      bookable: false,
      badgeCode: `EXC-DR-${(1000 + j * 7 + delegates.length * 53) % 9000 + 1000}`,
    };
    if (accredited && rand() < 0.35) {
      d.zoneLog = [{ zoneId: DR_ZONE, direction: "in", at: `10:${between(10, 38)}`, verdict: "allow" }];
      inside++;
    }
    a.delegateId = d.id;
    delegates.push(d);
  }

  const dr: DealRoomState = {
    clock: CLOCK,
    actingStaffId: "st_lead",
    configs: { [EV_CA3]: cfg },
    staff: ca3Staff,
    apps,
    matches: [],
    consents: [],
    access: [],
    meetings: [],
    opportunities: [],
    exceptions: [
      { id: "ex_1", eventId: EV_CA3, at: "2027-02-24 12:15", by: "st_lead", kind: "Change after freeze", reason: "Added 'Deal floor C' after the venue confirmed a third floor room", ref: "Settings" },
    ],
    grants: [],
    outbox: [
      { id: "msg_s1", eventId: EV_CA3, at: "2027-03-16 08:00", to: "st_lead", channel: "Email", subject: "Daily Deal Room report, Mon 15 Mar", link: "/dealroom/reports", status: "Delivered" },
      { id: "msg_s2", eventId: EV_CA3, at: "2027-03-15 21:40", to: "dr_cs99", channel: "Email and SMS", subject: "Application received, reference " + refNo("seeker", cs), link: "/dr/dr_cs99", status: "Delivered" },
      { id: "msg_s3", eventId: EV_CA3, at: "2027-03-15 16:20", to: "st_lead", channel: "Email", subject: "A decision waits for a second decider", link: "/dealroom/applications", status: "Delivered" },
      { id: "msg_s4", eventId: EV_CA3, at: "2027-03-12 09:00", to: "dr_cs22", channel: "SMS", subject: "Reminder: information requested on your application", link: "/dr/dr_cs22", status: "Failed" },
    ],
    queue: [],
    conflicts: [],
    incidents: [],
    offline: false,
    seq: { cs, fp },
    adminLog: [
      { at: "2026-11-20 10:00", by: "admin", what: "Deal Room enabled for Connected Africa 3.0: add-on KES 450,000, desk staffing 3" },
      ...ca3Staff.map((s) => ({ at: s.addedAt, by: "admin", what: `Account created: ${s.name}, ${s.role}${s.canDecide && s.role !== "Lead" ? ", may decide" : ""}${s.mfa ? ", MFA on" : ""}` })).reverse(),
    ],
  };
  return { dr, delegates, drZoneInside: inside };
}
