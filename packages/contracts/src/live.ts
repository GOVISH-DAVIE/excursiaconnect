/**
 * The live board (backend-plan.md, M3.4): the summit day as it happens. Every meeting of the day by room and table,
 * who has checked in at the Deal Room desk, what needs attention now (someone late, a no-show to mark, an outcome to
 * record), and one tap to start a meeting, record its outcome or offer a no-show's slot to a pair waiting for one.
 * Phones poll every 3 seconds with the board's version and get the board again only when it changed, so two staff
 * phones agree within seconds. The day's close-out shows what the evening's report will say.
 */
import { z } from "zod";
import { OutcomeCategory } from "./sessions";

const EventId = z.string().regex(/^ev_[a-z0-9_]+$/, "an event id");
const MeetingId = z.string().regex(/^mt_[a-z0-9_]{2,80}$/, "a meeting id");
const MatchId = z.string().regex(/^mx_[a-z0-9_]{2,60}$/, "a match id");
const Wall = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "a date and time");
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date");

export const LiveParams = z.object({ eventId: EventId });
export const LiveMeetingParams = LiveParams.extend({ meetingId: MeetingId });
export const ConflictParams = LiveParams.extend({ conflictId: z.string().regex(/^cf_[a-z0-9_]{2,60}$/, "a conflict id") });
export const LiveQuery = z.object({ day: Day.optional() });

export const OutcomeEntry = z.object({
  attendance: z.enum(["Held", "No-show"]),
  noShow: z.enum(["seeker", "provider", "both"]).optional(),
  outcome: z
    .object({
      category: OutcomeCategory,
      nextAction: z.string().trim().max(300).optional(),
      owner: z.string().regex(/^st_[a-z0-9_]+$/).optional(),
      due: Day.optional(),
      notes: z.string().trim().max(2000).optional(),
      sensitive: z.boolean().optional(),
    })
    .optional(),
  /** a record already on file is replaced only from the paper sheet, with the reason */
  paper: z.string().trim().max(300).optional(),
  /** the device's own id for this record, so a repeat changes nothing (M3.5 queues offline with it) */
  clientId: z.string().regex(/^[a-z0-9_-]{4,80}$/i),
});
export type OutcomeEntry = z.infer<typeof OutcomeEntry>;
export const RefillInput = z.object({ matchId: MatchId });

/** An outcome a phone recorded while offline, with when it was recorded there (M3.5). */
export const OfflineRecord = OutcomeEntry.omit({ paper: true }).extend({ meetingId: MeetingId, at: Wall });
export type OfflineRecord = z.infer<typeof OfflineRecord>;

/** A phone's queue, sent when it reconnects: the device, when it lost the connection, and what it recorded. */
export const SyncInput = z.object({ device: z.string().trim().min(1).max(60), offlineSince: Wall.nullable(), records: z.array(OfflineRecord).max(200) });
export type SyncInput = z.infer<typeof SyncInput>;
export const SyncResult = z.object({
  results: z.array(z.object({ clientId: z.string(), meetingId: z.string(), result: z.enum(["recorded", "duplicate", "conflict", "refused"]), reason: z.string().nullable() })),
});
export type SyncResult = z.infer<typeof SyncResult>;
export const ResolveInput = z.object({ chose: z.enum(["kept", "incoming"]) });

const Party = z.object({ id: z.string(), org: z.string(), person: z.string(), arrived: z.string().nullable() });

export const LiveMeeting = z.object({
  id: z.string(),
  start: Wall,
  end: Wall,
  roomId: z.string().nullable(),
  table: z.number().int().nullable(),
  where: z.string(),
  online: z.boolean(),
  status: z.enum(["Proposed", "Confirmed", "Change requested", "Rescheduled", "In progress", "Held", "No-show", "Cancelled"]),
  /** what needs attention now: someone not checked in as it starts, a no-show to mark, an outcome to record */
  flag: z.object({ kind: z.enum(["late", "no-show", "outcome"]), missing: z.array(z.enum(["seeker", "provider"])) }).nullable(),
  seeker: Party,
  provider: Party,
  noShow: z.enum(["seeker", "provider", "both"]).nullable(),
  outcome: z
    .object({ category: OutcomeCategory, nextAction: z.string().nullable(), owner: z.string().nullable(), due: Day.nullable(), notes: z.string().nullable(), sensitive: z.boolean(), by: z.string(), at: Wall })
    .nullable(),
  /** pairs waiting for a slot that include the party who came: a no-show's slot is offered to one of them */
  refill: z.array(z.object({ matchId: z.string(), with: z.string() })),
  history: z.array(z.object({ at: Wall, what: z.string() })),
  can: z.object({ start: z.boolean(), record: z.boolean(), paper: z.boolean(), refill: z.boolean() }),
});
export type LiveMeeting = z.infer<typeof LiveMeeting>;

export const LiveBoard = z.object({
  event: z.object({ id: z.string(), name: z.string(), days: z.array(Day), now: Wall }),
  day: Day,
  inSummit: z.boolean(),
  lateMin: z.number(),
  version: z.string(),
  counts: z.object({ upcoming: z.number(), live: z.number(), held: z.number(), noShow: z.number(), arrived: z.number() }),
  rooms: z.array(z.object({ id: z.string(), name: z.string(), tables: z.number().int() })),
  meetings: z.array(LiveMeeting),
  owners: z.array(z.object({ id: z.string(), name: z.string() })),
  /** the day's close-out, as far as the records show it: what the 19:00 report will say */
  closeOut: z.object({
    checklist: z.array(z.string()),
    emphasis: z.string(),
    meetingsHeld: z.number(),
    meetingsWithoutOutcome: z.number(),
    noShows: z.number(),
    sessionsHeld: z.number(),
    sessionsWithoutAttendance: z.number(),
    sessionOutcomesOpen: z.number(),
    arrivals: z.number(),
    reportSentAt: Wall.nullable(),
  }),
  /** records from offline phones that disagree with the one on file, still for the lead to choose (M3.5) */
  conflicts: z.array(
    z.object({
      id: z.string(),
      meetingId: z.string(),
      start: Wall,
      where: z.string(),
      pair: z.string(),
      kept: z.object({ label: z.string(), by: z.string(), at: Wall }),
      incoming: z.object({ label: z.string(), by: z.string(), at: Wall, device: z.string() }),
    }),
  ),
  /** the outages phones reported this day, with what their sync did */
  incidents: z.array(z.object({ id: z.string(), startedAt: Wall, endedAt: Wall.nullable(), cause: z.string(), synced: z.number(), duplicates: z.number(), conflicts: z.number() })),
  can: z.object({ liveboard: z.boolean(), outcome: z.boolean(), schedule: z.boolean(), resolve: z.boolean() }),
});
export type LiveBoard = z.infer<typeof LiveBoard>;
