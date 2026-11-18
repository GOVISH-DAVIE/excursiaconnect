/**
 * Scanning at the Deal Room desk (backend-plan.md, M2.2). A tablet or phone is enrolled as one event's scanner by
 * someone on the desk's team (the lead, operations, a coordinator); each of them signs in on it with their own
 * PIN. The scanner keeps the event's badge list for when the connection drops, queues what it scans offline, and
 * sends every scan with an id it made itself, so a scan sent twice is recorded once. The server's verdict is kept.
 */
import { z } from "zod";

export const ScanEventParams = z.object({ eventId: z.string().regex(/^ev_[a-z0-9_]{2,60}$/) });
export const DeviceParams = ScanEventParams.extend({ deviceId: z.string().uuid() });

/* ----- devices and PINs, from the team workspace ----- */

export const EnrolDeviceInput = z.object({ name: z.string().trim().min(1, "name the device, for example Desk tablet 1").max(60) });
export type EnrolDeviceInput = z.infer<typeof EnrolDeviceInput>;

export const DeviceView = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string().nullable(),
  retired: z.boolean(),
  locked: z.boolean(),
  /** this browser is the device */
  here: z.boolean(),
});
export type DeviceView = z.infer<typeof DeviceView>;

export const DevicesView = z.object({ event: z.object({ id: z.string(), name: z.string() }), devices: z.array(DeviceView), pinSet: z.boolean() });
export type DevicesView = z.infer<typeof DevicesView>;

/** Six digits, not one repeated nor a straight run: 000000, 123456 and 654321 are the first a stranger tries. */
export const SetPinInput = z.object({
  pin: z
    .string()
    .regex(/^\d{6}$/, "six digits")
    .refine((p) => !/^(\d)\1{5}$/.test(p) && !"0123456789".includes(p) && !"9876543210".includes(p), "choose six digits that aren't all the same or in a row"),
});
export type SetPinInput = z.infer<typeof SetPinInput>;

/* ----- the scanner itself ----- */

export const ScannerSignInInput = z.object({ staffId: z.string().max(80), pin: z.string().regex(/^\d{6}$/, "six digits") });
export type ScannerSignInInput = z.infer<typeof ScannerSignInInput>;

/** What the enrolled device shows before and after a PIN: whose device it is, and who may sign in on it. */
export const ScannerHome = z.object({
  device: z.object({ id: z.string(), name: z.string() }),
  event: z.object({ id: z.string(), name: z.string(), startDate: z.string(), endDate: z.string() }),
  operators: z.array(z.object({ id: z.string(), name: z.string(), role: z.string(), pinSet: z.boolean() })),
  signedIn: z.object({ name: z.string() }).nullable(),
});
export type ScannerHome = z.infer<typeof ScannerHome>;

/** One badge as the desk sees it; `arrivedAt` is today's arrival ("HH:MM"), if any. */
export const DeskBadgeRow = z.object({
  code: z.string(),
  name: z.string(),
  organisation: z.string(),
  revoked: z.boolean(),
  accredited: z.boolean(),
  arrivedAt: z.string().nullable(),
});
export type DeskBadgeRow = z.infer<typeof DeskBadgeRow>;

/** The event's badges for the day, for the scanner to decide on while offline. */
export const BadgeList = z.object({ day: z.string(), now: z.string(), badges: z.array(DeskBadgeRow) });
export type BadgeList = z.infer<typeof BadgeList>;

/** One scan as the device sends it: its own id, the code, and when it was scanned (ISO), queued offline or not. */
export const ScanInput = z.object({ id: z.string().uuid(), code: z.string().trim().min(1).max(60), at: z.string().datetime({ offset: true }), offline: z.boolean().default(false) });
export type ScanInput = z.infer<typeof ScanInput>;
export const ScanBatch = z.object({ scans: z.array(ScanInput).min(1).max(200) });
export type ScanBatch = z.infer<typeof ScanBatch>;

export const ScanResult = z.object({
  id: z.string(),
  verdict: z.enum(["allow", "deny"]),
  outcome: z.string(),
  reason: z.string(),
  name: z.string().nullable(),
  organisation: z.string().nullable(),
  /** this id was recorded before: the stored verdict, nothing changed */
  duplicate: z.boolean(),
});
export type ScanResult = z.infer<typeof ScanResult>;

/** The day so far: participants accredited, and arrived today. */
export const DeskSummary = z.object({ day: z.string(), badges: z.number().int(), accredited: z.number().int(), arrivedToday: z.number().int() });
export const ScanResults = z.object({ results: z.array(ScanResult), summary: DeskSummary });
export type ScanResults = z.infer<typeof ScanResults>;
