/**
 * The Deal Room module (docs/01-Deal-Room-PRD.md). One slice of the app state, keyed by event,
 * with its own reducer (reducer.ts) and pure rules (logic.ts). Every decision, score, consent,
 * access and meeting change is kept as an entry that is never edited, only superseded.
 */

export type DrType = "seeker" | "provider";
/** The decision paper's participant model: capital providers, commercial counterparties, public and ecosystem institutions. */
export type ProviderKind =
  | "Angel investor"
  | "Venture capital"
  | "Private equity"
  | "Fund"
  | "DFI"
  | "Bank"
  | "Corporate buyer"
  | "Distributor or channel partner"
  | "Public institution"
  | "Ecosystem partner"
  | "Technology partner"
  | "Regional operator";
/** Who brings an opportunity: the paper's opportunity owners. */
export type OwnerKind = "Startup or scale-up" | "Established enterprise" | "Technology provider" | "Project sponsor";
/** The paper's eight transaction pathways; the field keeps its old name, instrument, throughout. */
export type Instrument =
  | "Equity"
  | "Debt and credit"
  | "Development and blended finance"
  | "Procurement and contracts"
  | "Strategic partnerships"
  | "Project development"
  | "Market access"
  | "Pilots and deployment";
export type Stage = "Bankable project" | "Early revenue" | "Growth" | "Expansion";
export type Currency = "USD" | "KES";

/** Application status: where the record is in the queue. Independent of the decision and readiness. */
export type AppStatus = "Lead" | "Invited" | "Draft" | "Submitted" | "In review" | "Information requested" | "Decided";
/** The paper's qualification outcomes, each with a recorded reason. */
export type Decision = "Qualified" | "Conditional" | "Referred" | "Declined";
export type Readiness = "Not ready" | "In preparation" | "Deal Room Ready";
export type VerificationState = "Not started" | "Verification pending" | "Verified" | "Declined";

export type DocKind =
  | "Pitch deck"
  | "Financial statements"
  | "Registration certificate"
  | "Feasibility study"
  | "E&S study"
  | "Beneficial owners"
  | "Signatory ID"
  | "Signed NDA"
  | "Term sheet"
  | "Commitment letter"
  | "Disbursement evidence"
  | "Purchase order or contract"
  | "Pilot or partnership agreement"
  | "Other";

export interface DrDocument {
  id: string;
  name: string;
  kind: DocKind;
  size: number; // bytes; the prototype keeps the file's metadata, never its content
  at: string;
  download: boolean; // the seeker may allow viewing only
}

export type Layer = "eligibility" | "assessment" | "readiness";

/** One score against one criterion, resting on a document or a written note. Never edited: a later entry supersedes it. */
export interface DrAssessment {
  id: string;
  layer: Layer;
  criterion: string; // rubric criterion id
  pass?: boolean; // eligibility
  score?: number; // 0 to 100
  docId?: string;
  note?: string;
  by: string; // staff id
  at: string;
}

export interface DrCondition {
  id: string;
  text: string;
  due: string; // YYYY-MM-DD
  met?: { by: string; at: string };
}

export interface DrDecisionEntry {
  id: string;
  decision: Decision;
  reason: string;
  conditions: DrCondition[];
  by: string;
  at: string;
  /** a decline, or an ask above the lead's threshold, takes effect only when a second, different decider confirms */
  needsSecond?: boolean;
  second?: { by: string; at: string };
}

export interface DrRecommendation {
  id: string;
  decision: Decision;
  reason: string;
  by: string;
  at: string;
}

export interface DrRfi {
  id: string;
  questions: string[];
  docs: DocKind[];
  by: string;
  at: string;
  response?: { text: string; docIds: string[]; at: string };
  /** the lead's handling once the request has expired unanswered */
  expiry?: { how: "Extended" | "Referred" | "Declined" | "Withdrawn"; by: string; at: string; note: string };
}

export interface DrHistory {
  at: string;
  by: string; // staff id, "applicant", "system" or "admin"
  what: string;
}

