/**
 * Scanning at the Deal Room desk (backend-plan.md, M2.2).
 *
 * - Devices: someone on the desk's team (the lead, operations, a coordinator), signed in with their password and
 *   authenticator, enrols the tablet in front of them. It gets a random secret in an HttpOnly cookie, kept here as
 *   a hash: only an enrolled device takes PINs. Retiring it signs out whoever is on it.
 * - PINs: each of them sets their own six digits from the workspace, hashed like a password. Five wrong PINs lock
 *   that person's PIN for 15 minutes; ten wrong PINs on one device lock the device for 15 minutes.
 * - The scanner's session (auth.service.ts, `scannerSession`) only scans, for this event on this device, and an
 *   hour without a scan ends it.
 * - Scans: each with an id the device made, so sending it again (a retry, the offline queue) records it once. The
 *   device's own time is kept when it is plausible (up to a day old, not ahead of the server); otherwise the
 *   server's. The verdict is the server's, from the desk rule (domain core/desk.ts) the device also runs offline.
 */
import { createHash, randomBytes } from "node:crypto";
import type { BadgeList, DevicesView, DeviceView, EnrolDeviceInput, ScanInput, ScannerHome, ScanResults, ScannerSignInInput } from "@excursia/contracts/scan";
import { nairobiNow } from "@excursia/domain/ctx";
import { HttpError } from "../../http/errors";
import { checkPassword, hashPassword } from "../../security/passwords";
import { sameDigest } from "../../security/secrets";
import type { AuthService, ClientMeta, Issued, Resolved } from "../auth/auth.service";
import type { ScanningRepo } from "./scanning.repo";

const MIN = 60_000;
const PIN_TRIES = 5;
const DEVICE_TRIES = 10;
const LOCK_MS = 15 * MIN;
/** How old a scan from the offline queue may be, and how far ahead of the server a device's clock may run. */
const MAX_AGE_MS = 24 * 60 * MIN;
const MAX_AHEAD_MS = 2 * MIN;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hm = (d: Date) => nairobiNow(d).slice(11, 16);

/** The device cookie's value: its id and its secret. */
export type DeviceCookie = { id: string; secret: string };
export const readDeviceCookie = (value: string | undefined): DeviceCookie | null => {
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(value ?? "");
  return m ? { id: m[1], secret: m[2] } : null;
};

export type ScanningDeps = { repo: ScanningRepo; auth: AuthService; now: () => Date };

