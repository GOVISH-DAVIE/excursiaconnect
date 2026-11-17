/**
 * Sessions (backend-plan.md, M3.3): the decision paper's formats beyond one-to-one meetings, such as presentations,
 * reverse pitches, challenge sessions, clinics and roundtables. The lead, operations and coordinators plan them in the session
 * rooms and invite approved or verified participants; each participant accepts or declines from their schedule.
 * On the day attendance is taken and every attendee leaves with an outcome. A session someone accepted holds their
 * time: no meeting is booked over it, and no session over their meetings.
 */
import { z } from "zod";

const EventId = z.string().regex(/^ev_[a-z0-9_]+$/, "an event id");
const SessionId = z.string().regex(/^ses_[a-z0-9_]{1,60}$/, "a session id");
const AppId = z.string().regex(/^dr_[a-z0-9_]{2,60}$/, "an application id");
const Wall = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "a date and time");
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date");

export const SessionsParams = z.object({ eventId: EventId });
export const SessionParams = SessionsParams.extend({ sessionId: SessionId });

export const SESSION_FORMATS = [
  "Investment opportunity presentation",
  "Reverse pitch or mandate briefing",
  "Corporate procurement and supplier discovery",
  "Government challenge session",
  "Project finance presentation",
  "VC, PE and growth-capital clinic",
  "DFI and blended-finance roundtable",
  "Technology deployment and pilot meeting",
  "Market-entry and cross-border partnership",
  "Deal advisory and readiness clinic",
  "Negotiation and deal progression",
] as const;
export const SessionFormat = z.enum(SESSION_FORMATS);

export const OUTCOMES = ["No fit", "Information requested", "Follow-up meeting", "Due diligence", "Pilot or procurement", "Financing or partnership proposal", "Commitment documented"] as const;
export const OutcomeCategory = z.enum(OUTCOMES);

/** A session as planned: the room is one of the session rooms; a format that needs a host names one. */
export const SessionInput = z.object({
  format: SessionFormat,
  title: z.string().trim().max(140),
  start: Wall,
  end: Wall,
  roomId: z.string().regex(/^[a-z0-9_]{1,40}$/),
  host: AppId.nullable(),
  track: z.string().max(40).nullable(),
});
export type SessionInput = z.infer<typeof SessionInput>;
export const InviteInput = z.object({ appIds: z.array(AppId).min(1).max(200) });
export const CancelSessionInput = z.object({ reason: z.string().trim().max(300) });
export const AttendInput = z.object({ appId: AppId, present: z.boolean() });
export const OutcomeInput = z.object({ appId: AppId, category: OutcomeCategory, note: z.string().trim().max(500) });
export const RespondSessionInput = z.object({ answer: z.enum(["Accepted", "Declined"]) });

export const SessionPhase = z.enum(["Planned", "In progress", "Held", "Cancelled"]);
export type SessionPhase = z.infer<typeof SessionPhase>;

/** Someone in a session: its host, or an invitee with their answer, attendance and outcome. */
export const SessionPerson = z.object({
  id: z.string(),
  org: z.string(),
  label: z.string(),
  host: z.boolean(),
  answer: z.enum(["Accepted", "Declined"]).nullable(),
  attended: z.boolean(),
  outcome: z.object({ category: OutcomeCategory, note: z.string(), at: Wall }).nullable(),
});
export type SessionPerson = z.infer<typeof SessionPerson>;

export const SessionRow = z.object({
  id: z.string(),
  format: SessionFormat,
  short: z.string(),
  title: z.string(),
  start: Wall,
  end: Wall,
  roomId: z.string(),
  room: z.string(),
  host: z.object({ id: z.string(), org: z.string() }).nullable(),
  track: z.object({ id: z.string(), name: z.string() }).nullable(),
  owner: z.string(),
  phase: SessionPhase,
  cancelled: z.object({ at: Wall, reason: z.string() }).nullable(),
  people: z.array(SessionPerson),
  counts: z.object({ accepted: z.number(), declined: z.number(), waiting: z.number(), attended: z.number(), outcomesOpen: z.number() }),
  history: z.array(z.object({ at: Wall, who: z.string(), what: z.string() })),
  can: z.object({ change: z.boolean(), attend: z.boolean(), outcome: z.boolean() }),
});
export type SessionRow = z.infer<typeof SessionRow>;

/** A participant who may host or be invited: approved or verified, with the formats it may host. */
export const SessionCandidate = z.object({
  id: z.string(),
  org: z.string(),
  label: z.string(),
  sector: z.string(),
  track: z.string().nullable(),
  hosts: z.array(z.enum(["seeker", "provider", "partner", "challenge"])),
});
export type SessionCandidate = z.infer<typeof SessionCandidate>;

export const SessionsBoard = z.object({
  event: z.object({ id: z.string(), name: z.string(), days: z.array(Day), now: Wall }),
  dayStart: z.string(),
  dayEnd: z.string(),
  rooms: z.array(z.object({ id: z.string(), name: z.string() })),
  formats: z.array(z.object({ format: SessionFormat, short: z.string(), what: z.string(), hostKind: z.enum(["seeker", "provider", "partner", "challenge", "none"]) })),
  tracks: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
  sessions: z.array(SessionRow),
  candidates: z.array(SessionCandidate),
  can: z.object({ plan: z.boolean(), attend: z.boolean(), outcome: z.boolean() }),
});
export type SessionsBoard = z.infer<typeof SessionsBoard>;

/** Who could still be invited to one session, with why they couldn't attend it if they are busy then. */
export const InviteOptions = z.array(z.object({ id: z.string(), org: z.string(), label: z.string(), sector: z.string(), onTrack: z.boolean(), busy: z.string().nullable() }));
export type InviteOptions = z.infer<typeof InviteOptions>;

/** One of the participant's sessions, from their side: hosting, or invited with their answer. */
export const MySession = z.object({
  id: z.string(),
  title: z.string(),
  format: z.string(),
  what: z.string(),
  start: Wall,
  end: Wall,
  room: z.string(),
  host: z.string(),
  role: z.enum(["host", "invited"]),
  answer: z.enum(["Accepted", "Declined"]).nullable(),
  cancelled: z.object({ at: Wall, reason: z.string() }).nullable(),
  attended: z.boolean(),
  /** why they can't accept now, if they can't: a meeting or another session then, or it has started */
  blocked: z.string().nullable(),
  can: z.object({ accept: z.boolean(), decline: z.boolean() }),
});
export type MySession = z.infer<typeof MySession>;