export interface Mandate {
  sectors: string[];
  countries: string[];
  stages: Stage[];
  ticketMin: number;
  ticketMax: number;
  currency: Currency;
  instruments: Instrument[];
  exclusions: string[];
  timeline: string; // typical decision timeline
}

export type KycItem = "Registration" | "Beneficial owners" | "Signatory ID";

export interface Verification {
  state: VerificationState;
  kyc: Partial<Record<KycItem, { docId: string; checked?: { by: string; at: string } }>>;
  sanctions?: { result: "Clear" | "Match found"; note?: string; by: string; at: string };
  nda?: { version: string; name: string; title: string; at: string; uploaded?: boolean };
  decided?: { by: string; at: string; reason: string };
}

export interface DrApplication {
  id: string;
  eventId: string;
  ref?: string; // issued on submit: CA3-CS-00123, CA3-FP-00045
  type: DrType;
  providerKind?: ProviderKind;
  ownerKind?: OwnerKind; // a seeker's kind of organisation
  mission: string; // mission id
  track?: string; // strategic track id, under the mission
  source: string;
  owner: string; // staff id who brought the lead
  assignee?: string; // reviewer
  org: { name: string; regNo: string; country: string; sector: string; founded?: string; website?: string };
  contact: { name: string; email: string; phone: string };
  decisionMaker: { name: string; title: string; email: string; phone: string; confirmed?: { by: string; at: string } };
  ask?: { amount: number; currency: Currency; instrument: Instrument; useOfFunds: string; stage: Stage };
  traction?: { revenueBand: string; customers: string; metrics: string };
  mandate?: Mandate;
  verification?: Verification;
  caps?: { perDay: number; perEvent: number }; // a provider's meeting caps, set at onboarding
  documents: DrDocument[];
  status: AppStatus;
  statusAt: string;
  submittedAt?: string;
  firstReviewAt?: string;
  decisions: DrDecisionEntry[];
  recommendations: DrRecommendation[];
  assessments: DrAssessment[];
  readiness: Readiness;
  readinessAt?: string;
  reReview?: { fields: string[]; at: string };
  rfis: DrRfi[];
  teaser?: { title: string; summary: string; anonymous: boolean; approved?: { by: string; at: string } };
  profileCompletedAt?: string;
  history: DrHistory[];
  delegateId?: string; // the platform badge, issued on approval or verification (a seeker's once the fee is settled)
  fee?: DrFee; // a capital seeker's participation fee, asked for on approval
  challenge?: DrChallenge; // a public institution or corporate buyer bringing a problem to solve
  invite?: { token: string; sentAt?: string };
  draftSavedAt?: string;
}

/** How the institution or buyer means to engage a solution. */
export type ChallengeRoute = "Request for proposals" | "Pilot" | "Public-private partnership" | "Direct procurement" | "Innovation challenge" | "Co-development";

/**
 * A challenge brought by a public institution or a corporate buyer: the problem, who has it, what a solution must
 * respect, what success looks like, the budget, the procurement route and how the decision is made. It is matched
 * against businesses through the same mandate as any provider, so its sectors, stages and pathways do the matching.
 */
export interface DrChallenge {
  title: string;
  problem: string;
  users: string; // who has the problem
  constraints: string;
  outcome: string; // what success looks like
  budget: string; // a range, for example USD 200k to 500k
  route: ChallengeRoute | "";
  timeline: string;
  decisionProcess: string;
}

/**
 * The participation fee a capital seeker pays once approved. Approval sends the payment link; paying, or the
 * lead waiving it, issues the badge and opens matching.
 */
export interface DrFee {
  amount: number;
  currency: Currency;
  sentAt: string; // when the payment link went out, with the decision
  reminderAt?: string; // the one reminder, after the configured days
  paid?: { at: string; method: "M-Pesa" | "Card"; reference: string; kes?: number };
  waived?: { by: string; at: string; reason: string };
}

/* ---------- matching and introductions (Cut 2) ---------- */

export type MatchField = "sector" | "country" | "stage" | "ticket" | "instrument" | "exclusions";

