/**
 * The Deal Room seed: Bouer's Connected Africa 3.0 (summit 15 to 18 February 2027) as of summit day 2,
 * 10:40. Mission names, the venue and the rubric weights are stand-ins until Bouer confirms them;
 * each is editable in Settings. Its own random sequence, so the platform seed does not shift.
 */
import type { Delegate, EventRecord, Organiser, Room, Session, Tier, Zone } from "../types";
import { addMinutes } from "../time";
import { DR_TIER, DR_ZONE, EV_CA3, candidates, matchable, refNo, slotProblems, slotTimes } from "./logic";
import { draftBrief } from "./meetings";
import { acceptProblems, invitable, sessionProblems } from "./sessions";
import type {
  DealRoomState,
  DrAccess,
  DrApplication,
  DrConsent,
  DrMatch,
  DrMeeting,
  DrOpportunity,
  DrQueued,
  DrScripted,
  DrScriptStep,
  DrAssessment,
  DrConfig,
  DrDecisionEntry,
  DrDocument,
  DrSession,
  DrStaff,
  Instrument,
  Mandate,
  MeetingOutcome,
  ProviderKind,
  SessionFormat,
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

const CLOCK = "2027-02-16 10:40";

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
  startDate: "2027-02-15",
  endDate: "2027-02-18",
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
    { at: "2026-10-23 10:00", what: "Approved with the Deal Room add-on, KES 450,000, desk staffing 3 per day" },
    { at: "2026-11-03 09:00", what: "Live" },
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
  { id: "r_ca3_ws", zoneId: "z_ca3_main", name: "Workshop room", capacity: 60 },
  { id: "r_dr1", zoneId: DR_ZONE, name: "Boardroom 1", capacity: 6 },
  { id: "r_dr2", zoneId: DR_ZONE, name: "Boardroom 2", capacity: 6 },
  { id: "r_dr3", zoneId: DR_ZONE, name: "Boardroom 3", capacity: 6 },
  { id: "r_dr4", zoneId: DR_ZONE, name: "Boardroom 4", capacity: 6 },
  { id: "r_dr5", zoneId: DR_ZONE, name: "Deal floor A", capacity: 16 },
  { id: "r_dr6", zoneId: DR_ZONE, name: "Deal floor B", capacity: 16 },
  { id: "r_dr7", zoneId: DR_ZONE, name: "Deal floor C", capacity: 16 },
  // the paper's presentation area and roundtable room: sessions only, no meeting tables
  { id: "r_dr8", zoneId: DR_ZONE, name: "Presentation area", capacity: 60 },
  { id: "r_dr9", zoneId: DR_ZONE, name: "Roundtable room", capacity: 20 },
];

/** A little of the summit programme, so a Deal Room slot can clash with a session a participant enrolled in. */
export const ca3Sessions: Session[] = [
  { id: "s_ca3_1", eventId: EV_CA3, day: 1, start: "09:00", end: "10:30", title: "Opening plenary: capital for a connected Africa", kind: "plenary", speakers: [], enrolled: 0, attended: 0, status: "ended", walkIns: true },
  { id: "s_ca3_2", eventId: EV_CA3, day: 2, start: "11:30", end: "12:30", title: "Workshop: preparing for investor diligence", roomId: "r_ca3_ws", kind: "breakout", speakers: [], capacity: 60, enrolled: 0, attended: 0, status: "scheduled", walkIns: false },
  { id: "s_ca3_3", eventId: EV_CA3, day: 3, start: "14:00", end: "15:00", title: "Workshop: blended finance structures", roomId: "r_ca3_ws", kind: "breakout", speakers: [], capacity: 60, enrolled: 0, attended: 0, status: "scheduled", walkIns: false },
];

/* ---------- rules ---------- */

/* the decision paper's three missions, six strategic tracks and 19-sector taxonomy */
const MISSIONS = [
  { id: "m1", code: "M1", name: "State capability and public service delivery", description: "Public institutions and service-delivery priorities matched with the capabilities, capital and partners that improve public outcomes." },
  { id: "m2", code: "M2", name: "Enterprise growth, fintech and capital", description: "Enterprises and innovators securing the capital, customers, technology partnerships and markets they need to grow." },
  { id: "m3", code: "M3", name: "Digital trade and market integration", description: "Commercial and infrastructure connections that let businesses and digital services operate across markets and borders." },
];
const TRACKS = [
  { id: "t1", code: "T1", name: "Transformation that works for people", missionId: "m1", description: "Public-service transformation priorities turned into commercial, investment and implementation opportunities." },
  { id: "t2", code: "T2", name: "Digital public infrastructure and trusted government", missionId: "m1", description: "Digital identity, payments, data exchange, GovTech and cybersecurity for trusted public services." },
  { id: "t3", code: "T3", name: "AI, software and enterprise innovation", missionId: "m2", description: "Innovation into enterprise adoption, commercial relationships and investable opportunities." },
  { id: "t4", code: "T4", name: "Talent, jobs and enterprise growth", missionId: "m2", description: "Enterprise demand, skills development and workforce opportunity connected." },
  { id: "t5", code: "T5", name: "Interoperable infrastructure", missionId: "m3", description: "Infrastructure and partnerships that let digital systems, markets and services work together." },
  { id: "t6", code: "T6", name: "Digital trade and market access", missionId: "m3", description: "Regional market access through commercial partners and digital trade infrastructure." },
];
const PAPER_SECTORS = [
  "Data Centres & Cloud Infrastructure", "Telecommunications & Connectivity", "Artificial Intelligence & Deep Technology", "Cybersecurity & Digital Trust", "Fintech & Digital Banking",
  "E-commerce & Digital Trade", "Logistics & Mobility Technology", "Enterprise Technology & SaaS", "Agritech & Food Technology", "Health tech & Biotechnology",
  "Energy Technology & Climate Innovation", "Smart Cities & Urban Technology", "Edtech & Future of Work", "Aerospace, Satellite & Space Technology", "Advanced Manufacturing & Industry 4.0",
  "Creative Economy & Digital Media", "Digital Public Infrastructure & Gov Tech", "Mining, Natural Resources & Industrial Technology", "Tourism Tech & Hospitality Innovation",
];
// each sector sits on one track, and so in one mission
const TRACK_OF_SECTOR: Record<string, string> = {
  "Smart Cities & Urban Technology": "t1", "Health tech & Biotechnology": "t1", "Edtech & Future of Work": "t1",
  "Digital Public Infrastructure & Gov Tech": "t2", "Cybersecurity & Digital Trust": "t2",
  "Artificial Intelligence & Deep Technology": "t3", "Enterprise Technology & SaaS": "t3", "Fintech & Digital Banking": "t3", "Energy Technology & Climate Innovation": "t3",
  "Agritech & Food Technology": "t4", "Advanced Manufacturing & Industry 4.0": "t4", "Creative Economy & Digital Media": "t4", "Mining, Natural Resources & Industrial Technology": "t4",
  "Data Centres & Cloud Infrastructure": "t5", "Telecommunications & Connectivity": "t5", "Aerospace, Satellite & Space Technology": "t5",
  "Logistics & Mobility Technology": "t6", "E-commerce & Digital Trade": "t6", "Tourism Tech & Hospitality Innovation": "t6",
};
// the draws below still run on the earlier sector list, so the demo keeps its shape; each is then relabelled
const SECTOR_MAP: Record<string, string> = {
  Energy: "Energy Technology & Climate Innovation", Infrastructure: "Data Centres & Cloud Infrastructure", Water: "Smart Cities & Urban Technology",
  Agribusiness: "Agritech & Food Technology", "Food processing": "Agritech & Food Technology", Logistics: "Logistics & Mobility Technology",
  Fintech: "Fintech & Digital Banking", "Digital services": "Digital Public Infrastructure & Gov Tech", Health: "Health tech & Biotechnology", Manufacturing: "Advanced Manufacturing & Industry 4.0",
};
const trackOf = (sector: string) => TRACKS.find((t) => t.id === TRACK_OF_SECTOR[sector])!;
const SECTORS_BY_MISSION: Record<string, string[]> = {
  m1: ["Energy", "Infrastructure", "Water"],
  m2: ["Agribusiness", "Food processing", "Logistics"],
  m3: ["Fintech", "Digital services", "Health"],
};
const SECTORS = ["Energy", "Infrastructure", "Water", "Agribusiness", "Food processing", "Logistics", "Fintech", "Digital services", "Health", "Manufacturing"];
const COUNTRIES = ["Kenya", "Uganda", "Tanzania", "Rwanda", "Ethiopia", "Nigeria", "Ghana", "Côte d'Ivoire", "Senegal", "Zambia", "South Africa"];
const SOURCES = ["Referral", "Partner", "Outreach campaign", "Inbound", "Mission team"];
// seven kinds in turn, as before; venture capital is then split into angel, venture and private equity
const KINDS: ProviderKind[] = ["Venture capital", "Fund", "DFI", "Bank", "Corporate buyer", "Distributor or channel partner", "Ecosystem partner"];
const ALL_KINDS: ProviderKind[] = ["Angel investor", "Venture capital", "Private equity", "Fund", "DFI", "Bank", "Corporate buyer", "Distributor or channel partner", "Public institution", "Ecosystem partner", "Technology partner", "Regional operator"];

