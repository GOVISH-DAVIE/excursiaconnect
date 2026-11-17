/**
 * Scheduling (backend-plan.md, M3.2). Operations, the lead and coordinators turn accepted introductions into
 * meetings: a slot proposed by hand or a schedule drafted by auto-propose, moved, cancelled, and moves the
 * participants agreed accepted. Each participant confirms its own meetings, asks to move one to a time when both
 * sides and a table are free, answers the other side's request, and adds a confirmed meeting to its calendar.
 * No room, table or person is ever booked twice: the rules check under the event's lock, and the database's
 * exclusion constraint is the last word.
 */
import { z } from "zod";

const EventId = z.string().regex(/^ev_[a-z0-9_]+$/, "an event id");
const MeetingId = z.string().regex(/^mt_[a-z0-9_]{2,80}$/, "a meeting id");
const MatchId = z.string().regex(/^mx_[a-z0-9_]{2,60}$/, "a match id");
const RoomId = z.string().regex(/^[a-z0-9_]{1,40}$/, "a room id");
const Slug = z.string().regex(/^[a-z0-9-]{2,80}$/, "an event's address");
/** A wall-clock time in Nairobi, as the rules keep it: YYYY-MM-DD HH:MM. */
const Wall = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "a date and time");
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date");

export const ScheduleParams = z.object({ eventId: EventId });
export const MeetingParams = ScheduleParams.extend({ meetingId: MeetingId });
export const MyMeetingsParams = z.object({ slug: Slug });
export const MyMeetingParams = MyMeetingsParams.extend({ meetingId: MeetingId });
export const SlotsQuery = z.object({ matchId: MatchId, day: Day, flagged: z.enum(["1", "0"]).optional(), meetingId: MeetingId.optional() });
export const TimesQuery = z.object({ day: Day });

export const MeetingStatus = z.enum(["Proposed", "Confirmed", "Change requested", "Rescheduled", "In progress", "Held", "No-show", "Cancelled"]);
export type MeetingStatus = z.infer<typeof MeetingStatus>;

/** Where a meeting is: a room and table, or online. */
const Spot = z.object({ roomId: RoomId.optional(), table: z.number().int().min(1).max(50).optional(), link: z.url().max(300).optional() });

/** The team proposes one slot for a pair; a cap is gone over only with a reason (logged as an exception). */
export const ProposeInput = Spot.extend({ matchId: MatchId, start: Wall, flagged: z.boolean().optional(), override: z.string().trim().max(300).optional() });
export type ProposeInput = z.infer<typeof ProposeInput>;
export const AutoProposeInput = z.object({ limit: z.number().int().min(1).max(500).default(500) });
export const MoveInput = Spot.extend({ start: Wall, override: z.string().trim().max(300).optional() });
export type MoveInput = z.infer<typeof MoveInput>;
export const ReasonInput = z.object({ reason: z.string().trim().max(300) });
/** A participant asks to move a meeting: the time it proposes and why, for the other side. */
export const AskMoveInput = z.object({ start: Wall, reason: z.string().trim().max(300) });
export const AnswerMoveInput = z.object({ agree: z.boolean(), reason: z.string().trim().max(300).optional() });

const PartyRef = z.object({ id: z.string(), org: z.string(), label: z.string() });

/** A move a participant asked for: the time it proposes, why, and whether the other side agreed. */
const Change = z.object({ by: z.enum(["seeker", "provider"]), reason: z.string(), at: Wall, start: Wall.nullable(), agreed: Wall.nullable() });