export function createScanningService({ repo, auth, now }: ScanningDeps) {
  async function event(eventId: string) {
    const e = await repo.event(eventId);
    if (!e) throw new HttpError("not_found", "This event has no Deal Room.");
    return e;
  }

  /** Someone on this event's desk team, signed in to the workspace. */
  async function deskTeam(session: Resolved, eventId: string) {
    const s = await repo.deskStaff(session.user.id, eventId);
    if (!s) throw new HttpError("forbidden", "Only the lead, operations and coordinators work the Deal Room desk.");
    return s;
  }

  /** The device behind the cookie, if it is enrolled, current, and the secret is right. */
  async function deviceOf(cookie: DeviceCookie | null) {
    if (!cookie) return null;
    const d = await repo.device(cookie.id);
    if (!d || d.retiredAt || !sameDigest(d.secretHash, sha256(cookie.secret))) return null;
    return d;
  }

  const deviceView = (d: Awaited<ReturnType<ScanningRepo["devices"]>>[number], here: string | null): DeviceView => ({
    id: d.id,
    name: d.name,
    createdAt: d.createdAt.toISOString(),
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    retired: !!d.retiredAt,
    locked: !!d.lockedUntil && d.lockedUntil > now(),
    here: d.id === here,
  });

  async function home(cookie: DeviceCookie | null, session: Resolved | null): Promise<ScannerHome> {
    const d = await deviceOf(cookie);
    if (!d) throw new HttpError("not_found", "This device isn't an enrolled scanner. Someone on the desk team enrols it from the workspace.");
    const e = await event(d.eventId);
    const ops = await repo.operators(e.id);
    const me = session?.scanner?.deviceId === d.id ? ops.find((o) => o.userId === session.user.id) : undefined;
    return {
      device: { id: d.id, name: d.name },
      event: { id: e.id, name: e.name, startDate: e.startDate, endDate: e.endDate },
      operators: ops.map((o) => ({ id: o.id, name: o.name, role: o.role, pinSet: o.pinSet })),
      signedIn: me ? { name: me.name } : null,
    };
  }

  return {
    readDeviceCookie,

    /* ----- the workspace ----- */

    async devices(session: Resolved, eventId: string, cookie: DeviceCookie | null): Promise<DevicesView> {
      const e = await event(eventId);
      await deskTeam(session, eventId);
      const [devices, pin, here] = await Promise.all([repo.devices(eventId), repo.pinOf(session.user.id), deviceOf(cookie)]);
      return { event: { id: e.id, name: e.name }, devices: devices.map((d) => deviceView(d, here?.id ?? null)), pinSet: !!pin };
    },

    /** Enrols the device in front of the caller: the answer carries the cookie's value, for the controller only. */
    async enrol(session: Resolved, eventId: string, input: EnrolDeviceInput): Promise<{ view: DeviceView; cookie: string }> {
      await event(eventId);
      await deskTeam(session, eventId);
      const secret = randomBytes(32).toString("base64url");
      const d = await repo.enrol({ eventId, name: input.name, secretHash: sha256(secret), createdBy: session.user.id });
      return { view: deviceView(d, d.id), cookie: `${d.id}.${secret}` };
    },

    async retire(session: Resolved, eventId: string, deviceId: string) {
      await deskTeam(session, eventId);
      const d = await repo.device(deviceId);
      if (!d || d.eventId !== eventId) throw new HttpError("not_found", "No such scanner on this event.");
      await repo.retire(deviceId, now());
    },

    /** The caller's own PIN, for every scanner they may use. */
    async setPin(session: Resolved, pin: string) {
      if (session.user.kind !== "staff" && session.user.kind !== "admin") throw new HttpError("forbidden", "Scanner PINs are for staff.");
      await repo.setPin(session.user.id, await hashPassword(pin), now());
    },

    /* ----- the scanner ----- */

    home,

    async signIn(cookie: DeviceCookie | null, input: ScannerSignInInput, meta: ClientMeta): Promise<{ issued: Issued; home: ScannerHome }> {
      const d = await deviceOf(cookie);
      if (!d) throw new HttpError("not_found", "This device isn't an enrolled scanner.");
      const at = now();
      if (d.lockedUntil && d.lockedUntil > at) throw new HttpError("rate_limited", `Too many wrong PINs on this scanner. Try again after ${hm(d.lockedUntil)}.`);
      const op = (await repo.operators(d.eventId)).find((o) => o.id === input.staffId);
      const pin = op ? await repo.pinOf(op.userId) : null;
      if (!op || !pin) throw new HttpError("forbidden", "Set your scanner PIN in the workspace first.");
      if (pin.lockedUntil && pin.lockedUntil > at) throw new HttpError("rate_limited", `Your PIN is locked after too many wrong tries. Try again after ${hm(pin.lockedUntil)}.`);
      if (!(await checkPassword(pin.pinHash, input.pin))) {
        await repo.pinFailure(op.userId, PIN_TRIES, new Date(at.getTime() + LOCK_MS));
        await repo.deviceFailure(d.id, DEVICE_TRIES, new Date(at.getTime() + LOCK_MS));
        throw new HttpError("unauthenticated", "That PIN isn't right.");
      }
      const user = await repo.userById(op.userId);
      if (!user || user.disabledAt) throw new HttpError("forbidden", "This account is disabled.");
      await Promise.all([repo.pinSuccess(op.userId), repo.deviceSuccess(d.id), repo.seen(d.id, at)]);
      const issued = await auth.scannerSession(user, { eventId: d.eventId, deviceId: d.id }, meta);
      return { issued, home: { ...(await home(cookie, null)), signedIn: { name: op.name } } };
    },

    /** The scanner's session, still for a current device and a member of the desk team. */
    async scanner(session: Resolved, eventId: string) {
      if (!session.scanner || session.scanner.eventId !== eventId) throw new HttpError("forbidden", "This scanner is signed in for another event.");
      const d = await repo.device(session.scanner.deviceId);
      if (!d || d.retiredAt) throw new HttpError("unauthenticated", "This scanner was retired. Enrol it again from the workspace.");
      await deskTeam(session, eventId);
      return { event: await event(eventId), deviceId: d.id };
    },

    async badges(session: Resolved, eventId: string): Promise<BadgeList> {
      await this.scanner(session, eventId);
      const local = nairobiNow(now());
      const badges = await repo.badges(eventId, local.slice(0, 10));
      return { day: local.slice(0, 10), now: local, badges: badges.map((b) => ({ ...b, arrivedAt: b.arrivedAt ? hm(b.arrivedAt) : null })) };
    },

    /** A batch of scans, in the order they were made: each recorded once, with the server's verdict. */
    async scan(session: Resolved, eventId: string, scans: ScanInput[]): Promise<ScanResults> {
      const { event: e, deviceId } = await this.scanner(session, eventId);
      const received = now();
      const ordered = [...scans].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      const results = [];
      for (const s of ordered) {
        const told = new Date(s.at);
        const at = received.getTime() - told.getTime() > MAX_AGE_MS || told.getTime() - received.getTime() > MAX_AHEAD_MS ? received : told;
        results.push(await repo.record({ id: s.id, eventId, deviceId, userId: session.user.id, code: s.code, at, local: nairobiNow(at), offline: s.offline }, e, hm));
      }
      await repo.seen(deviceId, received);
      // answered in the order sent, whatever order they were recorded in
      const byId = new Map(results.map((r) => [r.id, r]));
      return { results: scans.map((s) => byId.get(s.id)!), summary: await repo.summary(eventId, nairobiNow(received).slice(0, 10)) };
    },
  };
}
export type ScanningService = ReturnType<typeof createScanningService>;
