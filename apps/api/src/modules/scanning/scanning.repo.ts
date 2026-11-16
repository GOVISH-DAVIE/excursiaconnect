/**
 * The desk's data (M2.2): enrolled devices, staff PINs, the badge list, and each scan written once.
 *
 * A scan is one transaction: the event's lock taken shared (so it never interleaves with a Deal Room command that
 * writes delegates, which takes it exclusive, while scans don't wait for each other), the delegate's row locked,
 * the verdict decided on what is stored now, then the delegate, the day's arrival and the scan written together. A
 * scan whose id is already stored changes nothing and answers what was stored.
 */
import type { Db, Prisma } from "@excursia/db";
import { deskVerdict, type DeskVerdict } from "@excursia/domain/core/desk";
import type { Delegate } from "@excursia/domain/types";

/** The roles that work the desk: the Deal Room's `liveboard` capability. */
export const DESK_ROLES = ["Lead", "Operations", "Coordinator"];

export type ScanToRecord = { id: string; eventId: string; deviceId: string; userId: string; code: string; at: Date; local: string; offline: boolean };
export type Recorded = { id: string; verdict: "allow" | "deny"; outcome: string; reason: string; name: string | null; organisation: string | null; duplicate: boolean };

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function createScanningRepo(db: Db) {
  return {
    /** The event and its dates, if it has a Deal Room. */
    async event(eventId: string) {
      const e = await db.event.findFirst({ where: { id: eventId, drConfig: { isNot: null } }, select: { id: true, name: true, startDate: true, endDate: true } });
      return e ? { id: e.id, name: e.name, startDate: isoDay(e.startDate), endDate: isoDay(e.endDate) } : null;
    },

    /** This user on this event's desk team, if they are on it. */
    deskStaff: (userId: string, eventId: string) =>
      db.drStaff.findFirst({ where: { userId, eventId, active: true, role: { in: DESK_ROLES } }, select: { id: true, role: true, record: true } }),

    /** Everyone who may sign in on the event's scanners, and whether they have set a PIN. */
    async operators(eventId: string) {
      const staff = await db.drStaff.findMany({ where: { eventId, active: true, role: { in: DESK_ROLES }, userId: { not: null } }, orderBy: { id: "asc" }, select: { id: true, role: true, userId: true, record: true } });
      const pins = await db.scannerPin.findMany({ where: { userId: { in: staff.map((s) => s.userId!) } }, select: { userId: true } });
      return staff.map((s) => ({ id: s.id, userId: s.userId!, role: s.role, name: (s.record as { name?: string }).name ?? s.role, pinSet: pins.some((p) => p.userId === s.userId) }));
    },

    /* ----- devices ----- */

    enrol: (d: { eventId: string; name: string; secretHash: string; createdBy: string }) => db.scannerDevice.create({ data: d }),
    devices: (eventId: string) => db.scannerDevice.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } }),
    device: (id: string) => db.scannerDevice.findUnique({ where: { id } }),
    seen: (id: string, at: Date) => db.scannerDevice.updateMany({ where: { id }, data: { lastSeenAt: at } }),

    /** Retired: it can't be signed in on again, and whoever is signed in on it now is signed out. */
    retire: (id: string, at: Date) =>
      db.$transaction([
        db.scannerDevice.updateMany({ where: { id, retiredAt: null }, data: { retiredAt: at } }),
        db.session.updateMany({ where: { scanDeviceId: id, revokedAt: null }, data: { revokedAt: at } }),
      ]),

    /** A wrong PIN on this device: counted, and the device locked when there are too many. */
    async deviceFailure(id: string, max: number, lockUntil: Date) {
      const d = await db.scannerDevice.update({ where: { id }, data: { pinFailures: { increment: 1 } } });
      if (d.pinFailures >= max) await db.scannerDevice.update({ where: { id }, data: { pinFailures: 0, lockedUntil: lockUntil } });
    },
    deviceSuccess: (id: string) => db.scannerDevice.update({ where: { id }, data: { pinFailures: 0 } }),

    /* ----- PINs ----- */

    pinOf: (userId: string) => db.scannerPin.findUnique({ where: { userId } }),
    setPin: (userId: string, pinHash: string, at: Date) =>
      db.scannerPin.upsert({ where: { userId }, create: { userId, pinHash, setAt: at }, update: { pinHash, setAt: at, failures: 0, lockedUntil: null } }),
    async pinFailure(userId: string, max: number, lockUntil: Date) {
      const p = await db.scannerPin.update({ where: { userId }, data: { failures: { increment: 1 } } });
      if (p.failures >= max) await db.scannerPin.update({ where: { userId }, data: { failures: 0, lockedUntil: lockUntil } });
    },
    pinSuccess: (userId: string) => db.scannerPin.update({ where: { userId }, data: { failures: 0, lockedUntil: null } }),
    userById: (id: string) => db.user.findUnique({ where: { id }, select: { id: true, kind: true, email: true, name: true, disabledAt: true, mfaGraceUntil: true } }),

    /* ----- badges and scans ----- */

    /** The event's badges with today's arrivals: the scanner's list for working offline. */
    async badges(eventId: string, day: string) {
      const [rows, arrivals] = await Promise.all([
        db.badge.findMany({ where: { eventId }, orderBy: { code: "asc" }, select: { code: true, revokedAt: true, delegate: { select: { record: true, accredited: true } } } }),
        db.arrival.findMany({ where: { eventId, day: asDate(day) }, select: { delegateId: true, at: true, delegate: { select: { badge: { select: { code: true } } } } } }),
      ]);
      const arrived = new Map(arrivals.map((a) => [a.delegate.badge?.code, a.at]));
      return rows.map((b) => {
        const d = b.delegate.record as unknown as Delegate;
        return { code: b.code, name: d.name, organisation: d.organisation, revoked: !!b.revokedAt || !!d.cancelled, accredited: b.delegate.accredited, arrivedAt: arrived.get(b.code) ?? null };
      });
    },

    async summary(eventId: string, day: string) {
      const [badges, accredited, arrivedToday] = await Promise.all([
        db.badge.count({ where: { eventId, revokedAt: null } }),
        db.delegate.count({ where: { eventId, accredited: true, badge: { revokedAt: null } } }),
        db.arrival.count({ where: { eventId, day: asDate(day) } }),
      ]);
      return { day, badges, accredited, arrivedToday };
    },

    /** One scan, recorded once (see the top of this file). `hm` formats a stored arrival's time for the verdict. */
    async record(s: ScanToRecord, event: { id: string; startDate: string; endDate: string }, hm: (d: Date) => string): Promise<Recorded> {
      const stored = async (tx: Prisma.TransactionClient | Db): Promise<Recorded | null> => {
        const row = await tx.scan.findUnique({ where: { id: s.id }, select: { eventId: true, verdict: true, reason: true, delegateId: true } });
        if (!row) return null;
        if (row.eventId !== s.eventId) throw new Error("A scan id was sent again for another event");
        const d = row.delegateId ? await tx.delegate.findUnique({ where: { id: row.delegateId }, select: { record: true } }) : null;
        const rec = d?.record as unknown as Delegate | undefined;
        return { id: s.id, verdict: row.verdict as Recorded["verdict"], outcome: "recorded", reason: row.reason, name: rec?.name ?? null, organisation: rec?.organisation ?? null, duplicate: true };
      };
      const before = await stored(db);
      if (before) return before;

      const day = s.local.slice(0, 10);
      return db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${`dr:${s.eventId}`}, 0))`;
        const found = await tx.$queryRaw<{ code: string; delegate_id: string; event_id: string; revoked_at: Date | null }[]>`
          SELECT code, delegate_id, event_id, revoked_at FROM badge WHERE lower(code) = lower(${s.code})`;
        const b = found[0];
        let delegate: { record: Prisma.JsonValue; accredited: boolean } | null = null;
        if (b) {
          await tx.$executeRaw`SELECT 1 FROM delegate WHERE id = ${b.delegate_id} FOR UPDATE`;
          delegate = await tx.delegate.findUnique({ where: { id: b.delegate_id }, select: { record: true, accredited: true } });
        }
        const rec = delegate?.record as unknown as Delegate | undefined;
        const arrival = b ? await tx.arrival.findUnique({ where: { delegateId_day: { delegateId: b.delegate_id, day: asDate(day) } } }) : null;
        const v: DeskVerdict = deskVerdict(
          b && rec ? { code: b.code, eventId: b.event_id, revoked: !!b.revoked_at || !!rec.cancelled, accredited: !!delegate?.accredited, arrivedAt: arrival ? hm(arrival.at) : null } : undefined,
          event,
          s.local,
        );

        if (b && rec && (v.accredit || v.arrive)) {
          const next: Delegate = {
            ...rec,
            accredited: true,
            status: rec.status === "Confirmed" ? "Checked in" : rec.status,
            checkIns: v.arrive && v.eventDay && !rec.checkIns.some((c) => c.day === v.eventDay) ? [...rec.checkIns, { day: v.eventDay, at: s.local.slice(11, 16), by: s.userId }] : rec.checkIns,
          };
          await tx.delegate.update({ where: { id: b.delegate_id }, data: { accredited: true, status: next.status, record: next as unknown as Prisma.InputJsonValue } });
          if (v.arrive) await tx.arrival.create({ data: { delegateId: b.delegate_id, day: asDate(day), eventId: s.eventId, at: s.at, userId: s.userId, deviceId: s.deviceId } });
          if (v.accredit)
            await tx.auditEntry.create({
              data: { actorKind: "staff", actorId: s.userId, eventId: s.eventId, entity: "delegate", entityId: b.delegate_id, action: "desk/accredit", detail: { scan: s.id, device: s.deviceId, offline: s.offline }, ip: null },
            });
        }
        const inserted = await tx.$executeRaw`INSERT INTO scan (id, event_id, device_id, user_id, post, code, delegate_id, verdict, reason, scanned_at, offline)
          VALUES (${s.id}, ${s.eventId}, ${s.deviceId}, ${s.userId}, 'dr_desk', ${s.code}, ${b?.delegate_id ?? null}, ${v.verdict}, ${v.reason}, ${s.at}, ${s.offline})
          ON CONFLICT (id) DO NOTHING`;
        // the same id sent twice at once: the other one got in first, and this one's writes go back with it
        if (inserted !== 1) throw new DuplicateScan();
        return { id: s.id, verdict: v.verdict, outcome: v.outcome, reason: v.reason, name: rec?.name ?? null, organisation: rec?.organisation ?? null, duplicate: false };
      }).catch(async (e) => {
        if (e instanceof DuplicateScan) return (await stored(db))!;
        throw e;
      });
    },
  };
}
export type ScanningRepo = ReturnType<typeof createScanningRepo>;

class DuplicateScan extends Error {}
