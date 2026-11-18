/**
 * Onboarding an organiser and its events, as rules the server runs (backend-plan.md, M2.3, brought forward):
 *
 *   sign up → KYC (details, documents, the data processing agreement) → Algotech verifies or returns it
 *   → an event as a draft → submitted (only once KYC is verified) → Algotech approves with terms, asks for
 *     changes, or rejects → the organiser publishes it
 *
 * Every function is pure: it takes the record and returns the next one, or a refusal in a sentence the person can
 * act on. Who may call which (the owner, an Algotech admin) is the server's to check first.
 */
import type { EventRecord, Organiser, RateCard } from "../types";

export type Result<T> = { value: T; refusal?: undefined } | { value?: undefined; refusal: string };
const ok = <T>(value: T): Result<T> => ({ value });
const no = <T>(refusal: string): Result<T> => ({ refusal });

/** The documents Algotech checks, once per organiser and reused for every event. */
export const KYC_DOCS = ["Registration certificate", "Tax PIN certificate", "Signatory ID"] as const;
export type KycDocKind = (typeof KYC_DOCS)[number];

/** Every item Algotech checks, each of which it can return on its own (PA-2), with what it reads to see a change. */
export const KYC_ITEMS: { key: string; label: string; value: (o: Organiser) => string }[] = [
  { key: "name", label: "Registered name", value: (o) => o.name },
  { key: "registrationNo", label: "Registration number", value: (o) => o.registrationNo },
  { key: "kraPin", label: "Tax PIN", value: (o) => o.kraPin },
  { key: "address", label: "Physical address", value: (o) => o.address ?? "" },
  { key: "payoutAccount", label: "Payout account", value: (o) => o.payoutAccount },
  { key: "signatory", label: "Signatory", value: (o) => `${o.signatory?.name ?? ""}|${o.signatory?.title ?? ""}` },
  ...KYC_DOCS.map((kind) => ({ key: `doc:${kind}`, label: kind, value: (o: Organiser) => (o.kycDocs ?? []).filter((d) => d.kind === kind).map((d) => d.id).join(",") })),
  { key: "dpa", label: "Data processing agreement", value: (o) => (o.dpaSigned ? `${o.dpaSigned.by}|${o.dpaSigned.at}` : "") },
];
export const kycItem = (key: string) => KYC_ITEMS.find((i) => i.key === key);

/** KYC can be changed while it is with the organiser: before sending, or after Algotech returned it. */
export const kycEditable = (o: Organiser) => o.kycStatus === "Not submitted" || o.kycStatus === "Returned";

const KRA_PIN = /^[A-Z]\d{9}[A-Z]$/;

export function newOrganiser(o: { id: string; name: string; country: string; now: string }): Organiser {
  return {
    id: o.id,
    name: o.name,
    country: o.country,
    kycStatus: "Not submitted",
    kraPin: "",
    registrationNo: "",
    payoutAccount: "",
    // the platform's terms are Algotech's to set, on each event's approval
    licenceFee: 0,
    commissionPct: 0,
    kycDocs: [],
    createdAt: o.now,
    history: [{ at: o.now, what: "Signed up" }],
  };
}

export type KycDetails = Partial<{ name: string; registrationNo: string; kraPin: string; address: string; payoutAccount: string; signatory: { name: string; title: string } }>;

export function editKyc(o: Organiser, d: KycDetails): Result<Organiser> {
  if (!kycEditable(o)) return no(o.kycStatus === "Verified" ? "KYC is verified. Ask Algotech to reopen it to change these details." : "KYC is with Algotech for checking; it can't be changed until they answer.");
  const next = { ...o, ...d, kraPin: d.kraPin !== undefined ? d.kraPin.trim().toUpperCase() : o.kraPin };
  return ok(next);
}

export function addKycDoc(o: Organiser, doc: { id: string; kind: string; name: string; size: number; at: string }): Result<Organiser> {
  if (!kycEditable(o)) return no("KYC is with Algotech or verified; documents can't be added now.");
  if (!(KYC_DOCS as readonly string[]).includes(doc.kind)) return no("That isn't a document KYC asks for.");
  if (o.kycDocs?.some((d) => d.id === doc.id)) return ok(o);
  return ok({ ...o, kycDocs: [...(o.kycDocs ?? []), doc] });
}

export function removeKycDoc(o: Organiser, docId: string): Result<Organiser> {
  if (!kycEditable(o)) return no("KYC is with Algotech or verified; documents can't be removed now.");
  return ok({ ...o, kycDocs: (o.kycDocs ?? []).filter((d) => d.id !== docId) });
}

