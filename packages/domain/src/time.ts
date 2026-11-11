/**
 * Time helpers shared by the platform and the Deal Room. Times are "HH:MM" strings, stamps are
 * "YYYY-MM-DD HH:MM" in the event's local time (Nairobi), so they compare as strings.
 */

/** Two sessions on the same day whose times cross. */
export function overlaps(a: { day: number; start: string; end: string }, b: { day: number; start: string; end: string }) {
  return a.day === b.day && a.start < b.end && b.start < a.end;
}

/** "11:30" as minutes from midnight. */
export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Minutes from midnight as "HH:MM". */
export const fromMin = (m: number) => `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`;

/** Two intervals on the same stamp scale cross once each is widened by the buffer (minutes). */
export function crosses(aStart: string, aEnd: string, bStart: string, bEnd: string, buffer = 0) {
  return aStart < addMinutes(bEnd, buffer) && bStart < addMinutes(aEnd, buffer);
}

/** A stamp moved by n minutes. Stamps are local wall time; the arithmetic treats them as UTC so no zone shifts. */
export function addMinutes(stamp: string, n: number) {
  const d = new Date(stamp.replace(" ", "T") + ":00Z");
  d.setUTCMinutes(d.getUTCMinutes() + n);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export const addDays = (stamp: string, n: number) => addMinutes(stamp, n * 24 * 60);

/** Whole days from a to b (b later is positive). */
export function daysBetween(a: string, b: string) {
  const ms = new Date(b.slice(0, 10) + "T00:00:00Z").getTime() - new Date(a.slice(0, 10) + "T00:00:00Z").getTime();
  return Math.round(ms / 86400000);
}

/** "2027-03-16 10:40" as "Tue 16 Mar, 10:40"; withTime false drops the time. */
export function fmtStamp(stamp: string, withTime = true) {
  const d = new Date(stamp.slice(0, 10) + "T12:00:00Z");
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return withTime && stamp.length > 10 ? `${day}, ${stamp.slice(11, 16)}` : day;
}

/** A date with its year, for dates that can fall in another year than the event: "18 September 2028". */
export const fmtLong = (date: string) => new Date(date.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
