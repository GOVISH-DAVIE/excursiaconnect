export type EventState =
  | "Draft"
  | "Submitted"
  | "Under review"
  | "Changes requested"
  | "Approved"
  | "Live"
  | "Closed"
  | "Rejected";

export type DelegateStatus =
  | "Pending"
  | "Awaiting payment"
  | "Confirmed"
  | "Checked in"
  | "Waitlisted"
  | "Cancelled"
  | "Refunded";

export type Category =
  | "Speaker"
  | "Panelist"
  | "Sponsor"
  | "Exhibitor"
  | "VIP"
  | "General Delegate";

export type PaymentMethod = "mpesa" | "card" | "bank";

export interface Organiser {
  id: string;
  name: string;
  kycStatus: "Pending" | "Verified" | "Returned";
  kraPin: string;
  registrationNo: string;
  payoutAccount: string;
  licenceFee: number;
  commissionPct: number;
}

export interface Tier {
  id: string;
  eventId: string;
  name: string;
  price: number;
  currency: "KES" | "USD";
  cap: number;
  sold: number;
  visibility: "public" | "hidden" | "invite";
  approval: "auto" | "organiser";
  entitlements: string[]; // zone ids, 'dinner', 'stream', 'all-days', 'day-1'
  description: string;
}

export interface Zone {
  id: string;
  eventId: string;
  name: string;
  capacity: number;
  occupancy: number;
  window?: string;
}

export interface Room {
  id: string;
  zoneId: string;
  name: string;
  capacity: number;
}

export interface Session {
  id: string;
  eventId: string;
  day: number; // 1-based
  start: string; // "09:00"
  end: string;
  title: string;
  track?: string;
  roomId?: string; // undefined = plenary / social item
  kind: "plenary" | "breakout" | "break" | "social";
  speakers: string[];
  capacity?: number;
  enrolled: number;
  attended: number;
  rating?: number;
  status: "scheduled" | "live" | "ended";
  walkIns: boolean;
  slidesUploaded?: boolean;
  comments?: string[];
}

export interface Delegate {
  id: string;
  eventId: string;
  name: string;
  email: string;
  phone: string;
  organisation: string;
  jobTitle: string;
  country: string;
  category: Category;
  tierId: string;
  status: DelegateStatus;
  accredited: boolean;
  checkIns: { day: number; at: string }[];
  zoneLog: { zoneId: string; direction: "in" | "out"; at: string; verdict: "allow" | "deny" | "override"; reason?: string }[];
  sessions: string[];
  bookable: boolean;
  slots?: { day: number; time: string; location: string; bookedBy?: string }[];
  grants?: string[]; // manual zone grants
  badgeCode: string; // what the QR encodes
  cancelled?: boolean;
}

export interface Order {
  id: string;
  eventId: string;
  delegateId: string;
  tierId: string;
  gross: number;
  discount: number;
  gatewayFee: number;
  commission: number;
  net: number;
  method: PaymentMethod;
  reference: string;
  status: "paid" | "pending" | "refunded";
  at: string;
}

export interface EventRecord {
  id: string;
  slug: string;
  organiserId: string;
  name: string;
  tagline: string;
  venue: string;
  city: string;
  startDate: string;
  endDate: string;
  days: number;
  state: EventState;
  reviewNote?: string;
  commissionPct: number;
  oneOffFee: number;
  licenceFee: number;
  gatewayFeesBorneBy: "Algotech" | "Organiser";
  staffCount: number;
  stations: number;
  expectedAttendance: number;
  brand: { primary: string; logoText: string };
  registrationsByDay: number[];
}

export interface Message {
  id: string;
  from: string;
  to: string;
  body: string;
  at: string;
}

export interface AppState {
  organisers: Organiser[];
  events: EventRecord[];
  tiers: Tier[];
  zones: Zone[];
  rooms: Room[];
  sessions: Session[];
  delegates: Delegate[];
  orders: Order[];
  messages: Message[];
  currentDelegateId?: string;
}