/** The data processing agreement, signed by typing the signatory's full name. */
export function signDpa(o: Organiser, by: string, now: string): Result<Organiser> {
  const name = by.trim();
  if (o.dpaSigned && !o.kycReturns?.dpa) return no(`The agreement was already signed by ${o.dpaSigned.by}.`);
  if (!o.signatory?.name) return no("Name the signatory first: they sign the agreement.");
  if (name.toLowerCase() !== o.signatory.name.trim().toLowerCase()) return no(`Type the signatory's full name, ${o.signatory.name}, to sign.`);
  return ok({ ...o, dpaSigned: { by: name, at: now }, history: [...(o.history ?? []), { at: now, what: `Data processing agreement signed by ${name}` }] });
}

/** What KYC still needs before it can go to Algotech; empty when it can be sent. */
export function kycGaps(o: Organiser): string[] {
  const gaps: string[] = [];
  if (!o.registrationNo.trim()) gaps.push("Registration number");
  if (!o.kraPin.trim()) gaps.push("Tax PIN");
  else if (o.country === "Kenya" && !KRA_PIN.test(o.kraPin)) gaps.push("A KRA PIN like P051234567X");
  if (!o.address?.trim()) gaps.push("Physical address");
  if (!o.payoutAccount.trim()) gaps.push("Payout account");
  if (!o.signatory?.name.trim() || !o.signatory?.title.trim()) gaps.push("Signatory's name and title");
  for (const kind of KYC_DOCS) if (!o.kycDocs?.some((d) => d.kind === kind)) gaps.push(kind);
  if (!o.dpaSigned) gaps.push("Data processing agreement, signed");
  // what Algotech returned must have changed before it goes back
  for (const [key, r] of Object.entries(o.kycReturns ?? {})) {
    const item = kycItem(key);
    if (item && item.value(o) === r.was) gaps.push(`${item.label}, as Algotech asked: ${r.note}`);
  }
  return gaps;
}

export function submitKyc(o: Organiser, now: string): Result<Organiser> {
  if (!kycEditable(o)) return no(o.kycStatus === "Verified" ? "KYC is already verified." : "KYC is already with Algotech.");
  const gaps = kycGaps(o);
  if (gaps.length) return no(`Still needed: ${gaps.join(", ")}.`);
  const again = o.kycStatus === "Returned";
  const last = again && o.kycReturns ? Object.fromEntries(Object.entries(o.kycReturns).map(([k, r]) => [k, r.note])) : undefined;
  return ok({ ...o, kycStatus: "Pending", kycNote: undefined, kycReturns: undefined, kycReturnedAt: undefined, kycLastReturns: last, history: [...(o.history ?? []), { at: now, what: again ? "KYC sent again, fixed" : "KYC sent for checking" }] });
}

/**
 * Algotech's answer (PA-2). Verified, or returned item by item: each returned item carries its own note (and an
 * optional general note); the organiser sees exactly what to fix, and can't send again until each has changed.
 */
export function decideKyc(o: Organiser, verdict: "Verified" | "Returned", note: string, by: string, now: string, items: Record<string, string> = {}): Result<Organiser> {
  if (o.kycStatus !== "Pending") return no(`KYC is ${o.kycStatus.toLowerCase()}, not waiting for a decision.`);
  const why = note.trim();
  if (verdict === "Verified") {
    if (kycGaps(o).length) return no(`It can't be verified with these missing: ${kycGaps(o).join(", ")}.`);
    return ok({ ...o, kycStatus: "Verified", kycNote: undefined, kycReturns: undefined, kycLastReturns: undefined, history: [...(o.history ?? []), { at: now, what: `KYC verified by ${by}` }] });
  }
  const returns: NonNullable<Organiser["kycReturns"]> = {};
  for (const [key, text] of Object.entries(items)) {
    const item = kycItem(key);
    if (!item) return no(`There is no KYC item called ${key}.`);
    if (!text.trim()) return no(`Say what to fix in ${item.label}.`);
    // a returned agreement is cleared below, so any signature after this one is the fix, even in the same minute
    returns[key] = { note: text.trim(), was: key === "dpa" ? "" : item.value(o) };
  }
  if (!Object.keys(returns).length && !why) return no("Mark what needs fixing, with a note for each: the organiser sees them.");
  // a returned agreement is signed again; a returned document is replaced
  const next: Organiser = { ...o, kycStatus: "Returned", kycNote: why || undefined, kycReturns: returns, kycReturnedAt: now, kycLastReturns: undefined };
  if (returns.dpa) delete next.dpaSigned;
  const labels = Object.keys(returns).map((k) => kycItem(k)!.label);
  return ok({ ...next, history: [...(o.history ?? []), { at: now, what: `KYC returned by ${by}${labels.length ? `: ${labels.join(", ")}` : ""}${why ? `. ${why}` : ""}` }] });
}

