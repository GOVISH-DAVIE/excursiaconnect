/**
 * The live board's own reads (M3.4): the day's arrivals at the Deal Room desk, which the scanners write (M2.2), and
 * a cheap fingerprint of everything the board shows, so a phone polling every 3 seconds is answered "nothing
 * changed" without loading the Deal Room.
 */
import { createHash } from "node:crypto";
import type { Db } from "@excursia/db";
import { toDay, toInstant } from "../../persistence/time";

export function createLiveRepo(db: Db) {
  return {
    /** The summit days, from the event's own columns: a version check needs them and nothing else of the event. */
    days: async (eventId: string) => {
      const e = await db.event.findUnique({ where: { id: eventId }, select: { startDate: true, endDate: true } });
      if (!e) return [];
      const out: string[] = [];
      for (let t = e.startDate.getTime(); t <= e.endDate.getTime(); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
      return out;
    },

    /** Who checked in at the desk on a day: the delegate and the time of their first scan. */
    arrivals: async (eventId: string, day: string) => (await db.arrival.findMany({ where: { eventId, day: toDay(day) }, select: { delegateId: true, at: true } })).map((a) => ({ delegateId: a.delegateId, at: a.at })),

    /**
     * The board's version for a day: the day's meetings and sessions (how many, and the last change to any), the
     * desk's arrivals, the settings (the evening report), the minute, since late and no-show flags follow the clock,
     * and the person asking, since the board is shown by role.
     */
    version: async (eventId: string, day: string, minute: string, who: string) => {
      const from = toInstant(`${day} 00:00`);
      const to = new Date(from.getTime() + 86_400_000);
      const [row] = await db.$queryRaw<{ m: string; s: string; a: string; c: string }[]>`
        select
          (select count(*)::text || ':' || coalesce(max(updated_at)::text, '') from dr_meeting where event_id = ${eventId} and starts_at >= ${from} and starts_at < ${to}) as m,
          (select count(*)::text || ':' || coalesce(max(updated_at)::text, '') from dr_session where event_id = ${eventId} and starts_at >= ${from} and starts_at < ${to}) as s,
          (select count(*)::text || ':' || coalesce(max(at)::text, '') from arrival where event_id = ${eventId} and day = ${toDay(day)}) as a,
          (select coalesce(updated_at::text, '') from dr_config where event_id = ${eventId}) as c`;
      // who is asking is part of it: the board shows each person what their role may do and see (sensitive notes)
      return createHash("sha256").update(`${row.m}|${row.s}|${row.a}|${row.c}|${minute}|${who}`).digest("base64url").slice(0, 22);
    },
  };
}
export type LiveRepo = ReturnType<typeof createLiveRepo>;
