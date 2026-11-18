/**
 * The Deal Room desk (M2.2; Deal Room PRD, DO-7): a participant's badge is scanned when they arrive. The first
 * scan accredits them; on each day of the event, the first scan records their arrival, which counts for all of that
 * day's meetings and sessions. A pure rule, so the server and a scanner that is offline reach the same verdict:
 * the scanner from its badge list, the server from the database, and the server's verdict is the one kept.
 */

/** What the desk knows of a badge. `arrivedAt`: the time ("HH:MM") of its arrival on the scan's day, if any. */
export type DeskBadge = { code: string; eventId: string; revoked: boolean; accredited: boolean; arrivedAt?: string | null };
export type DeskEvent = { id: string; startDate: string; endDate: string };

export type DeskOutcome =
  /** no badge with this code */
  | "unknown"
  | "other_event"
  | "revoked"
  /** after the event's last day */
  | "over"
  /** first scan: accredited, and arrived when it is an event day */
  | "accredited"
  /** accredited before; arrived for the day */
  | "arrived"
  /** already arrived today: nothing changes */
  | "again"
  /** accredited before the event: nothing more to record until it starts */
  | "early";

export type DeskVerdict = {
  verdict: "allow" | "deny";
  outcome: DeskOutcome;
  reason: string;
  /** the scan's day, "YYYY-MM-DD", and which day of the event it is (1 = the first), when it is one */
  day: string;
  eventDay?: number;
  /** what the scan records: accreditation, an arrival for `day` */
  accredit: boolean;
  arrive: boolean;
};

const dayNumber = (event: DeskEvent, day: string) => Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${event.startDate}T12:00:00Z`)) / 86_400_000) + 1;
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });

/** The desk's verdict on a badge scanned at `now` ("YYYY-MM-DD HH:MM", event time). */
export function deskVerdict(badge: DeskBadge | undefined, event: DeskEvent, now: string): DeskVerdict {
  const day = now.slice(0, 10);
  const base = { day, accredit: false, arrive: false };
  if (!badge) return { ...base, verdict: "deny", outcome: "unknown", reason: "Unknown badge code: check it, or send them to the Deal Room team" };
  if (badge.eventId !== event.id) return { ...base, verdict: "deny", outcome: "other_event", reason: "This badge is for another event" };
  if (badge.revoked) return { ...base, verdict: "deny", outcome: "revoked", reason: "This badge is revoked: send them to the Deal Room team" };
  if (day > event.endDate) return { ...base, verdict: "deny", outcome: "over", reason: "The event is over" };
  if (day < event.startDate)
    return badge.accredited
      ? { ...base, verdict: "allow", outcome: "early", reason: `Already accredited. The Deal Room opens ${longDay(event.startDate)}` }
      : { ...base, verdict: "allow", outcome: "accredited", accredit: true, reason: `Accredited. The Deal Room opens ${longDay(event.startDate)}` };
  const eventDay = dayNumber(event, day);
  if (badge.arrivedAt) return { ...base, eventDay, verdict: "allow", outcome: "again", reason: `Already checked in today at ${badge.arrivedAt}` };
  if (!badge.accredited) return { ...base, eventDay, verdict: "allow", outcome: "accredited", accredit: true, arrive: true, reason: `Accredited and checked in for day ${eventDay}` };
  return { ...base, eventDay, verdict: "allow", outcome: "arrived", arrive: true, reason: `Checked in for day ${eventDay}` };
}