export const ca3Config: DrConfig = {
  eventId: EV_CA3,
  missions: MISSIONS,
  tracks: TRACKS,
  sources: SOURCES,
  providerKinds: ALL_KINDS,
  sectors: PAPER_SECTORS,
  countries: COUNTRIES,
  rubric: {
    eligibility: [
      { id: "e1", text: "Sector in scope for the mission" },
      { id: "e2", text: "Active in the mission geography" },
      { id: "e3", text: "Legally registered" },
      { id: "e4", text: "Post-revenue, or a bankable project" },
      { id: "e5", text: "Asking for a named transaction pathway" },
    ],
    assessment: [
      // the paper's qualification dimensions; numeric thresholds are Bouer's to set
      { id: "a1", text: "Relevance: fit with the missions and a transaction pathway", weight: 30 },
      { id: "a2", text: "Credibility: identity, track record, references or sponsor", weight: 30 },
      { id: "a3", text: "Readiness: a complete profile, a clear ask and its stage", weight: 20 },
      { id: "a4", text: "Counterparty fit: a plausible investor, buyer or partner for the ask", weight: 15 },
      { id: "a5", text: "Consent and confidentiality: permission to circulate, document access", weight: 5 },
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
    appOpen: "2026-12-15", // the onboarding launch in the decision paper
    appClose: "2027-02-18", // kept open through summit week so the demo can apply at the default clock
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
    conversionEnd: "2027-08-21",
    retentionMonths: 12,
    dayStart: "09:00",
    dayEnd: "17:30",
  },
  freezeDate: "2027-01-22",
  secondReview: { decline: true, askAbove: 10_000_000 },
  seekerFee: { amount: 250, currency: "USD", reminderDays: 3 }, // asked of a capital seeker on approval, by payment link
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
  sessionRooms: ["r_dr8", "r_dr9"],
  log: [
    { at: "2026-11-06 15:20", by: "st_lead", what: "Missions, sources, rubric and matching fields set" },
    { at: "2026-11-13 09:05", by: "st_lead", what: "Rules: 20 + 5 minute meetings, seekers capped at 5, providers at 6 a day" },
  ],
};

export const ca3Staff: DrStaff[] = [
  { id: "st_lead", eventId: EV_CA3, name: "Wairimu Gathoni", email: "wairimu@bouer.example", org: "Bouer", role: "Lead", canDecide: true, mfa: true, active: true, addedAt: "2026-11-04 10:00" },
  { id: "st_rev1", eventId: EV_CA3, name: "Daniel Ochieng", email: "daniel@bouer.example", org: "Bouer", role: "Reviewer", canDecide: true, mfa: true, active: true, addedAt: "2026-11-04 10:05" },
  { id: "st_rev2", eventId: EV_CA3, name: "Aisha Mohamed", email: "aisha@bouer.example", org: "Bouer", role: "Reviewer", canDecide: false, mfa: true, active: true, addedAt: "2026-11-04 10:06" },
  { id: "st_rev3", eventId: EV_CA3, name: "Tom Kiplagat", email: "tom@bouer.example", org: "Bouer", role: "Reviewer", canDecide: true, mfa: true, active: true, addedAt: "2026-11-04 10:07" },
  { id: "st_rev4", eventId: EV_CA3, name: "Grace Akinyi", email: "grace@bouer.example", org: "Bouer", role: "Reviewer", canDecide: false, mfa: true, active: true, addedAt: "2026-12-11 09:00" },
  { id: "st_ops1", eventId: EV_CA3, name: "Joy Achola", email: "joy@excursia.example", org: "Excursia Connect", role: "Operations", canDecide: false, mfa: false, active: true, addedAt: "2027-01-18 09:00" },
  { id: "st_ops2", eventId: EV_CA3, name: "Ben Mutiso", email: "ben@excursia.example", org: "Excursia Connect", role: "Operations", canDecide: false, mfa: false, active: true, addedAt: "2027-01-18 09:02" },
  { id: "st_ops3", eventId: EV_CA3, name: "Linet Chepkoech", email: "linet@excursia.example", org: "Excursia Connect", role: "Operations", canDecide: false, mfa: false, active: true, addedAt: "2027-01-18 09:03" },
  // Excursia coordinates matching and meetings; Momentum owns the project and oversees, read-only (the paper, section 9)
  { id: "st_coord1", eventId: EV_CA3, name: "Achieng Otieno", email: "achieng@excursia.example", org: "Excursia Connect", role: "Coordinator", canDecide: false, mfa: true, active: true, addedAt: "2026-12-07 09:00" },
  { id: "st_mom1", eventId: EV_CA3, name: "David Kariuki", email: "david@momentum.example", org: "Momentum", role: "Oversight", canDecide: false, mfa: true, active: true, addedAt: "2026-12-07 09:30" },
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

/** A person at an organisation; the email carries the organisation's domain, so no two records share one by chance. */
function person(org: string) {
  const f = pick(FIRST);
  const l = pick(LAST);
  const domain = org.toLowerCase().replace(/\b(ltd|limited)\b/g, "").replace(/[^a-z]+/g, "");
  return { name: `${f} ${l}`, email: `${f.toLowerCase()}.${l.toLowerCase()}@${domain}.example`, phone: `+2547${between(10000000, 99999999)}` };
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
  "Angel investor": { min: 50_000, max: 500_000, instruments: ["Equity", "Strategic partnerships"], stages: ["Early revenue", "Growth"] },
  "Venture capital": { min: 250_000, max: 3_000_000, instruments: ["Equity", "Strategic partnerships"], stages: ["Early revenue", "Growth"] },
  "Private equity": { min: 2_000_000, max: 20_000_000, instruments: ["Equity", "Debt and credit"], stages: ["Growth", "Expansion"] },
  Fund: { min: 500_000, max: 8_000_000, instruments: ["Equity", "Debt and credit", "Development and blended finance"], stages: ["Growth", "Expansion"] },
  DFI: { min: 5_000_000, max: 60_000_000, instruments: ["Debt and credit", "Equity", "Development and blended finance"], stages: ["Bankable project", "Expansion"] },
  Bank: { min: 1_000_000, max: 25_000_000, instruments: ["Debt and credit"], stages: ["Growth", "Expansion"] },
  "Corporate buyer": { min: 100_000, max: 2_000_000, instruments: ["Procurement and contracts", "Pilots and deployment"], stages: ["Early revenue", "Growth"] },
  "Distributor or channel partner": { min: 100_000, max: 1_500_000, instruments: ["Market access", "Procurement and contracts"], stages: ["Early revenue", "Growth"] },
  "Public institution": { min: 250_000, max: 10_000_000, instruments: ["Procurement and contracts", "Pilots and deployment", "Project development"], stages: ["Early revenue", "Growth", "Bankable project"] },
  "Ecosystem partner": { min: 50_000, max: 1_000_000, instruments: ["Market access", "Project development"], stages: ["Early revenue", "Growth"] },
  "Technology partner": { min: 100_000, max: 2_000_000, instruments: ["Strategic partnerships", "Pilots and deployment"], stages: ["Early revenue", "Growth"] },
  "Regional operator": { min: 250_000, max: 5_000_000, instruments: ["Market access", "Strategic partnerships"], stages: ["Growth", "Expansion"] },
};
const NAME_BY_KIND: Record<ProviderKind, string[]> = {
  "Angel investor": ["Angel Network", "Angels", "Angel Syndicate"],
  "Venture capital": ["Ventures", "Venture Partners", "VC"],
  "Private equity": ["Capital Partners", "Equity Partners", "Private Equity"],
  Fund: ["Growth Fund", "Impact Fund", "Infrastructure Fund", "Agri Fund"],
  DFI: ["Development Finance", "Development Bank"],
  Bank: ["Bank", "Commercial Bank", "Merchant Bank"],
  "Corporate buyer": ["Holdings", "Group", "Industries", "Telecom", "Logistics Group"],
  "Distributor or channel partner": ["Distribution", "Trade Links", "Channel Partners", "Distributors"],
  "Public institution": ["Authority"],
  "Ecosystem partner": ["Innovation Hub", "Tech Hub", "Enterprise Network", "Accelerator"],
  "Technology partner": ["Technologies", "Systems", "Digital"],
  "Regional operator": ["Regional", "Africa Operations", "East Africa"],
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
      const instrument: Instrument = pick(sector === "Fintech" ? ["Equity", "Debt and credit"] : sector === "Agribusiness" || sector === "Logistics" ? ["Debt and credit", "Procurement and contracts", "Equity"] : ["Equity", "Debt and credit", "Development and blended finance"]);
      const id = `dr_cs${(i + 1).toString().padStart(2, "0")}`;
      const contact = person(name);
      const dm = rand() < 0.5 ? { ...contact, title: "Chief Executive" } : { ...person(name), title: pick(["Chief Executive", "Managing Director", "Chief Financial Officer", "Founder"]) };
      const early = ["Lead", "Invited", "Draft"].includes(st);
      const submittedDay =
        st === "Submitted" || st === "In review" || st === "PendingSecond" ? addDaysTo("2027-02-08", between(0, 7)) : st === "Info" ? addDaysTo("2027-02-01", between(0, 6)) : st === "InfoExpired" ? "2027-01-29" : addDaysTo("2026-12-15", between(0, 36));
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
        a.statusAt = date(addDaysTo("2026-11-12", between(0, 9)), 11, 0);
        a.invite = { token: `inv_${id}`, sentAt: st === "Invited" ? date(addDaysTo("2026-12-14", between(1, 9)), 9, 30) : undefined };
        a.history.push({ at: a.statusAt, by: a.owner, what: "Imported from the mobilisation pipeline" });
        if (st === "Invited") a.history.push({ at: a.invite.sentAt!, by: a.owner, what: "Invitation sent" });
        apps.push(a);
        continue;
      }
      if (st === "Draft") {
        a.status = "Draft";
        a.statusAt = date("2027-02-1" + between(2, 5), 19, 20);
        a.draftSavedAt = date("2027-02-15", 21, between(0, 59));
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
          a.decisions.push({ id: `${id}_dec1`, decision: "Declined", reason: "Eligibility fails: pre-revenue with no contracted offtake.", conditions: [], by: decider, at: date("2027-02-15", 16, 20), needsSecond: true });
          a.history.push({ at: "2027-02-15 16:20", by: decider, what: "Decided Declined, waiting for a second decider" });
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
        const rec = st === "Declined" ? "Declined" : st === "Waitlisted" ? "Referred" : st.startsWith("Cond") ? "Conditional" : "Qualified";
        a.recommendations.push({ id: `${id}_rec1`, decision: rec, reason: "Scores and documents support it; see the assessment.", by: reviewer, at: date(addDaysTo(decidedDay, -1), 16, 0) });
        a.history.push({ at: date(addDaysTo(decidedDay, -1), 16, 0), by: reviewer, what: `Recommended: ${rec}` });
      }
      const decision = st === "Declined" ? "Declined" : st === "Waitlisted" ? "Referred" : st.startsWith("Cond") ? "Conditional" : "Qualified";
      const entry: DrDecisionEntry = {
        id: `${id}_dec1`,
        decision,
        reason:
          decision === "Declined"
            ? "Below the threshold on feasibility and traction; outside the mission's stage."
            : decision === "Referred"
              ? "Referred to the mission's deal-readiness clinic: eligible, but the ask needs sharpening before counterparties see it."
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
          a.reReview = { fields: ["ask.amount"], at: "2027-02-15 20:10" };
          a.ask = { ...a.ask!, amount: Math.round(a.ask!.amount * 1.6) };
          a.history.push({ at: "2027-02-15 20:10", by: "applicant", what: "Changed ask.amount; sent for re-review" });
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
      const contact = person(name);
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
      const submittedDay = st === "Submitted" || st === "In review" ? addDaysTo("2027-02-07", between(0, 8)) : st === "Info" ? addDaysTo("2027-02-03", between(0, 5)) : addDaysTo("2026-12-15", between(0, 30));
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
        decisionMaker: { ...person(name), title: pick(["Managing Partner", "Investment Director", "Head of Corporate Banking", "Chief Investment Officer", "Head of Sourcing"]) },
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
        a.statusAt = date(addDaysTo("2026-11-12", between(0, 9)), 11, 30);
        a.invite = { token: `inv_${id}`, sentAt: st === "Invited" ? date(addDaysTo("2026-12-14", between(1, 9)), 9, 45) : undefined };
        a.history.push({ at: a.statusAt, by: a.owner, what: "Imported from the mobilisation pipeline" });
        apps.push(a);
        continue;
      }
      if (st === "Draft") {
        a.statusAt = date("2027-02-14", 18, 0);
        a.draftSavedAt = date("2027-02-15", 22, 10);
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
  apps.push({ ...structuredClone(dupOf), id: "dr_cs99", ref: refNo("seeker", ++cs), assignee: undefined, submittedAt: "2027-02-15 21:40", status: "Submitted", statusAt: "2027-02-15 21:40", history: [{ at: "2027-02-15 21:40", by: "applicant", what: "Submitted" }], assessments: [] });

  /*
    relabel into the decision paper's terms: each sector to its place in the 19-sector taxonomy, and so to a
    track and a mission; the opportunity owner's kind from its stage; venture capital split into angel, venture
    and private equity. Done before matching, so every match and meeting is made in the paper's terms.
  */
  apps.forEach((a, n) => {
    if (a.type === "seeker") {
      a.org.sector = SECTOR_MAP[a.org.sector] ?? a.org.sector;
      const t = trackOf(a.org.sector);
      a.track = t.id;
      a.mission = t.missionId;
      const stage = a.ask?.stage;
      a.ownerKind = stage === "Bankable project" ? "Project sponsor" : stage === "Expansion" ? "Established enterprise" : t.id === "t3" || t.id === "t2" ? "Technology provider" : "Startup or scale-up";
    } else if (a.mandate) {
      a.mandate.sectors = [...new Set(a.mandate.sectors.map((x) => SECTOR_MAP[x] ?? x))];
      a.mission = trackOf(a.mandate.sectors[0]).missionId;
      if (a.providerKind === "Venture capital") {
        a.providerKind = (["Angel investor", "Venture capital", "Private equity"] as const)[n % 3];
        const m = MANDATE_BY_KIND[a.providerKind];
        a.mandate = { ...a.mandate, ticketMin: m.min, ticketMax: m.max, instruments: m.instruments, stages: m.stages };
      }
    }
  });
  // each provider named for what it is, so a bank is not called a fund: the place stays, the rest follows the kind
  const named = new Set<string>();
  for (const a of apps) {
    if (a.type !== "provider" || a.challenge || !a.providerKind) continue;
    const place = a.org.name.split(" ")[0];
    const options = NAME_BY_KIND[a.providerKind];
    const name = options.map((x) => `${place} ${x}`).find((x) => !named.has(x)) ?? `${place} ${options[0]} East Africa`;
    named.add(name);
    const oldDomain = a.org.name.toLowerCase().replace(/[^a-z]+/g, "");
    const domain = name.toLowerCase().replace(/[^a-z]+/g, "");
    const swap = (email: string) => email.replace(`@${oldDomain}.example`, `@${domain}.example`);
    a.org = { ...a.org, name, website: a.org.website ? `https://${domain}.example` : a.org.website };
    a.contact = { ...a.contact, email: swap(a.contact.email) };
    a.decisionMaker = { ...a.decisionMaker, email: swap(a.decisionMaker.email) };
  }

  /*
    challenge intake: two public institutions and a corporate buyer brought problems to solve. Their mandates say
    which businesses can solve them, so they enter the same match search as any provider once verified. Written
    out in full, with no random draw, so the rest of the seed holds.
  */
  const CHALLENGES: { id: string; kind: "Public institution" | "Corporate buyer"; name: string; domain: string; person: [string, string]; mission: string; sectors: string[]; stages: Stage[]; min: number; max: number; challenge: DrApplication["challenge"]; submitted: string; verified?: string; reviewer: string }[] = [
    {
      id: "dr_ch01", kind: "Public institution", name: "Directorate of Citizen Services", domain: "citizenservices", person: ["Grace Wanjiru", "Director, Service Delivery"], mission: "m1",
      sectors: ["Digital Public Infrastructure & Gov Tech", "Cybersecurity & Digital Trust", "Artificial Intelligence & Deep Technology"], stages: ["Growth", "Expansion"], min: 400_000, max: 1_200_000,
      challenge: { title: "Verify a citizen's identity in under a minute at service centres", problem: "Identity checks at the 52 service centres are manual: officers compare a card against a paper register, so a renewal takes 25 minutes and one in eight records holds a mismatch.", users: "About 1.4 million citizens a year at 52 centres, and 600 front-desk officers", constraints: "Data stays in-country under the Data Protection Act; must work offline for up to a day; Kiswahili and English", outcome: "Identity confirmed in under 60 seconds, mismatches below 1 in 100, at every centre by mid-2028", budget: "USD 400k to 1.2m", route: "Request for proposals", timeline: "RFP in April 2027, pilot at 5 centres from July", decisionProcess: "Evaluation committee scores the proposals; the Principal Secretary signs; Treasury approves the budget line" },
      submitted: "2027-01-08 10:20", verified: "2027-01-20 15:10", reviewer: "st_rev1",
    },
    {
      id: "dr_ch02", kind: "Public institution", name: "Lakeside County Water Services", domain: "lakesidewater", person: ["Peter Odhiambo", "Managing Director"], mission: "m1",
      sectors: ["Smart Cities & Urban Technology", "Energy Technology & Climate Innovation", "Telecommunications & Connectivity"], stages: ["Early revenue", "Growth"], min: 250_000, max: 3_000_000,
      challenge: { title: "Cut non-revenue water with smart metering", problem: "Forty-four per cent of the water the utility treats is never billed: leaks, illegal connections and meters read by hand once a quarter.", users: "86,000 household and 2,300 commercial connections", constraints: "Meters must run five years on battery; readings over NB-IoT or LoRa; billing system integration", outcome: "Non-revenue water below 30 per cent within two years of rollout", budget: "USD 3m over three years, part financed by the operator", route: "Public-private partnership", timeline: "Feasibility by June 2027, first 10,000 meters in 2028", decisionProcess: "The board approves; the county assembly passes the PPP; the PPP directorate reviews" },
      submitted: "2027-01-12 09:05", verified: "2027-01-26 11:40", reviewer: "st_rev3",
    },
    {
      id: "dr_ch03", kind: "Corporate buyer", name: "Meridian Commercial Bank", domain: "meridianbank", person: ["Faith Mutua", "Head of Fraud Risk"], mission: "m2",
      sectors: ["Artificial Intelligence & Deep Technology", "Fintech & Digital Banking", "Cybersecurity & Digital Trust"], stages: ["Early revenue", "Growth"], min: 80_000, max: 400_000,
      challenge: { title: "Stop mobile-money fraud before the money leaves", problem: "Fraud on wallet-to-bank transfers doubled last year; rules catch it a day late, after the money has moved.", users: "3.2 million retail customers and the 40-person fraud desk", constraints: "Decision in under 200 milliseconds; explainable to the regulator; no customer data leaves the bank", outcome: "Half the fraud losses with no more than 1 in 500 good transfers held", budget: "USD 80k pilot, then a licence", route: "Pilot", timeline: "Six-month pilot from May 2027", decisionProcess: "The fraud desk runs the pilot; the risk committee approves the licence" },
      submitted: "2027-02-09 14:30", reviewer: "st_rev2",
    },
  ];
  for (const c of CHALLENGES) {
    const [name, title] = c.person;
    const email = `${name.split(" ")[0].toLowerCase()}.${name.split(" ")[1].toLowerCase()}@${c.domain}.example`;
    const kyc = docs(["Registration certificate", "Beneficial owners", "Signatory ID"], addMinutes(c.submitted, 1440), c.id);
    const checked = c.verified ? { by: c.reviewer, at: addMinutes(c.verified, -120) } : undefined;
    const a: DrApplication = {
      id: c.id,
      eventId: EV_CA3,
      ref: refNo("provider", ++fp),
      type: "provider",
      providerKind: c.kind,
      mission: c.mission,
      source: "Mission team",
      owner: "st_coord1",
      assignee: c.reviewer,
      org: { name: c.name, regNo: `REG-${c.id.slice(-2)}-PUB`, country: "Kenya", sector: c.sectors[0], website: `https://${c.domain}.example` },
      contact: { name, email, phone: `+25470${c.id.slice(-2)}00${c.id.slice(-2)}11` },
      // confirmed by the reviewer before verifying, as verification requires
      decisionMaker: { name, title, email, phone: `+25470${c.id.slice(-2)}00${c.id.slice(-2)}11`, confirmed: c.verified ? { by: c.reviewer, at: addMinutes(c.verified, -90) } : undefined },
      mandate: { sectors: c.sectors, countries: ["Kenya", "Uganda", "Tanzania", "Rwanda"], stages: c.stages, ticketMin: c.min, ticketMax: c.max, currency: "USD", instruments: ["Procurement and contracts", "Pilots and deployment", ...(c.challenge!.route === "Public-private partnership" ? (["Project development"] as const) : [])], exclusions: [], timeline: c.challenge!.timeline },
      challenge: c.challenge,
      caps: { perDay: 5, perEvent: 12 },
      documents: c.verified ? kyc : kyc.slice(0, 2),
      status: c.verified ? "Decided" : "In review",
      statusAt: c.verified ?? addMinutes(c.submitted, 2880),
      submittedAt: c.submitted,
      firstReviewAt: addMinutes(c.submitted, 2880),
      decisions: [],
      recommendations: [],
      assessments: [],
      readiness: "Not ready",
      rfis: [],
      history: [{ at: c.submitted, by: "applicant", what: "Submitted a challenge" }],
      verification: {
        state: c.verified ? "Verified" : "Verification pending",
        kyc: Object.fromEntries(kyc.slice(0, c.verified ? 3 : 2).map((d, n) => [["Registration", "Beneficial owners", "Signatory ID"][n], { docId: d.id, checked: c.verified || n === 0 ? checked ?? { by: c.reviewer, at: addMinutes(c.submitted, 2900) } : undefined }])),
        nda: { version: "CA3-NDA v1.2", name, title, at: addMinutes(c.submitted, 1500) },
        sanctions: c.verified ? { result: "Clear", note: "No match", by: c.reviewer, at: checked!.at } : undefined,
        decided: c.verified ? { by: c.reviewer, at: c.verified, reason: "Challenge scoped, budget line confirmed, KYC checked, NDA signed, sanctions clear." } : undefined,
      },
    };
    a.history.push({ at: a.firstReviewAt!, by: c.reviewer, what: "Assigned for verification" });
    if (c.verified) a.history.push({ at: c.verified, by: c.reviewer, what: "Verification: Verified" });
    apps.push(a);
  }

  /*
    the participation fee: each approved seeker was sent the payment link with the decision. Those Deal Room
    Ready have paid (they are matched); of the rest, some paid, one in four had it waived, and the others still
    owe it, reminded after three days. Picked by position, not by the random draw, so the rest of the seed holds.
  */
  const feeOut: DealRoomState["outbox"] = [];
  let feeN = 0;
  for (const a of apps) {
    const dec = a.decisions.filter((d) => !d.needsSecond || d.second).pop();
    if (a.type !== "seeker" || !dec || !["Qualified", "Conditional"].includes(dec.decision)) continue;
    const sentAt = dec.second?.at ?? dec.at;
    const fee: DrApplication["fee"] = { amount: cfg.seekerFee.amount, currency: cfg.seekerFee.currency, sentAt };
    const n = feeN++;
    const paidAt = addMinutes(sentAt, (18 + (n % 5) * 7) * 60);
    if (a.readiness === "Deal Room Ready" || n % 4 === 1) {
      const card = n % 3 === 0;
      fee.paid = { at: paidAt < CLOCK ? paidAt : sentAt, method: card ? "Card" : "M-Pesa", reference: card ? `PSK_${(48211 + n * 977).toString(16)}` : `RK${(7310 + n * 131).toString(36).toUpperCase()}Q${n % 10}`, kes: card ? undefined : cfg.seekerFee.amount * 130 };
    } else if (n % 4 === 0) {
      fee.waived = { by: "st_lead", at: paidAt < CLOCK ? paidAt : sentAt, reason: "Sponsored place: the mission partner covers the fee" };
    } else {
      const due = addMinutes(sentAt, cfg.seekerFee.reminderDays * 1440);
      if (due <= CLOCK) fee.reminderAt = due;
    }
    a.fee = fee;
    a.history.push({ at: sentAt, by: "system", what: `Payment link sent: USD ${cfg.seekerFee.amount}` });
    if (fee.paid) a.history.push({ at: fee.paid.at, by: "applicant", what: `Paid USD ${cfg.seekerFee.amount} by ${fee.paid.method}, ref ${fee.paid.reference}` });
    if (fee.waived) a.history.push({ at: fee.waived.at, by: "st_lead", what: `Fee waived: ${fee.waived.reason}` });
    if (fee.reminderAt) a.history.push({ at: fee.reminderAt, by: "system", what: "Payment reminder sent" });
    a.history.sort((x, y) => x.at.localeCompare(y.at));
    if (!fee.paid && !fee.waived) {
      feeOut.push({ id: `msg_fee_${a.id}`, eventId: EV_CA3, at: sentAt, to: a.id, channel: "Email and SMS", subject: `Approved: pay the USD ${cfg.seekerFee.amount} participation fee to join the Deal Room`, link: `/dr/${a.id}?pay=1`, status: "Delivered" });
      if (fee.reminderAt) feeOut.push({ id: `msg_fee_r_${a.id}`, eventId: EV_CA3, at: fee.reminderAt, to: a.id, channel: "Email and SMS", subject: `Reminder: pay the USD ${cfg.seekerFee.amount} Deal Room fee to be matched and get your badge`, link: `/dr/${a.id}?pay=1`, status: "Delivered" });
    }
  }

  /* badges for everyone qualified, most accredited at the desk on day 1 or 2; a seeker's waits for the fee */
  const delegates: Delegate[] = [];
  let inside = 0;
  for (const a of apps) {
    const ok = a.type === "provider" ? a.verification?.state === "Verified" : ["Qualified", "Conditional"].includes(a.decisions.filter((d) => !d.needsSecond || d.second).pop()?.decision ?? "") && (!!a.fee?.paid || !!a.fee?.waived);
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
    sessions: [],
    opportunities: [],
    exceptions: [
      { id: "ex_1", eventId: EV_CA3, at: "2027-01-27 12:15", by: "st_lead", kind: "Change after freeze", reason: "Added 'Deal floor C' after the venue confirmed a third floor room", ref: "Settings" },
    ],
    grants: [],
    outbox: [
      ...feeOut,
      { id: "msg_s2", eventId: EV_CA3, at: "2027-02-15 21:40", to: "dr_cs99", channel: "Email and SMS", subject: "Application received, reference " + refNo("seeker", cs), link: "/dr/dr_cs99", status: "Delivered" },
      { id: "msg_s3", eventId: EV_CA3, at: "2027-02-15 16:20", to: "st_lead", channel: "Email", subject: "A decision waits for a second decider", link: "/dealroom/applications", status: "Delivered" },
      { id: "msg_s4", eventId: EV_CA3, at: "2027-02-12 09:00", to: "dr_cs22", channel: "SMS", subject: "Reminder: information requested on your application", link: "/dr/dr_cs22", status: "Failed" },
    ],
    queue: [],
    conflicts: [],
    incidents: [],
    offline: false,
    seq: { cs, fp },
    adminLog: [
      { at: "2026-10-23 10:00", by: "admin", what: "Deal Room enabled for Connected Africa 3.0: add-on KES 450,000, desk staffing 3" },
      ...ca3Staff.map((s) => ({ at: s.addedAt, by: "admin", what: `Account created: ${s.name}, ${s.role}${s.canDecide && s.role !== "Lead" ? ", may decide" : ""}${s.mfa ? ", MFA on" : ""}` })).reverse(),
    ],
  };
  seedMatching(dr, delegates);
  dr.outbox.sort((a, b) => b.at.localeCompare(a.at));
  return { dr, delegates, drZoneInside: inside };
}

/**
 * Cut 2: matches, introductions and meetings, made by the same rules the screens use. Matching ran
 * 4 to 22 January, introductions went out with it, meetings were booked from 25 January, and the
 * summit has run a day and forty minutes. Mutates the slice and the badges it is given.
 */
function seedMatching(dr: DealRoomState, delegates: Delegate[]) {
  const cfg = dr.configs[EV_CA3];
  const seekers = dr.apps.filter((a) => a.type === "seeker" && matchable(a));
  const load: Record<string, number> = {};
  const matches: DrMatch[] = [];
  const reviewerOf = (a: DrApplication) => a.assignee ?? "st_rev1";

  // a few delegates take the diligence workshop on day 2, so their meetings must avoid it
  for (const a of seekers.slice(0, 10)) {
    const d = delegates.find((x) => x.id === a.delegateId);
    if (d) d.sessions = ["s_ca3_2"];
  }
  ca3Sessions[1].enrolled = delegates.filter((d) => d.sessions.includes("s_ca3_2")).length;

  seekers.forEach((seeker, i) => {
    const day = 1 + (i % 18);
    const at = date(addDaysTo("2027-01-03", day), 10 + (i % 6), 15);
    const list = candidates({ ...dr, matches }, cfg, seeker).filter((c) => !c.provider.challenge && !c.exclusionHit && c.mandatoryMiss.length <= 1 && (load[c.provider.id] ?? 0) < 7);
    const take = list.slice(0, 3);
    take.forEach((c, k) => {
      load[c.provider.id] = (load[c.provider.id] ?? 0) + 1;
      const note = c.mandatoryMiss.length ? `${c.mandatoryMiss[0] === "ticket" ? "Ask sits just outside the ticket range" : `Misses ${c.mandatoryMiss[0]}`}; the investor confirmed flexibility on a call.` : "";
      const m: DrMatch = { id: `mx_${seeker.id}_${k}`, eventId: EV_CA3, seekerId: seeker.id, providerId: c.provider.id, origin: k === 2 && i % 7 === 0 ? "interest" : "search", met: c.met, missed: c.missed, exclusionHit: c.exclusionHit, decision: "Approved", note, by: reviewerOf(seeker), at, history: [{ at, by: reviewerOf(seeker), what: `Approved${note ? `: ${note}` : ""}` }] };
      m.brief = { ...draftBrief({ ...dr, matches: [...matches, m] }, m), editedAt: at };
      matches.push(m);
    });
    // one pair a reviewer turned down, with the reason on record
    const no = list[3];
    if (no && i % 4 === 0) matches.push({ id: `mx_${seeker.id}_r`, eventId: EV_CA3, seekerId: seeker.id, providerId: no.provider.id, origin: "search", met: no.met, missed: no.missed, decision: i % 8 === 0 ? "Deferred" : "Rejected", note: i % 8 === 0 ? "Revisit after the summit if the provider widens its countries." : "The investor's stage focus does not fit this raise.", by: reviewerOf(seeker), at, history: [{ at, by: reviewerOf(seeker), what: i % 8 === 0 ? "Deferred" : "Rejected" }] });
  });

  // each verified challenge matched with the three businesses that fit it best: sector, country and stage
  for (const ch of dr.apps.filter((a) => a.challenge && matchable(a))) {
    const fits = candidates({ ...dr, matches }, cfg, ch).filter((c) => !c.exclusionHit && c.mandatoryMiss.length === 0 && !c.existing && !matches.some((m) => m.seekerId === c.seeker.id && m.providerId === ch.id));
    fits.slice(0, 3).forEach((c, k) => {
      const at = addMinutes(ch.verification!.decided!.at, 60 * 24 * (k + 1));
      const by = ch.assignee ?? "st_rev1";
      const note = `Could solve: ${ch.challenge!.title}`;
      const m: DrMatch = { id: `mx_${c.seeker.id}_${ch.id}`, eventId: EV_CA3, seekerId: c.seeker.id, providerId: ch.id, origin: "search", met: c.met, missed: c.missed, exclusionHit: c.exclusionHit, decision: "Approved", note, by, at, history: [{ at, by, what: `Approved: ${note}` }] };
      m.brief = { ...draftBrief({ ...dr, matches: [...matches, m] }, m), editedAt: at };
      matches.push(m);
    });
  }

  // introductions and the answers to them
  let n = 0;
  for (const m of matches) {
    if (m.decision !== "Approved") continue;
    n++;
    const seeker = dr.apps.find((a) => a.id === m.seekerId)!;
    const deck = seeker.documents.find((d) => d.kind === "Pitch deck");
    const fin = seeker.documents.find((d) => d.kind === "Financial statements");
    const items = ["teaser", "profile", ...(deck ? [deck.id] : []), ...(fin ? [fin.id] : [])];
    if (n % 13 === 0) continue; // approved, brief written, not introduced yet
    const pending = n % 17 === 0;
    const sentAt = pending ? date("2027-02-13", 11, 0) : addMinutes(m.at, 60 * 24);
    m.intro = { items, sentAt, by: m.by };
    m.history.push({ at: sentAt, by: m.by, what: "Introduction sent" });
    if (pending) continue;
    if (n % 19 === 0) continue; // nobody answered: expired
    const seekerAt = addMinutes(sentAt, 60 * 20);
    const providerAt = addMinutes(sentAt, 60 * 40);
    if (n % 11 === 0) {
      m.intro.seeker = { response: "Accepted", at: seekerAt };
      m.intro.provider = { response: "Declined", reason: "Outside our pipeline for this quarter.", at: providerAt };
      continue;
    }
    if (n % 23 === 0) {
      m.intro.seeker = { response: "Declined", reason: "Already in talks with this investor.", at: seekerAt };
      continue;
    }
    m.intro.seeker = { response: "Accepted", at: seekerAt };
    m.intro.provider = { response: "Accepted", at: providerAt };
    const consents: DrConsent[] = [];
    if (deck) consents.push({ id: `cs_${m.id}_d`, seekerId: m.seekerId, providerId: m.providerId, docId: deck.id, granted: true, at: seekerAt, version: 1 });
    if (fin) consents.push({ id: `cs_${m.id}_f`, seekerId: m.seekerId, providerId: m.providerId, docId: fin.id, granted: n % 3 !== 0, at: seekerAt, version: 1 });
    dr.consents.push(...consents);
  }
  dr.matches = matches;

  // a provider found two teasers in the directory on its own
  const fp = dr.apps.find((a) => a.type === "provider" && a.verification?.state === "Verified")!;
  for (const s of seekers.filter((x) => !matches.some((m) => m.seekerId === x.id && m.providerId === fp.id)).slice(0, 2)) {
    matches.push({ id: `mx_${s.id}_int`, eventId: EV_CA3, seekerId: s.id, providerId: fp.id, origin: "interest", met: [], missed: [], decision: "Suggested", note: "", by: "applicant", at: date("2027-02-15", 18, 30), history: [{ at: date("2027-02-15", 18, 30), by: "applicant", what: `${fp.org.name} expressed interest` }] });
  }

  // meetings: booked through the slot rules, with the clock wound back to the booking window
  const ctx = { dealRoom: { ...dr, clock: "2027-01-25 09:00", meetings: [] as DrMeeting[] }, events: [ca3], rooms: ca3Rooms, delegates, sessions: ca3Sessions };
  const times = slotTimes(cfg);
  const dayOrder = ["2027-02-15", "2027-02-16", "2027-02-16", "2027-02-17", "2027-02-16", "2027-02-18", "2027-02-15"];
  const accepted = matches.filter((m) => m.intro?.seeker?.response === "Accepted" && m.intro?.provider?.response === "Accepted");
  accepted.forEach((m, i) => {
    if (i % 13 === 7) return; // accepted lately and still waiting for a slot: the "ready to schedule" list
    const days = [dayOrder[i % dayOrder.length], ...["2027-02-15", "2027-02-16", "2027-02-17", "2027-02-18"]];
    for (const day of days) {
      for (const t of times.slice((i * 3) % 7)) {
        for (const [roomId, rc] of Object.entries(cfg.rooms)) {
          for (let table = 1; table <= rc.tables; table++) {
            const req = { matchId: m.id, roomId, table, start: `${day} ${t}`, flagged: dr.apps.find((a) => a.id === m.providerId)?.providerKind === "DFI" };
            const p = slotProblems(ctx, req);
            if (p.clashes.length || p.caps.length) continue;
            const proposedAt = date(addDaysTo("2027-01-25", i % 6), 10, 0);
            ctx.dealRoom.meetings.push({ id: `mt_${m.id}`, eventId: EV_CA3, matchId: m.id, roomId, table, start: req.start, end: p.end, flagged: req.flagged, status: "Confirmed", proposedAt, confirm: { seeker: addMinutes(proposedAt, 300), provider: addMinutes(proposedAt, 900) }, arrivals: {}, history: [{ at: proposedAt, by: "st_ops1", what: `Proposed ${req.start}` }, { at: addMinutes(proposedAt, 900), by: "provider", what: "Confirmed by both" }] });
            return;
          }
        }
      }
    }
  });
  const meetings = ctx.dealRoom.meetings;

  // settle each meeting against the clock: 16 February, 10:40
  const opps: DrOpportunity[] = [];
  const access: DrAccess[] = [];
  let later = 0;
  meetings.forEach((mt, i) => {
    const match = matches.find((x) => x.id === mt.matchId)!;
    const seeker = dr.apps.find((a) => a.id === match.seekerId)!;
    const provider = dr.apps.find((a) => a.id === match.providerId)!;
    for (const a of [seeker, provider]) {
      const d = delegates.find((x) => x.id === a.delegateId);
      if (d && mt.start.slice(0, 10) <= CLOCK.slice(0, 10) && !d.accredited) {
        d.accredited = true;
        d.status = "Checked in";
        d.checkIns = [{ day: mt.start.slice(0, 10) === "2027-02-15" ? 1 : 2, at: "08:40" }];
      }
    }
    access.push({ id: `ac_${mt.id}`, seekerId: seeker.id, item: "profile", viewer: provider.id, action: "view", at: addMinutes(match.intro!.provider!.at, 30) });
    const deck = seeker.documents.find((d) => d.kind === "Pitch deck");
    if (deck && i % 2 === 0) access.push({ id: `ac_${mt.id}_d`, seekerId: seeker.id, item: deck.id, viewer: provider.id, action: i % 4 === 0 ? "download" : "view", at: addMinutes(match.intro!.provider!.at, 45) });
    const arrive = addMinutes(mt.start, -15);
    if (mt.end <= CLOCK) {
      if (i % 12 === 5) {
        mt.status = "No-show";
        mt.noShow = "provider";
        mt.arrivals = { seeker: arrive };
        mt.history.push({ at: addMinutes(mt.start, 11), by: "st_ops1", what: "No-show: provider" });
        return;
      }
      mt.status = "Held";
      mt.arrivals = { seeker: arrive, provider: addMinutes(arrive, 5) };
      // the paper's meeting outcomes, in turn
      const cat = (["Due diligence", "Information requested", "Follow-up meeting", "Financing or partnership proposal", "No fit"] as const)[i % 5];
      const owner = seeker.assignee ?? "st_rev1";
      const due = addMinutes(mt.start, 60 * 24 * (7 + (i % 10))).slice(0, 10);
      const next = cat === "No fit" ? undefined : (["Send the data room link", "Share audited accounts", "Schedule a site visit", "Send a term sheet outline"] as const)[i % 4];
      mt.outcome = { category: cat, nextAction: next, owner: next ? owner : undefined, due: next ? due : undefined, notes: cat === "Due diligence" || cat === "Financing or partnership proposal" ? "Strong fit; the investor asked for a follow-up within two weeks." : cat === "No fit" ? "Stage too early for this investor." : "Interested if the raise is split into two tranches.", sensitive: i % 9 === 0, by: "st_ops1", at: addMinutes(mt.end, 3), clientId: `cl_${mt.id}` };
      mt.history.push({ at: addMinutes(mt.end, 3), by: "st_ops1", what: `Held: ${cat}` });
      if (next) {
        opps.push({ id: `op_${mt.id}`, eventId: EV_CA3, meetingId: mt.id, matchId: mt.matchId, owner, stage: "Follow-up", stageDates: { "Follow-up": addMinutes(mt.end, 3) }, nextAction: next, due, outcomes: cat === "Due diligence" || cat === "Financing or partnership proposal" ? [{ id: `oo_${mt.id}`, kind: "Expression of interest", date: mt.start.slice(0, 10), evidence: `Meeting outcome: ${cat}`, by: "st_ops1", at: addMinutes(mt.end, 3) }] : [], updates: [], requests: [], reviews: [], history: [{ at: addMinutes(mt.end, 3), by: "st_ops1", what: "Opened from the meeting outcome" }] });
      }
      return;
    }
    if (mt.start <= CLOCK) {
      mt.status = "In progress";
      mt.arrivals = { seeker: arrive, provider: arrive };
      mt.history.push({ at: mt.start, by: "door", what: "In progress" });
      return;
    }
    if (mt.start.slice(0, 10) === CLOCK.slice(0, 10)) {
      // later today: most have checked in; a few have not, and the board will flag them as the slot nears
      if (i % 4 !== 1) mt.arrivals = { seeker: date("2027-02-16", 8, 50), provider: i % 4 === 2 ? undefined : date("2027-02-16", 9, 5) };
      return;
    }
    // later in the week: a few re-proposed this morning and still to confirm (inside 48 hours the window is two hours), one asked to move
    const k = later++;
    if (k % 5 === 1) {
      mt.status = "Proposed";
      mt.proposedAt = date("2027-02-16", 9, 0);
      mt.confirm = { seeker: date("2027-02-16", 9, 20) };
      mt.history = [{ at: mt.proposedAt, by: "st_ops2", what: `Proposed ${mt.start}` }];
    } else if (k % 7 === 3) {
      mt.status = "Change requested";
      mt.change = { by: "provider", reason: "Our partner lands at noon; any slot after 14:00.", at: date("2027-02-15", 20, 15) };
      mt.history.push({ at: mt.change.at, by: "provider", what: `Asked to move: ${mt.change.reason}` });
    }
  });
  dr.meetings = meetings;
  dr.opportunities = opps;
  dr.sessions = seedSessions(dr);
  dr.access = access.sort((a, b) => b.at.localeCompare(a.at));

  // Device B lost its connection on day 1 and still holds two records: one already synced, one recorded differently
  const held = meetings.filter((m) => m.status === "Held" && m.outcome);
  const queue: DrQueued[] = [];
  if (held[0]?.outcome) queue.push({ device: "Device B, Deal floor A", meetingId: held[0].id, attendance: "Held", outcome: { ...held[0].outcome } });
  if (held[1]?.outcome) queue.push({ device: "Device B, Deal floor A", meetingId: held[1].id, attendance: "Held", outcome: { ...held[1].outcome, category: "Follow-up meeting", notes: "Captured on the tablet: wants a site visit in March.", clientId: `cl_devb_${held[1].id}` } });
  dr.queue = queue;
  dr.incidents = [{ id: "inc_1", startedAt: "2027-02-15 14:05", endedAt: "2027-02-15 14:32", cause: "Venue Wi-Fi dropped on the Deal floor", synced: 6, duplicates: 1, conflicts: 0 }];
  dr.liveWindow = { declaredAt: "2027-02-14 18:00", by: "admin", rota: ["Kevin (Algotech), on call", "Faith (Algotech), back-up"] };
  dr.outbox.unshift({ id: "msg_s5", eventId: EV_CA3, at: "2027-02-15 19:00", to: "st_lead", channel: "Email", subject: "Daily Deal Room report, Mon 15 Feb", link: "/dealroom/reports?day=2027-02-15", status: "Delivered" });
  dr.script = seedConversion(dr);
}

/**
 * The four-day programme in the paper's formats, each day on its emphasis: briefings and challenges to open the
 * market on day 1, pitching and clinics on day 2, finance, challenges and market access on day 3, negotiation and
 * follow-ups on day 4. Every session is placed through the same rules the coordinator's form uses, so no host,
 * room or accepted participant is double-booked against a meeting. Day 1 and this morning's are held, with
 * attendance and outcomes; the 10:30 clinic is in progress; the rest are ahead, with answers coming in.
 */
function seedSessions(dr: DealRoomState): DrSession[] {
  const events = [{ id: EV_CA3, startDate: "2027-02-15", endDate: "2027-02-18" }];
  const ok = (a: DrApplication) => invitable(a);
  const seekers = dr.apps.filter((a) => a.type === "seeker" && ok(a));
  const providers = dr.apps.filter((a) => a.type === "provider" && !a.challenge && ok(a));
  const challenges = dr.apps.filter((a) => a.challenge && ok(a));
  const sectorsOf = (p: DrApplication) => p.challenge ? p.mandate!.sectors : p.mandate?.sectors ?? [];
  const forProvider = (p: DrApplication) => seekers.filter((x) => sectorsOf(p).includes(x.org.sector));
  const forSeeker = (x: DrApplication) => providers.filter((p) => sectorsOf(p).includes(x.org.sector));
  type Plan = { day: string; start: string; end: string; room: "r_dr8" | "r_dr9"; format: SessionFormat; title: (h?: DrApplication) => string; hosts: DrApplication[]; invite: (h?: DrApplication) => DrApplication[]; track?: string };
  const kind = (k: string) => providers.filter((p) => p.providerKind === k);
  const conditional = seekers.filter((x) => x.decisions.filter((d) => !d.needsSecond || d.second).pop()?.decision === "Conditional");
  const pairsInDeal = dr.opportunities.filter((o) => !o.closed).map((o) => dr.matches.find((m) => m.id === o.matchId)!).filter(Boolean);
  const plans: Plan[] = [
    { day: "2027-02-15", start: "09:30", end: "10:30", room: "r_dr8", format: "Reverse pitch or mandate briefing", title: (h) => `How ${h!.org.name} invests: mandate briefing`, hosts: [...kind("Venture capital"), ...kind("Fund"), ...kind("Angel investor")], invite: (h) => forProvider(h!) },
    { day: "2027-02-15", start: "11:00", end: "12:00", room: "r_dr8", format: "Government challenge session", title: (h) => h!.challenge!.title, hosts: challenges.filter((c) => c.id === "dr_ch01"), invite: (h) => forProvider(h!), track: "t2" },
    { day: "2027-02-15", start: "14:00", end: "15:30", room: "r_dr9", format: "DFI and blended-finance roundtable", title: () => "Bankability of digital public infrastructure", hosts: kind("DFI"), invite: (h) => forProvider(h!).filter((x) => x.ask?.stage === "Bankable project" || x.ask?.stage === "Expansion") },
    { day: "2027-02-15", start: "15:30", end: "16:30", room: "r_dr8", format: "Corporate procurement and supplier discovery", title: () => "Supplier discovery: enterprise software and data services", hosts: kind("Corporate buyer"), invite: (h) => forProvider(h!) },
    { day: "2027-02-16", start: "09:00", end: "10:00", room: "r_dr8", format: "Investment opportunity presentation", title: () => "Scale-up pitches: AI, software and fintech", hosts: seekers.filter((x) => x.track === "t3"), invite: (h) => forSeeker(h!) },
    { day: "2027-02-16", start: "10:30", end: "11:30", room: "r_dr9", format: "VC, PE and growth-capital clinic", title: (h) => `Growth-capital clinic with ${h!.org.name}`, hosts: [...kind("Private equity"), ...kind("Venture capital"), ...kind("Fund")], invite: (h) => forProvider(h!) },
    { day: "2027-02-16", start: "14:00", end: "15:00", room: "r_dr8", format: "Investment opportunity presentation", title: () => "Startup pitches: talent, jobs and enterprise growth", hosts: seekers.filter((x) => x.track === "t4"), invite: (h) => forSeeker(h!) },
    { day: "2027-02-16", start: "15:30", end: "16:30", room: "r_dr9", format: "Corporate procurement and supplier discovery", title: () => "Supplier discovery: digital channels and payments", hosts: kind("Corporate buyer").slice(1), invite: (h) => forProvider(h!) },
    { day: "2027-02-17", start: "09:30", end: "11:00", room: "r_dr9", format: "DFI and blended-finance roundtable", title: () => "Blended finance for climate and energy technology", hosts: kind("DFI").slice(1), invite: (h) => forProvider(h!) },
    { day: "2027-02-17", start: "11:00", end: "12:00", room: "r_dr8", format: "Project finance presentation", title: (h) => `${h!.org.name}: project structure and bankability`, hosts: seekers.filter((x) => x.ask?.stage === "Bankable project"), invite: (h) => forSeeker(h!) },
    { day: "2027-02-17", start: "14:00", end: "15:00", room: "r_dr8", format: "Government challenge session", title: (h) => h!.challenge!.title, hosts: challenges.filter((c) => c.id === "dr_ch02"), invite: (h) => forProvider(h!), track: "t1" },
    { day: "2027-02-17", start: "14:00", end: "15:00", room: "r_dr9", format: "Market-entry and cross-border partnership", title: () => "Regional distribution and cross-border payments", hosts: kind("Distributor or channel partner"), invite: () => seekers.filter((x) => x.track === "t6"), track: "t6" },
    { day: "2027-02-17", start: "15:30", end: "16:30", room: "r_dr9", format: "Technology deployment and pilot meeting", title: () => "Pilot scoping: identity checks at five centres", hosts: challenges.filter((c) => c.id === "dr_ch01"), invite: (h) => forProvider(h!).slice(0, 3), track: "t2" },
    { day: "2027-02-18", start: "09:30", end: "10:30", room: "r_dr9", format: "Negotiation and deal progression", title: () => "Term clarification: follow-ups in progress", hosts: [], invite: () => [...new Set(pairsInDeal.slice(0, 4).flatMap((m) => [m.seekerId, m.providerId]))].map((id) => dr.apps.find((a) => a.id === id)!).filter(ok) },
    { day: "2027-02-18", start: "11:00", end: "12:00", room: "r_dr9", format: "Deal advisory and readiness clinic", title: () => "Readiness clinic: conditions and data rooms", hosts: [], invite: () => conditional },
    { day: "2027-02-18", start: "14:00", end: "15:00", room: "r_dr8", format: "Technology deployment and pilot meeting", title: () => "Smart metering: feasibility and pilot owners", hosts: challenges.filter((c) => c.id === "dr_ch02"), invite: (h) => forProvider(h!).slice(0, 3), track: "t1" },
  ];
  const OUTCOME_NOTE: Record<string, string> = {
    "No fit": "",
    "Information requested": "Asked for the latest management accounts and the customer pipeline.",
    "Follow-up meeting": "A second meeting agreed for day 4.",
    "Due diligence": "Commercial review starts next week.",
    "Pilot or procurement": "Invited to the pilot shortlist.",
    "Financing or partnership proposal": "A partnership outline to follow.",
    "Commitment documented": "",
  };
  const cats: MeetingOutcome[] = ["Information requested", "Follow-up meeting", "No fit", "Pilot or procurement", "Information requested", "Financing or partnership proposal", "Due diligence"];
  const work = { ...dr, clock: "2027-01-28 09:00", sessions: [] as DrSession[] };
  plans.forEach((p, i) => {
    const start = `${p.day} ${p.start}`;
    const end = `${p.day} ${p.end}`;
    let host: DrApplication | undefined;
    const base = { eventId: EV_CA3, format: p.format, start, end, roomId: p.room, track: p.track };
    if (p.hosts.length) {
      host = p.hosts.find((h) => sessionProblems({ dealRoom: work, events }, { ...base, title: p.title(h), host: h.id }).length === 0);
      if (!host) return;
    } else if (sessionProblems({ dealRoom: work, events }, { ...base, title: p.title() }).length) return;
    const planned = date(addDaysTo("2027-01-28", i % 6), 9, 30);
    const sess: DrSession = { id: `ses_${(i + 1).toString().padStart(2, "0")}`, ...base, title: p.title(host), host: host?.id, owner: "st_coord1", invitees: [], responses: {}, attended: [], outcomes: [], history: [{ at: planned, by: "st_coord1", what: "Planned" }] };
    const invited = p.invite(host).filter((a) => a.id !== host?.id).slice(0, 7);
    sess.invitees = invited.map((a) => a.id);
    sess.history.push({ at: addMinutes(planned, 60), by: "st_coord1", what: `Invited ${invited.length}` });
    invited.forEach((a, k) => {
      const at = addMinutes(planned, 60 * (6 + k * 5));
      const answer = (i + k) % 5 === 3 ? "Declined" : (i + k) % 7 === 5 && start > CLOCK ? undefined : "Accepted";
      if (!answer) return;
      if (answer === "Accepted" && acceptProblems(work, sess, a.id).length) return; // busy then: the invitation stays unanswered
      sess.responses[a.id] = { answer, at };
      sess.history.push({ at, by: "applicant", what: `${a.org.name}: ${answer.toLowerCase()}` });
    });
    work.sessions.push(sess);
    // held: day 1, and this morning's 09:00; the 10:30 clinic is under way with attendance being taken
    const going = [...(sess.host ? [sess.host] : []), ...Object.entries(sess.responses).filter(([, r]) => r.answer === "Accepted").map(([id]) => id)];
    if (end <= CLOCK || (start <= CLOCK && CLOCK < end)) {
      const inProgress = start <= CLOCK && CLOCK < end;
      sess.attended = going.filter((_, k) => (inProgress ? k < Math.ceil(going.length / 2) : (k + i) % 6 !== 4));
      for (const id of sess.attended) sess.history.push({ at: addMinutes(start, 5), by: "st_ops1", what: `${dr.apps.find((a) => a.id === id)?.org.name} attended` });
      if (!inProgress) {
        const attendees = sess.attended.filter((id) => id !== sess.host);
        const record = p.day === "2027-02-16" ? attendees.slice(0, Math.ceil(attendees.length / 2)) : attendees; // this morning's still being written up
        record.forEach((id, k) => {
          const category = cats[(i + k) % cats.length];
          const at = addMinutes(end, 20 + k * 5);
          sess.outcomes.push({ appId: id, category, note: OUTCOME_NOTE[category], by: "st_coord1", at });
          sess.history.push({ at, by: "st_coord1", what: `${dr.apps.find((a) => a.id === id)?.org.name}: ${category}` });
        });
      }
    }
    sess.history.sort((x, y) => x.at.localeCompare(y.at));
  });
  return work.sessions;
}

/**
 * After the summit, as the demo clock moves to May and August: what each seeded opportunity does.
 * Six patterns, so the conversion screens show every case: won with funds received, in negotiation,
 * lost, stalled from the start, stalled in diligence, and waiting on a provider's committee.
 */
function seedConversion(dr: DealRoomState): DrScripted[] {
  const out: DrScripted[] = [];
  const day = (n: number, h = 10) => {
    const d = new Date("2027-02-19T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return date(d.toISOString().slice(0, 10), h, 0);
  };
  const ymd = (n: number) => day(n).slice(0, 10);
  const doc = (kind: DrDocument["kind"], name: string, at: string): DrDocument => ({ id: `doc_cv_${name.replace(/\W+/g, "").slice(0, 10)}_${at.replace(/\D/g, "").slice(4, 8)}`, name, kind, size: 1_400_000, at, download: true });
  [...dr.opportunities].sort((a, b) => a.id.localeCompare(b.id)).forEach((o, j) => {
    const m = dr.matches.find((x) => x.id === o.matchId)!;
    const seeker = dr.apps.find((a) => a.id === m.seekerId)!;
    const ask = seeker.ask!;
    const at = (n: number, step: DrScriptStep, by = o.owner, h = 10) => out.push({ at: day(n + (j % 3), h), oppId: o.id, by, step });
    const round = (x: number) => Math.round((ask.amount * x) / 10_000) * 10_000;
    switch (j % 6) {
      case 0: // won, with a first tranche received
        at(3, { kind: "update", from: "owner", text: "Call held with both sides; the investor wants audited accounts and the pipeline." });
        at(4, { kind: "stage", stage: "Diligence", evidence: "Data request: audited accounts, pipeline and cap table" });
        at(4, { kind: "next", nextAction: "Seeker uploads the data pack", due: ymd(18) });
        at(10, { kind: "request", to: "seeker" });
        at(13, { kind: "update", from: "seeker", text: "Audited accounts and the pipeline are in the data room.", doc: doc("Financial statements", "audited-accounts-2026.pdf", day(13 + (j % 3))) }, seeker.id);
        at(34, { kind: "stage", stage: "Negotiation", evidence: "Term sheet received from the investor" });
        at(35, { kind: "outcome", outcome: { kind: "Indicative commitment", amount: round(0.6), currency: ask.currency, date: ymd(35 + (j % 3)), evidence: "Email from the investment committee chair" } });
        at(36, { kind: "next", nextAction: "Sign the facility agreement", due: ymd(60) });
        at(58, { kind: "outcome", outcome: { kind: "Signed commitment", amount: round(0.6), currency: ask.currency, instrument: ask.instrument, date: ymd(58 + (j % 3)), evidence: "Signed facility agreement.pdf" } });
        at(58, { kind: "stage", stage: "Closed – won", evidence: "Facility agreement signed" });
        at(64, { kind: "outcome", outcome: { kind: "Approved, not disbursed", amount: round(0.6), currency: ask.currency, date: ymd(64 + (j % 3)), evidence: "Credit committee approval letter.pdf" } });
        at(76, { kind: "outcome", outcome: { kind: "Deployed", amount: round(0.3), currency: ask.currency, date: ymd(76 + (j % 3)), evidence: "Disbursement confirmation, first tranche.pdf" } });
        break;
      case 1: // in negotiation with a promise, next step after mid-May
        at(5, { kind: "stage", stage: "Diligence", evidence: "Investor reviewing the financial model" });
        at(5, { kind: "next", nextAction: "Investor site visit", due: ymd(30) });
        at(42, { kind: "stage", stage: "Negotiation", evidence: "Written proposal sent by the investor" });
        at(47, { kind: "outcome", outcome: { kind: "Indicative commitment", amount: round(0.5), currency: ask.currency, date: ymd(47 + (j % 3)), evidence: "Letter of intent, unsigned" } });
        at(66, { kind: "next", nextAction: "Agree final terms", due: "2027-06-02" });
        break;
      case 2: // lost on timing
        at(8, { kind: "stage", stage: "Diligence", evidence: "Data request received" });
        at(30, { kind: "close", reason: "Timing", note: "The investor's fund closes its investment period in May; revisit next year." });
        break;
      case 3: // nothing after the meeting: overdue and stalled by May
        break;
      case 4: // diligence, then quiet
        at(9, { kind: "stage", stage: "Diligence", evidence: "Site visit requested" });
        at(10, { kind: "next", nextAction: "Site visit to the plant", due: "2027-04-02" });
        break;
      case 5: // waiting on the provider's credit committee
        at(26, { kind: "request", to: "provider" });
        at(30, { kind: "update", from: "provider", text: "Our credit committee meets on 6 May; a commitment decision follows." }, m.providerId);
        at(31, { kind: "next", nextAction: "Credit committee decision", due: "2027-05-13" });
        break;
    }
  });
  // the lead's monthly reviews for March and April; May's is the one waiting at the 18 May step
  for (const o of dr.opportunities) {
    out.push({ at: "2027-03-05 11:00", oppId: o.id, by: "st_lead", step: { kind: "review", note: "Monthly review" } });
    out.push({ at: "2027-04-06 11:00", oppId: o.id, by: "st_lead", step: { kind: "review", note: "Monthly review" } });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

