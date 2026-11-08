/**
 * The Exhibition module's records. Statuses that follow from time or from other records (a booth's
 * availability, a hold's expiry, an invoice being paid or overdue) are never stored: logic.ts derives them
 * from the facts below and the exhibition clock.
 */

export type BoothType = "Shell scheme" | "Space only";
export type BoothCategory = "Standard" | "Corner" | "Island" | "Premium location";
export type BoothStatus = "Available" | "Held" | "Reserved" | "Booked" | "Blocked";

export interface HallFeature {
  id: string;
  kind: "Entrance" | "Pillar" | "Loading door" | "Fire exit";
  x: number;
  y: number;
  w: number;
  d: number;
}

/** A hall, in metres. Its doors are the platform zone it belongs to, so passes keep working at the scanner. */
export interface Hall {
  id: string;
  eventId: string;
  name: string;
  zoneId: string;
  width: number;
  depth: number;
  features: HallFeature[];
}

export interface Booth {
  id: string;
  eventId: string;
  hallId: string;
  code: string;
  x: number;
  y: number;
  w: number;
  d: number;
  type: BoothType;
  category: BoothCategory;
  openSides: number;
  priceOverride?: number; // net of VAT, when agreed: a sponsorship package, a negotiated rate
  overrideNote?: string;
  blocked?: string; // why the organiser keeps it off sale
}

export type ExhibitorStatus = "Applied" | "Under review" | "Approved" | "Waitlisted" | "Declined";

/** A file's metadata; the prototype keeps no content. */
export interface ExpoDoc {
  id: string;
  name: string;
  kind: string;
  size: number;
  at: string;
}

export interface ExpoHistory {
  at: string;
  by: string; // a team member id, "exhibitor", "public" or "system"
  what: string;
}

/** A company that exhibits: what it applied with, the decision on it, and its people through linked delegates. */
export interface Exhibitor {
  id: string;
  eventId: string;
  ref: string; // NBS-EX-0012
  name: string;
  sector: string;
  country: string;
  website?: string;
  description: string;
  logo?: ExpoDoc;
  sponsorId?: string;
  contact: { name: string; title: string; email: string; phone: string };
  application: { products: string; size: string; hallId?: string; boothPref?: string; avoid?: string; at: string };
  status: ExhibitorStatus;
  statusAt: string;
  decisionNote?: string;
  history: ExpoHistory[];
}

/** A booking holds one or more booths. Its stage follows from these facts and the clock. */
export interface Booking {
  id: string;
  eventId: string;
  exhibitorId: string;
  boothIds: string[];
  heldAt: string;
  heldBy: string; // a team member id when allocated, "exhibitor" when chosen in the portal
  contract?: { version: string; name: string; title: string; at: string; paper?: boolean };
  cancelled?: { at: string; by: string; reason: string };
  history: ExpoHistory[];
}

export type InvoiceKind = "Deposit" | "Balance" | "Full" | "Extras";

export interface InvoiceLine {
  label: string;
  qty: number;
  unit: number; // net of VAT
}

/** Draft, Issued and Void are decisions, so they are stored; Part paid, Paid and Overdue follow from payments and the clock. */
export interface Invoice {
  id: string;
  eventId: string;
  exhibitorId: string;
  bookingId?: string;
  number: string; // INV-EX-0031
  kind: InvoiceKind;
  lines: InvoiceLine[];
  vatPct: number;
  issuedAt: string;
  due: string; // YYYY-MM-DD
  state: "Draft" | "Issued" | "Void";
  voidReason?: string;
}

export interface Payment {
  id: string;
  eventId: string;
  invoiceId: string;
  method: "M-Pesa" | "Bank";
  reference: string;
  amount: number;
  at: string;
  by: string;
  bankLineId?: string;
}

/** A line from the organiser's bank statement, matched to an invoice or left open with a note. */
export interface BankLine {
  id: string;
  eventId: string;
  date: string;
  reference: string;
  payer: string;
  amount: number;
  matched?: { invoiceId: string; paymentId: string; by: string; at: string };
  note?: string;
}

export interface CatalogueItem {
  id: string;
  group: "Furniture" | "Power" | "Water" | "Internet" | "AV";
  name: string;
  unit: string;
  price: number; // net of VAT
}

export interface ExpoConfig {
  eventId: string;
  rates: Record<BoothType, number>; // KES per m², net of VAT
  factors: Record<BoothCategory, number>;
  vatPct: number;
  holdHours: number;
  depositPct: number;
  depositDays: number;
  balanceDue: string; // YYYY-MM-DD
  fullInvoiceDays: number; // inside this many days of the show, one invoice in full, due at once
  cancellation: string;
  contractVersion: string;
  passPer9: number; // passes per 9 m²
  extraPass: number;
  orderDeadline: string;
  lateSurchargePct: number;
  brandingDeadline: string;
  catalogue: CatalogueItem[];
  bays: { id: string; name: string }[];
  slotMin: number;
  vehiclesPerSlot: number;
  buildUp: { from: string; to: string };
  dismantle: { from: string; to: string };
  showDays: { date: string; open: string; close: string }[];
  exhibitorOpen: string; // exhibitor passes enter from this time on show days
  log: ExpoHistory[];
}

export interface ExpoMessage {
  id: string;
  eventId: string;
  at: string;
  to: string; // an exhibitor id or a team member id
  channel: "Email" | "SMS" | "Email and SMS";
  subject: string; // what changed and the date; never private details
  link: string;
}

export interface ExpoState {
  clock: string; // YYYY-MM-DD HH:MM, forward only
  actingMemberId: string;
  configs: Record<string, ExpoConfig>;
  halls: Hall[];
  booths: Booth[];
  exhibitors: Exhibitor[];
  bookings: Booking[];
  invoices: Invoice[];
  payments: Payment[];
  bankLines: BankLine[];
  outbox: ExpoMessage[];
  seq: { exhibitor: number; invoice: number };
}
