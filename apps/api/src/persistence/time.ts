/**
 * The rules keep time as Nairobi wall-clock strings ("YYYY-MM-DD HH:MM"); PostgreSQL keeps instants (timestamptz)
 * and calendar dates (date). Nairobi has had no daylight saving since 1942 and sits at UTC+03:00, so the
 * conversion is exact both ways (backend-plan.md, Time and jobs).
 */
import { nairobiNow } from "@excursia/domain/ctx";

const WALL = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "2027-02-16 10:40" (Nairobi) → the instant. A bare date is that day's midnight in Nairobi. */
export function toInstant(wall: string): Date {
  const m = WALL.exec(wall);
  if (m) return new Date(`${m[1]}T${m[2]}:${m[3]}:00+03:00`);
  if (DAY.test(wall)) return new Date(`${wall}T00:00:00+03:00`);
  throw new Error(`Not a Nairobi time: ${JSON.stringify(wall)}`);
}

/** The instant → "2027-02-16 10:40" (Nairobi). */
export const fromInstant = (at: Date): string => nairobiNow(at);

/** "2027-02-15" → a value for a `date` column (Prisma reads and writes those at UTC midnight). */
export function toDay(day: string): Date {
  if (!DAY.test(day)) throw new Error(`Not a calendar date: ${JSON.stringify(day)}`);
  return new Date(`${day}T00:00:00Z`);
}

/** A `date` column's value → "2027-02-15". */
export const fromDay = (d: Date): string => d.toISOString().slice(0, 10);