export interface DrIntroduction {
  items: string[]; // "teaser", "profile" or a document id
  sentAt: string;
  by: string;
  seeker?: { response: "Accepted" | "Declined"; reason?: string; at: string };
  provider?: { response: "Accepted" | "Declined"; reason?: string; at: string };
}

export interface DrMatch {
  id: string;
  eventId: string;
  seekerId: string;
  providerId: string;
  origin: "search" | "interest";
  met: MatchField[];
  missed: MatchField[];
  exclusionHit?: string;
  decision: "Suggested" | "Approved" | "Rejected" | "Deferred";
  note: string;
  by: string;
  at: string;
  override?: { by: string; at: string; reason: string }; // a re-proposed pair the lead allowed
  brief?: { text: string; agenda: string[]; editedAt: string };
  intro?: DrIntroduction;
  history: DrHistory[];
}

/** Consent: which items a seeker lets a named provider see. Withdrawal is a later entry, never a deletion. */
export interface DrConsent {
  id: string;
  seekerId: string;
  providerId: string;
  docId: string;
  granted: boolean;
  at: string;
  version: number;
}

export interface DrAccess {
  id: string;
  seekerId: string;
  item: string; // "teaser", "profile" or a document id
  viewer: string; // provider application id, staff id or "admin"
  action: "view" | "download";
  at: string;
}

/* ---------- meetings (Cut 2) ---------- */

export type MeetingStatus = "Proposed" | "Confirmed" | "Change requested" | "Cancelled" | "In progress" | "Held" | "No-show" | "Rescheduled";

/** The paper's seven meeting outcomes: what happens next, standardised. */
export type MeetingOutcome =
  | "No fit"
  | "Information requested"
  | "Follow-up meeting"
  | "Due diligence"
  | "Pilot or procurement"
  | "Financing or partnership proposal"
  | "Commitment documented";

export interface DrOutcome {
  category: MeetingOutcome;
  nextAction?: string;
  owner?: string; // staff id
  due?: string;
  notes?: string;
  sensitive?: boolean;
  by: string;
  at: string;
  clientId: string; // generated on the device, so an offline record syncs once
}

export interface DrMeeting {
  id: string;
  eventId: string;
  matchId: string;
  roomId?: string;
  table?: number;
  link?: string; // an online meeting
  start: string; // YYYY-MM-DD HH:MM
  end: string;
  flagged?: boolean; // 30 minutes for lead-sponsor or DFI meetings
  status: MeetingStatus;
  proposedAt: string;
  confirm: { seeker?: string; provider?: string };
  /**
   * A participant's request to move the meeting: the time they propose and why. The other side agrees or declines;
   * once they agree the Deal Room team books it. Until then the meeting keeps its slot, and `was` is the status it
   * returns to if the move is turned down. Older requests carry no time; the team picks one.
   */
  change?: { by: "seeker" | "provider"; reason: string; at: string; start?: string; was?: MeetingStatus; agreed?: string };
  arrivals: { seeker?: string; provider?: string };
  noShow?: "seeker" | "provider" | "both";
  outcome?: DrOutcome;
  override?: { reason: string; by: string };
  history: DrHistory[];
}

/* ---------- conversion (Cut 3) ---------- */

export type OppStage = "Follow-up" | "Diligence" | "Negotiation" | "Closed – won" | "Closed – lost";
/** The paper's commitment tiers, always reported apart. */
export type OutcomeKind = "Expression of interest" | "Indicative commitment" | "Signed commitment" | "Approved, not disbursed" | "Deployed";

export interface DrOppOutcome {
  id: string;
  kind: OutcomeKind;
  amount?: number;
  currency?: Currency;
  instrument?: Instrument;
  date: string;
  evidence: string;
  by: string;
  at: string;
}

export type CloseReason = "No fit" | "Timing" | "Terms" | "Diligence failed" | "Other";