/** One meeting as the team sees it. */
export const MeetingRow = z.object({
  id: z.string(),
  matchId: z.string(),
  start: Wall,
  end: Wall,
  roomId: z.string().nullable(),
  table: z.number().int().nullable(),
  online: z.boolean(),
  where: z.string(),
  status: MeetingStatus,
  /** an unconfirmed proposal past its confirm-by time: its slot is free again */
  lapsed: z.boolean(),
  confirmBy: Wall.nullable(),
  flagged: z.boolean(),
  seeker: PartyRef.extend({ confirmed: Wall.nullable() }),
  provider: PartyRef.extend({ confirmed: Wall.nullable() }),
  change: Change.nullable(),
  override: z.string().nullable(),
  history: z.array(z.object({ at: Wall, who: z.string(), what: z.string() })),
});
export type MeetingRow = z.infer<typeof MeetingRow>;

/** A pair both sides accepted, with no meeting holding a slot. */
export const ReadyPair = z.object({ matchId: z.string(), seeker: PartyRef, provider: PartyRef, acceptedAt: Wall, flagged: z.boolean() });
export type ReadyPair = z.infer<typeof ReadyPair>;

export const Schedule = z.object({
  event: z.object({ id: z.string(), name: z.string(), days: z.array(Day), now: Wall }),
  rules: z.object({ meetingMin: z.number(), bufferMin: z.number(), flaggedMin: z.number(), seekerCap: z.number(), providerCapDay: z.number(), confirmHours: z.number(), dayStart: z.string(), dayEnd: z.string() }),
  rooms: z.array(z.object({ id: z.string(), name: z.string(), tables: z.number().int(), from: z.string(), to: z.string() })),
  times: z.array(z.string()),
  ready: z.array(ReadyPair),
  meetings: z.array(MeetingRow),
  caps: z.object({
    providers: z.array(PartyRef.extend({ perDay: z.number(), perEvent: z.number(), days: z.array(z.number()), total: z.number() })),
    seekers: z.array(PartyRef.extend({ total: z.number() })),
  }),
  can: z.object({ schedule: z.boolean(), override: z.boolean() }),
});
export type Schedule = z.infer<typeof Schedule>;

/** For the team's slot picker: on one day, each start time with the tables free for the pair, or why none is. */
export const SlotOptions = z.object({
  day: Day,
  times: z.array(
    z.object({
      time: z.string(),
      /** why the pair can't meet then at all: a party is busy, the time is outside the day, it has passed */
      problem: z.string().nullable(),
      /** caps the slot would go over: allowed only with a reason */
      caps: z.array(z.string()),
      free: z.array(z.object({ roomId: z.string(), table: z.number().int(), label: z.string() })),
    }),
  ),
});
export type SlotOptions = z.infer<typeof SlotOptions>;

export const Proposed = z.object({ proposed: z.number().int(), left: z.number().int() });
export type Proposed = z.infer<typeof Proposed>;

/** One of the participant's meetings, from its own side. */
export const MyMeeting = z.object({
  id: z.string(),
  side: z.enum(["seeker", "provider"]),
  start: Wall,
  end: Wall,
  where: z.string(),
  online: z.boolean(),
  link: z.string().nullable(),
  status: MeetingStatus,
  lapsed: z.boolean(),
  confirmBy: Wall.nullable(),
  mine: z.object({ confirmed: Wall.nullable() }),
  theirs: z.object({ confirmed: Wall.nullable() }),
  other: z.object({ org: z.string(), person: z.string(), label: z.string() }),
  /** a move asked for, by either side; `byMe` says whose */
  change: Change.omit({ by: true }).extend({ byMe: z.boolean() }).nullable(),
  can: z.object({ confirm: z.boolean(), move: z.boolean(), answer: z.boolean(), calendar: z.boolean() }),
});
export type MyMeeting = z.infer<typeof MyMeeting>;

export const MyMeetings = z.object({
  event: z.object({ name: z.string(), slug: z.string(), days: z.array(Day), now: Wall }),
  meetings: z.array(MyMeeting),
});
export type MyMeetings = z.infer<typeof MyMeetings>;

/** The times on one day when both sides and a table are free, for a move. */
export const MoveTimes = z.object({ day: Day, times: z.array(z.string()) });
export type MoveTimes = z.infer<typeof MoveTimes>;
