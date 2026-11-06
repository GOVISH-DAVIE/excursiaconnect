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
  | "Refund requested"
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
  paused?: boolean; // sales stopped, the tier still shown
  saleFrom?: string; // ISO dates; empty = open now / until the event
  saleTo?: string;
}

/** A field on the registration form beyond the standard ones (OR-4). */
export interface FormField {
  id: string;
  eventId: string;
  label: string;
  type: "text" | "textarea" | "select" | "file";
  required: boolean;
  showTo: "Everyone" | Category[];
  options?: string[]; // for select
  help?: string;
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
  answers?: Record<string, string>; // custom form fields, by field id
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
  links?: SocialLinks;
  hashtag?: string;
  profileLocked?: boolean; // OS-10: delegates can no longer edit their profile
  closedAt?: string; // OR-17
  history?: { at: string; what: string }[]; // approval history
}

/** A reconciliation exception the nightly job raised (PA-6). */
export interface Exception {
  ref: string;
  issue: string;
  raised: string;
  resolved?: { at: string; how: string };
}

/** A campaign the organiser sent to a segment (OS-5). */
export interface Campaign {
  id: string;
  eventId: string;
  at: string;
  segment: string;
  channel: "Email" | "SMS" | "Email and SMS";
  subject: string;
  recipients: number;
}

export interface Message {
  id: string;
  from: string;
  to: string;
  body: string;
  at: string;
}

export type Role = "Owner" | "Staff" | "Finance" | "Accreditation" | "Speaker";

export type Capability =
  | "event.edit"
  | "event.submit"
  | "event.programme"
  | "delegates.view"
  | "delegates.edit"
  | "delegates.approve"
  | "delegates.badge"
  | "delegates.export"
  | "delegates.campaign"
  | "access.grant"
  | "access.scan"
  | "access.override"
  | "money.view"
  | "money.markPaid"
  | "money.refund"
  | "money.payout"
  | "sessions.own"
  | "sessions.all"
  | "team.invite"
  | "team.roles";

export interface TeamMember {
  id: string;
  organiserId: string;
  name: string;
  email: string;
  role: Role;
  eventIds: string[]; // empty = every event of the organiser
  responsibility?: string; // what they look after: Delegates, Exhibition, Programme, Sponsors
  status: "Active" | "Invited";
  lastActive?: string;
}

/** A scanning shift: one post (the desk, or a zone entrance or exit) on one day and slot. */
export interface Shift {
  id: string;
  eventId: string;
  day: number;
  slot: "Morning" | "Afternoon";
  post: string; // "desk" | "<zoneId>:in" | "<zoneId>:out"
  memberId?: string;
}

/** Website and social links, for the event, a speaker or a sponsor. Shown as text links in their names. */
export interface SocialLinks {
  website?: string;
  linkedin?: string;
  x?: string;
  instagram?: string;
  facebook?: string;
  youtube?: string;
}
export const SOCIAL_KEYS: { key: keyof SocialLinks; label: string }[] = [
  { key: "website", label: "Website" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "x", label: "X" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "youtube", label: "YouTube" },
];

/** A sponsor or partner shown on the public page, grouped by tier. The logo is a data URL in the prototype. */
export interface Sponsor {
  id: string;
  eventId: string;
  name: string;
  tier: "Headline" | "Gold" | "Silver" | "Partner";
  url?: string; // the website; the logo links here
  logo?: string;
  links?: SocialLinks;
}

/** What the organiser adds to a speaker named in the programme: a photo, who they are, where to find them. */
export interface SpeakerProfile {
  eventId: string;
  name: string;
  photo?: string;
  organisation?: string;
  jobTitle?: string;
  links?: SocialLinks;
}

export interface AppState {
  formFields: FormField[];
  exceptions: Exception[];
  campaigns: Campaign[];
  payoutsPaid: string[]; // payout ids the admin has run (PA-7)
  banners: Record<string, string>; // eventId -> image data URL
  floorPlans: Record<string, string>; // eventId -> the venue's own plan; replaces the drawn schematic
  galleries: Record<string, string[]>; // eventId -> photographs of the event or its last edition, in order
  speakerProfiles: SpeakerProfile[];
  sponsors: Sponsor[];
  team: TeamMember[];
  shifts: Shift[];
  grants: Record<Role, Capability[]>;
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
