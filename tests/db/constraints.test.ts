/**
 * What the database itself guarantees (backend-plan.md, M0.2): tested as the app role the website uses, against
 * the test database. Skipped where TEST_DATABASE_URL is not set. Each run uses its own event id and removes what it
 * made, except audit rows, which the app role cannot delete; that is the point of one of the tests.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createDb } from "@/server/db";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("database constraints, as the app role", () => {
  const db = createDb(url, 2);
  const run = `t${Date.now().toString(36)}`;
  const ev = `ev_${run}`;

  /** Postgres's error code from a failed query, wherever Prisma's driver adapter puts it. */
  const pgCode = async (p: Promise<unknown>) => {
    try {
      await p;
      return "ok";
    } catch (e) {
      const err = e as { code?: string; meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string; code?: string } } }; cause?: { code?: string } };
      return err.meta?.driverAdapterError?.cause?.originalCode ?? err.cause?.code ?? err.meta?.code ?? err.code ?? "error";
    }
  };
  const busy = (id: string, key: string, from: string, to: string, active = true) =>
    db.$executeRaw`INSERT INTO dr_busy (id, event_id, source, source_id, key, slot, active)
                   VALUES (${id}, ${ev}, 'meeting', ${id}, ${key}, tstzrange(${from}::timestamptz, ${to}::timestamptz), ${active})`;

  beforeAll(async () => {
    await db.organiser.create({ data: { id: `org_${run}`, name: "Test organiser", record: {} } });
    await db.event.create({ data: { id: ev, organiserId: `org_${run}`, slug: `test-${run}`, name: "Test", startDate: new Date("2027-02-15"), endDate: new Date("2027-02-18"), state: "Live", record: {} } });
  });

  afterAll(async () => {
    await db.$executeRaw`DELETE FROM dr_busy WHERE event_id = ${ev}`;
    await db.badge.deleteMany({ where: { eventId: ev } });
    await db.delegate.deleteMany({ where: { eventId: ev } });
    await db.tier.deleteMany({ where: { eventId: ev } });
    await db.drCounter.deleteMany({ where: { eventId: ev } });
    await db.event.delete({ where: { id: ev } });
    await db.organiser.delete({ where: { id: `org_${run}` } });
    await db.$disconnect();
  });

  test("two overlapping bookings of the same room and table: the second is refused (23P01)", async () => {
    expect(await pgCode(busy(`${run}_a`, "room:r_dr1:1", "2027-02-16 10:00+03", "2027-02-16 10:25+03"))).toBe("ok");
    expect(await pgCode(busy(`${run}_b`, "room:r_dr1:1", "2027-02-16 10:20+03", "2027-02-16 10:45+03"))).toBe("23P01");
  });

  test("back to back is fine, and so is the same time in another room", async () => {
    expect(await pgCode(busy(`${run}_c`, "room:r_dr1:1", "2027-02-16 10:25+03", "2027-02-16 10:50+03"))).toBe("ok");
    expect(await pgCode(busy(`${run}_d`, "room:r_dr2:1", "2027-02-16 10:00+03", "2027-02-16 10:25+03"))).toBe("ok");
  });

  test("one person cannot be in two places at once", async () => {
    expect(await pgCode(busy(`${run}_e`, "app:dr_cs50", "2027-02-16 11:00+03", "2027-02-16 11:25+03"))).toBe("ok");
    expect(await pgCode(busy(`${run}_f`, "app:dr_cs50", "2027-02-16 11:10+03", "2027-02-16 11:35+03"))).toBe("23P01");
  });

  test("a lapsed (inactive) proposal no longer holds its slot", async () => {
    expect(await pgCode(busy(`${run}_g`, "room:r_dr3:1", "2027-02-16 12:00+03", "2027-02-16 12:25+03", false))).toBe("ok");
    expect(await pgCode(busy(`${run}_h`, "room:r_dr3:1", "2027-02-16 12:00+03", "2027-02-16 12:25+03"))).toBe("ok");
  });

  test("50 overlapping bookings sent at once: exactly one wins", async () => {
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) => pgCode(busy(`${run}_burst${i}`, "room:r_dr4:1", "2027-02-17 09:00+03", "2027-02-17 09:25+03"))));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => r === "23P01")).toHaveLength(49);
  });

  test("a badge code is unique whatever its case", async () => {
    await db.tier.create({ data: { id: `t_${run}`, eventId: ev, name: "Deal Room", price: 0, currency: "USD", record: {} } });
    for (const n of [1, 2]) await db.delegate.create({ data: { id: `d_${run}_${n}`, eventId: ev, tierId: `t_${run}`, name: `Person ${n}`, category: "Deal Room", status: "Confirmed", record: {} } });
    expect(await pgCode(db.badge.create({ data: { code: `EXC-DR-${run}`.toUpperCase(), delegateId: `d_${run}_1`, eventId: ev } }))).toBe("ok");
    expect(await pgCode(db.badge.create({ data: { code: `exc-dr-${run}`.toLowerCase(), delegateId: `d_${run}_2`, eventId: ev } }))).toBe("23505");
  });

  test("the app may add to the audit log but never change or remove it", async () => {
    const entry = await db.auditEntry.create({ data: { actorKind: "system", eventId: ev, entity: "test", entityId: run, action: "test/insert" } });
    expect(await pgCode(db.auditEntry.update({ where: { id: entry.id }, data: { action: "test/tampered" } }))).toBe("42501");
    expect(await pgCode(db.auditEntry.delete({ where: { id: entry.id } }))).toBe("42501");
  });

  test("the app cannot change the schema", async () => {
    expect(await pgCode(db.$executeRawUnsafe(`CREATE TABLE app_should_not_${run} (id int)`))).toBe("42501");
  });

  test("a counter hands out each number once, under concurrency", async () => {
    await db.drCounter.create({ data: { eventId: ev, kind: "cs", n: 0 } });
    const next = () => db.$queryRaw<{ n: number }[]>`UPDATE dr_counter SET n = n + 1 WHERE event_id = ${ev} AND kind = 'cs' RETURNING n`;
    const got = (await Promise.all(Array.from({ length: 20 }, next))).map((r) => r[0].n).sort((a, b) => a - b);
    expect(got).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});