// ---------------------------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------------------------

/** An event can be edited by its organiser while it is a draft or sent back for changes. */
export const eventEditable = (e: EventRecord) => e.state === "Draft" || e.state === "Changes requested";

/**
 * The platform's starting rate card, for an organiser a super admin hasn't priced yet. The prototype's figures,
 * until Algotech's price list is decided (backend-plan.md).
 */
export const DEFAULT_RATE_CARD: RateCard = { commissionPct: 5, licenceFee: 120_000, oneOffFee: 0, gatewayFeesBorneBy: "Algotech", dealRoomAddOn: 450_000, dealRoomOnly: 650_000, deskStaff: 3 };
export const rateCardOf = (o: Organiser): RateCard => o.rateCard ?? DEFAULT_RATE_CARD;

/** The terms an approval starts from: the organiser's rate card, for this kind of event. */
export function termsFrom(card: RateCard, e: Pick<EventRecord, "kind" | "dealRoomRequest">): EventTerms {
  const dealroom = e.kind === "dealroom";
  return {
    commissionPct: card.commissionPct,
    licenceFee: card.licenceFee,
    oneOffFee: card.oneOffFee,
    gatewayFeesBorneBy: card.gatewayFeesBorneBy,
    staffCount: 0,
    stations: 0,
    dealRoom: { enabled: dealroom || !!e.dealRoomRequest, addOnPrice: dealroom ? card.dealRoomOnly : card.dealRoomAddOn, deskStaff: card.deskStaff },
  };
}

export function setRateCard(o: Organiser, card: RateCard, by: string, now: string): Result<Organiser> {
  if (card.commissionPct < 0 || card.commissionPct > 100) return no("Commission is a percentage from 0 to 100.");
  if ([card.licenceFee, card.oneOffFee, card.dealRoomAddOn, card.dealRoomOnly, card.deskStaff].some((n) => n < 0)) return no("Fees and staff can't be negative.");
  return ok({ ...o, rateCard: card, commissionPct: card.commissionPct, licenceFee: card.licenceFee, history: [...(o.history ?? []), { at: now, what: `Rate card set by ${by}: ${card.commissionPct}% commission` }] });
}

export type EventDetails = {
  kind: "summit" | "dealroom";
  timezone: string;
  currency: "KES" | "USD";
  name: string;
  tagline: string;
  venue: string;
  city: string;
  startDate: string;
  endDate: string;
  expectedAttendance: number;
  brand: { primary: string; logoText: string };
  dealRoomRequest: { lead: { name: string; email: string } } | null;
};

/** A web address from a name: lowercase words joined by hyphens. */
export const slugFor = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000) + 1;

function withDetails(e: EventRecord, d: EventDetails): EventRecord {
  const { dealRoomRequest, ...rest } = d;
  const next: EventRecord = { ...e, ...rest, days: Math.max(1, daysBetween(d.startDate, d.endDate)) };
  if (dealRoomRequest) next.dealRoomRequest = dealRoomRequest;
  else delete next.dealRoomRequest;
  return next;
}

export function newEvent(o: Organiser, d: EventDetails, ids: { id: string; slug: string }, now: string): EventRecord {
  const base: EventRecord = {
    id: ids.id,
    slug: ids.slug,
    organiserId: o.id,
    name: "",
    tagline: "",
    venue: "",
    city: "",
    startDate: "",
    endDate: "",
    days: 1,
    state: "Draft",
    commissionPct: o.commissionPct,
    oneOffFee: 0,
    licenceFee: o.licenceFee,
    gatewayFeesBorneBy: "Algotech",
    staffCount: 0,
    stations: 0,
    expectedAttendance: 0,
    brand: { primary: "#0F4C81", logoText: "" },
    registrationsByDay: [],
    history: [{ at: now, what: "Draft created" }],
  };
  return withDetails(base, d);
}

export function editEvent(e: EventRecord, d: EventDetails): Result<EventRecord> {
  if (!eventEditable(e)) return no(`The event is ${e.state.toLowerCase()}; its details can't be changed now.`);
  return ok(withDetails(e, d));
}

