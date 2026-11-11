/**
 * What a new event's Deal Room starts from when Algotech approves the add-on: the platform's standard rubric, form,
 * matching fields and rules. The lead then sets the missions, tracks and dates (and may change the rest) before
 * applications open. Nothing here names an event, a person or the demo; the demo's own config is in seed.ts.
 */
import type { EventRecord } from "../types";
import type { DrConfig, ProviderKind } from "./types";

export const STANDARD_SECTORS = [
  "Data Centres & Cloud Infrastructure", "Telecommunications & Connectivity", "Artificial Intelligence & Deep Technology", "Cybersecurity & Digital Trust", "Fintech & Digital Banking",
  "E-commerce & Digital Trade", "Logistics & Mobility Technology", "Enterprise Technology & SaaS", "Agritech & Food Technology", "Health tech & Biotechnology",
  "Energy Technology & Climate Innovation", "Smart Cities & Urban Technology", "Edtech & Future of Work", "Aerospace, Satellite & Space Technology", "Advanced Manufacturing & Industry 4.0",
  "Creative Economy & Digital Media", "Digital Public Infrastructure & Gov Tech", "Mining, Natural Resources & Industrial Technology", "Tourism Tech & Hospitality Innovation",
];
export const STANDARD_COUNTRIES = ["Kenya", "Uganda", "Tanzania", "Rwanda", "Ethiopia", "Nigeria", "Ghana", "Côte d'Ivoire", "Senegal", "Zambia", "South Africa"];
export const STANDARD_SOURCES = ["Referral", "Partner", "Outreach campaign", "Inbound", "Mission team"];
export const STANDARD_PROVIDER_KINDS: ProviderKind[] = [
  // capital providers, then commercial and strategic partners, then the institution a challenge comes from (PRD, 11 Nov: twelve kinds)
  "Angel investor", "Venture capital", "Private equity", "Fund", "DFI", "Bank",
  "Corporate buyer", "Distributor or channel partner", "Ecosystem partner", "Technology partner", "Regional operator",
  "Public institution",
];

export const STANDARD_RUBRIC: DrConfig["rubric"] = {
  eligibility: [
    { id: "e1", text: "Sector in scope for the mission" },
    { id: "e2", text: "Active in the mission geography" },
    { id: "e3", text: "Legally registered" },
    { id: "e4", text: "Post-revenue, or a bankable project" },
    { id: "e5", text: "Asking for a named transaction pathway" },
  ],
  assessment: [
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
};

export const STANDARD_FIELDS: DrConfig["fields"] = {
  "org.name": "required", "org.regNo": "required", "org.country": "required", "org.sector": "required", "org.website": "advisory",
  "ask.amount": "required", "ask.instrument": "required", "ask.useOfFunds": "required", "ask.stage": "required",
  "traction.revenueBand": "required", "traction.customers": "advisory",
  decisionMaker: "required", mission: "required", source: "required",
  "doc.deck": "required", "doc.financials": "required", "doc.registration": "required", "doc.feasibility": "advisory", "doc.es": "advisory",
  providerKind: "required", "mandate.sectors": "required", "mandate.countries": "required", "mandate.stages": "required", "mandate.ticket": "required",
  "mandate.instruments": "required", "mandate.exclusions": "advisory", "mandate.timeline": "advisory",
};

export const STANDARD_MATCHING: DrConfig["matching"] = [
  { field: "sector", mandatory: true },
  { field: "country", mandatory: true },
  { field: "stage", mandatory: false },
  { field: "ticket", mandatory: true },
  { field: "instrument", mandatory: true },
  { field: "exclusions", mandatory: true },
];

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * A new event's Deal Room, as approved: the standard settings, dates drawn from the event's own, and no missions.
 * Applications stay closed until the lead names at least one mission (`dealRoomReady`).
 */
export function starterConfig(event: Pick<EventRecord, "id" | "name" | "startDate" | "endDate" | "brand">, today: string, at: string, by: string): DrConfig {
  const close = addDays(event.startDate, -14);
  return {
    eventId: event.id,
    refPrefix: refPrefixFor(event),
    missions: [],
    tracks: [],
    sources: STANDARD_SOURCES,
    providerKinds: STANDARD_PROVIDER_KINDS,
    sectors: STANDARD_SECTORS,
    countries: STANDARD_COUNTRIES,
    rubric: STANDARD_RUBRIC,
    matching: STANDARD_MATCHING,
    fields: STANDARD_FIELDS,
    ordering: "criteria",
    rules: {
      appOpen: today,
      appClose: close < today ? addDays(event.startDate, -1) : close,
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
      conversionEnd: addDays(event.endDate, 182),
      retentionMonths: 12,
      dayStart: "09:00",
      dayEnd: "17:30",
    },
    freezeDate: addDays(event.startDate, -7),
    secondReview: { decline: true, askAbove: 10_000_000 },
    seekerFee: { amount: 0, currency: "USD", reminderDays: 3 },
    multiplePerOrg: true,
    rooms: {},
    sessionRooms: [],
    log: [{ at, by, what: "Deal Room enabled with the standard settings" }],
  };
}

/** References start with the event's short mark (EAGC), else its initials: letters and digits, 2 to 6 of them. */
export function refPrefixFor(event: Pick<EventRecord, "name" | "brand">): string {
  const mark = (event.brand.logoText || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (mark.length >= 2) return mark.slice(0, 6);
  const initials = event.name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).map((w) => w[0] ?? "").join("");
  return (initials.length >= 2 ? initials : "EV").slice(0, 6);
}

/** What still stops applications opening, in the lead's words; empty when the Deal Room can take them. */
export function dealRoomGaps(cfg: DrConfig): string[] {
  const gaps: string[] = [];
  if (!cfg.missions.length) gaps.push("Name at least one mission");
  if (!cfg.rules.appOpen || !cfg.rules.appClose) gaps.push("Set when applications open and close");
  else if (cfg.rules.appClose < cfg.rules.appOpen) gaps.push("Applications close before they open");
  const weights = cfg.rubric.assessment.reduce((n, c) => n + c.weight, 0);
  if (weights !== 100) gaps.push(`The assessment weights add up to ${weights}, not 100`);
  return gaps;
}