/** A progress note: the owner's own, or a participant's reply to a status request, with any evidence they attached. */
export interface DrOppUpdate {
  id: string;
  from: "owner" | "seeker" | "provider";
  text: string;
  at: string;
  by: string;
  doc?: DrDocument;
}

/** What the seeded opportunities do after the summit, played as the demo clock passes each moment (never stored ahead of the clock). */
export type DrScriptStep =
  | { kind: "stage"; stage: OppStage; evidence: string }
  | { kind: "outcome"; outcome: Omit<DrOppOutcome, "id" | "by" | "at"> }
  | { kind: "update"; from: DrOppUpdate["from"]; text: string; doc?: DrDocument }
  | { kind: "next"; nextAction: string; due: string }
  | { kind: "close"; reason: CloseReason; note: string }
  | { kind: "review"; note: string }
  | { kind: "request"; to: "seeker" | "provider" };
export interface DrScripted {
  at: string;
  oppId: string;
  by: string;
  step: DrScriptStep;
}

export interface DrOpportunity {
  id: string;
  eventId: string;
  meetingId: string;
  matchId: string;
  owner: string;
  stage: OppStage;
  stageDates: Partial<Record<OppStage, string>>;
  nextAction: string;
  due: string;
  outcomes: DrOppOutcome[];
  stageEvidence?: Partial<Record<OppStage, string>>; // what justified entering each stage (PRD Conversion, stages table)
  updates: DrOppUpdate[];
  requests: { id: string; to: "seeker" | "provider"; at: string; by: string; answeredAt?: string }[];
  reviews: { month: string; by: string; at: string; note: string }[];
  closed?: { reason: CloseReason; note: string; by: string; at: string };
  history: DrHistory[];
}

/* ---------- people, rules, logs ---------- */

/**
 * Bouer sources and qualifies (lead, reviewers); Excursia Connect coordinates matching, meetings, the floor and
 * reporting (coordinators, operations); Momentum oversees, read-only (the paper's delivery responsibilities).
 */
export type DrRole = "Lead" | "Reviewer" | "Operations" | "Coordinator" | "Oversight";

export interface DrStaff {
  id: string;
  eventId: string;
  name: string;
  org?: "Bouer" | "Excursia Connect" | "Momentum"; // who they work for, per the paper's governance
  email: string;
  role: DrRole;
  canDecide: boolean;
  mfa: boolean;
  active: boolean;
  addedAt: string;
  revokedAt?: string;
}

export interface DrRubric {
  eligibility: { id: string; text: string }[];
  assessment: { id: string; text: string; weight: number }[];
  readiness: { id: string; text: string }[];
}

export interface DrRules {
  appOpen: string; // YYYY-MM-DD
  appClose: string;
  profileDays: number; // working days after approval
  rfiDays: number;
  introDays: number;
  meetingMin: number;
  bufferMin: number;
  flaggedMin: number;
  seekerCap: number; // meetings per seeker across the event
  providerCapDay: number; // default per provider per day, overridable per provider
  confirmHours: number; // request-to-confirm window before the slot
  lateMin: number; // a party later than this is a no-show
  conversionEnd: string;
  retentionMonths: number;
  dayStart: string; // "09:00"
  dayEnd: string; // "17:30"
}

export interface DrConfig {
  eventId: string;
  missions: { id: string; code: string; name: string; description: string }[];
  tracks: { id: string; code: string; name: string; missionId: string; description: string }[]; // the paper's six strategic tracks
  sources: string[];
  providerKinds: ProviderKind[];
  sectors: string[];
  countries: string[];
  rubric: DrRubric;
  matching: { field: MatchField; mandatory: boolean }[];
  /** the form builder in prototype form: each standard field required or advisory */
  fields: Record<string, "required" | "advisory">;
  ordering: "criteria" | "readiness";
  rules: DrRules;
  freezeDate: string;
  secondReview: { decline: boolean; askAbove: number }; // USD
  seekerFee: { amount: number; currency: Currency; reminderDays: number }; // 0 charges nothing
  multiplePerOrg: boolean;
  rooms: Record<string, { tables: number; from: string; to: string }>;
  sessionRooms: string[]; // the presentation area and roundtable room: sessions only, no meeting tables
  log: DrHistory[];
}