/** What the event still needs before Algotech can review it; empty when it can be sent. */
export function eventGaps(e: EventRecord, today: string): string[] {
  const gaps: string[] = [];
  if (!e.name.trim()) gaps.push("A name");
  if (!e.venue.trim()) gaps.push("The venue");
  if (!e.city.trim()) gaps.push("The city");
  if (!e.startDate || !e.endDate) gaps.push("The dates");
  else {
    if (e.startDate < today) gaps.push("A start date that isn't in the past");
    if (e.endDate < e.startDate) gaps.push("An end date on or after the start");
  }
  if (!(e.expectedAttendance > 0)) gaps.push("The expected attendance");
  if (e.kind === "dealroom" && !e.dealRoomRequest) gaps.push("The Deal Room lead: a Deal Room-only event is the Deal Room");
  if (e.dealRoomRequest && (!e.dealRoomRequest.lead.name.trim() || !e.dealRoomRequest.lead.email.includes("@"))) gaps.push("The Deal Room lead's name and email");
  return gaps;
}

const moved = (e: EventRecord, state: EventRecord["state"], what: string, now: string, extra: Partial<EventRecord> = {}): EventRecord => ({
  ...e,
  ...extra,
  state,
  history: [...(e.history ?? []), { at: now, what }],
});

export function submitEvent(e: EventRecord, o: Organiser, today: string, now: string): Result<EventRecord> {
  if (!eventEditable(e)) return no(`The event is ${e.state.toLowerCase()}; only a draft or one sent back for changes can be submitted.`);
  if (o.kycStatus !== "Verified") return no("Your KYC must be verified before an event can be submitted.");
  const gaps = eventGaps(e, today);
  if (gaps.length) return no(`Still needed: ${gaps.join(", ")}.`);
  return ok(moved(e, "Submitted", "Submitted for approval", now, { reviewNote: undefined }));
}

/** The platform's terms, fixed on the approval record (DA-1 for the Deal Room add-on). */
export type EventTerms = {
  commissionPct: number;
  oneOffFee: number;
  licenceFee: number;
  gatewayFeesBorneBy: "Algotech" | "Organiser";
  /** on-site staff and accreditation stations a day (PA-3) */
  staffCount: number;
  stations: number;
  /** for a Deal Room-only event, addOnPrice is the Deal Room's own price */
  dealRoom: { enabled: boolean; addOnPrice: number; deskStaff: number };
};

export type EventDecision =
  | { to: "Under review" }
  | { to: "Approved"; terms: EventTerms; note?: string }
  | { to: "Changes requested" | "Rejected"; note: string };

/** Algotech's review of a submitted event. */
export function decideEvent(e: EventRecord, o: Organiser, d: EventDecision, by: string, now: string): Result<EventRecord> {
  if (e.state !== "Submitted" && e.state !== "Under review") return no(`The event is ${e.state.toLowerCase()}, not waiting for review.`);
  if (d.to === "Under review") return e.state === "Under review" ? ok(e) : ok(moved(e, "Under review", `Under review by ${by}`, now));
  if (d.to === "Approved") {
    if (o.kycStatus !== "Verified") return no("The organiser's KYC isn't verified.");
    const t = d.terms;
    if (t.commissionPct < 0 || t.commissionPct > 100) return no("Commission is a percentage from 0 to 100.");
    if (e.kind === "dealroom" && !t.dealRoom.enabled) return no("A Deal Room-only event is approved with its Deal Room.");
    const price = `${e.currency ?? "KES"} ${t.dealRoom.addOnPrice.toLocaleString("en-KE")}`;
    const addOn = !t.dealRoom.enabled ? "" : e.kind === "dealroom" ? `, the Deal Room at ${price}` : `, with the Deal Room add-on at ${price}`;
    return ok(moved(e, "Approved", `Approved by ${by}: ${t.commissionPct}% commission${addOn}`, now, { ...t, reviewNote: d.note?.trim() || undefined }));
  }
  const why = d.note.trim();
  if (!why) return no("Write the note to the organiser: it says what to change, or why the event can't go ahead.");
  return ok(moved(e, d.to, `${d.to} by ${by}: ${why}`, now, { reviewNote: why }));
}

/** The organiser puts an approved event live: its public page and registration open. */
export function publishEvent(e: EventRecord, now: string): Result<EventRecord> {
  if (e.state !== "Approved") return no(`Only an approved event can be published; this one is ${e.state.toLowerCase()}.`);
  return ok(moved(e, "Live", "Published", now));
}