export interface DrException {
  id: string;
  eventId: string;
  at: string;
  by: string;
  kind: "Cap override" | "Re-proposed pair" | "Expired request" | "Change after freeze" | "Paper entry over an outcome" | "Other";
  reason: string;
  ref: string;
}

export interface DrSupportGrant {
  id: string;
  appId: string;
  to: string; // the Algotech person
  reason: string;
  by: string;
  at: string;
  expires: string;
}

export interface DrMessage {
  id: string;
  eventId: string;
  at: string;
  to: string; // application id or staff id
  channel: "Email" | "SMS" | "Email and SMS";
  subject: string; // the action and the date only; never private data
  link: string;
  status: "Delivered" | "Sent" | "Failed";
}

/** An outcome recorded on a device with no connection, waiting to sync. */
export interface DrQueued {
  device: string;
  meetingId: string;
  outcome: DrOutcome;
  attendance: "Held" | "No-show";
  noShow?: "seeker" | "provider" | "both";
}

export interface DrConflict {
  id: string;
  meetingId: string;
  kept: DrOutcome;
  incoming: DrOutcome & { device: string };
  resolved?: { by: string; at: string; chose: "kept" | "incoming" };
}

export interface DrIncident {
  id: string;
  startedAt: string;
  endedAt?: string;
  cause: string;
  synced: number;
  duplicates: number;
  conflicts: number;
}

/** The decision paper's activity formats beyond the curated one-to-one meeting. */
export type SessionFormat =
  | "Investment opportunity presentation"
  | "Reverse pitch or mandate briefing"
  | "Corporate procurement and supplier discovery"
  | "Government challenge session"
  | "Project finance presentation"
  | "VC, PE and growth-capital clinic"
  | "DFI and blended-finance roundtable"
  | "Technology deployment and pilot meeting"
  | "Market-entry and cross-border partnership"
  | "Deal advisory and readiness clinic"
  | "Negotiation and deal progression";

/**
 * A programmed session in one of the paper's formats: hosted, in a room, with invited participants who accept or
 * decline, attendance taken on the day, and an outcome per participant in the paper's seven categories.
 */
export interface DrSession {
  id: string;
  eventId: string;
  format: SessionFormat;
  title: string;
  start: string; // "YYYY-MM-DD HH:MM"
  end: string;
  roomId: string;
  host?: string; // the application presenting or hosting: a seeker pitching, a provider briefing, an institution's challenge
  track?: string; // strategic track id
  owner: string; // the staff member running it
  invitees: string[]; // application ids
  responses: Record<string, { answer: "Accepted" | "Declined"; at: string }>;
  attended: string[];
  outcomes: { appId: string; category: MeetingOutcome; note: string; by: string; at: string }[];
  cancelled?: { by: string; at: string; reason: string };
  history: DrHistory[];
}

export interface DealRoomState {
  clock: string; // the demo clock, "YYYY-MM-DD HH:MM"; every Deal Room rule reads "now" from here
  actingStaffId: string; // the staff member the workspace is signed in as (prototype stand-in for sign-in)
  configs: Record<string, DrConfig>;
  staff: DrStaff[];
  apps: DrApplication[];
  matches: DrMatch[];
  consents: DrConsent[];
  access: DrAccess[];
  meetings: DrMeeting[];
  sessions: DrSession[]; // programmed sessions in the paper's formats, beyond one-to-ones
  opportunities: DrOpportunity[];
  exceptions: DrException[];
  grants: DrSupportGrant[];
  outbox: DrMessage[];
  queue: DrQueued[]; // offline records on operations devices
  conflicts: DrConflict[];
  incidents: DrIncident[];
  offline: boolean;
  liveWindow?: { declaredAt: string; by: string; rota: string[] };
  archivedAt?: string;
  script?: DrScripted[];
  seq: { cs: number; fp: number };
  adminLog: DrHistory[]; // staff provisioning and support access
}
