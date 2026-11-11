/**
 * M0.3: the demo seed and real reference data, kept apart.
 * - The mappers lose nothing: the prototype's seed → rows → the rules' state again, in memory and through
 *   PostgreSQL.
 * - The guards: the demo seed never runs in production or beside real events; a reference import never lands on
 *   demo data; a bad reference file is refused with every problem named.
 * The database parts use the test database as the app role and skip where TEST_DATABASE_URL is not set.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createDb } from "@excursia/db";
import { seed } from "@excursia/domain/seed";
import type { DealRoomState } from "@excursia/domain/dealroom/types";
import { createDealRoomRepo } from "../src/modules/dealroom/dealroom.repo";
import { dealRoomFromRows, dealRoomToRows } from "../src/modules/dealroom/dealroom.mapper";
import { coreFromRows, coreToRows } from "../src/modules/events/events.mapper";
import { createEventsRepo } from "../src/modules/events/events.repo";
import { ReferenceFile } from "../src/modules/reference/reference.schema";
import { createReferenceRepo } from "../src/modules/reference/reference.repo";
import { createReferenceService, ReferenceRefused } from "../src/modules/reference/reference.service";
import { createSeedRepo, type SeedRepo } from "../src/modules/seed/seed.repo";
import { createSeedService, demoRows, SeedRefused } from "../src/modules/seed/seed.service";
import { fromInstant, toInstant } from "../src/persistence/time";

const EV = "ev_ca3";
const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** The Deal Room as the database keeps it: arrays in id order, without what only the prototype has. */
const PROTOTYPE_ONLY = new Set(["clock", "actingStaffId", "queue", "conflicts", "offline", "script"]);
function comparable(dr: DealRoomState) {
  return Object.fromEntries(
    Object.entries(dr)
      .filter(([k]) => !PROTOTYPE_ONLY.has(k))
      .map(([k, v]) => [k, Array.isArray(v) ? byId(v as { id: string }[]) : v]),
  );
}
const expectedCore = {
  organisers: byId(seed.organisers),
  events: byId(seed.events),
  tiers: byId(seed.tiers),
  delegates: byId(seed.delegates),
};
const sortCore = (c: typeof expectedCore) => ({ organisers: byId(c.organisers), events: byId(c.events), tiers: byId(c.tiers), delegates: byId(c.delegates) });

describe("Nairobi time", () => {
  test("wall-clock strings and instants convert both ways exactly", () => {
    expect(toInstant("2027-02-16 10:40").toISOString()).toBe("2027-02-16T07:40:00.000Z");
    expect(fromInstant(toInstant("2027-02-16 00:05"))).toBe("2027-02-16 00:05");
    expect(fromInstant(new Date("2027-02-15T21:30:00Z"))).toBe("2027-02-16 00:30");
  });
});

describe("the mappers, in memory", () => {
  test("the core records come back as they went in", () => {
    const rows = coreToRows(seed, { demo: true });
    expect(sortCore(coreFromRows(rows as never))).toEqual(expectedCore);
    expect(rows.badges).toHaveLength(seed.delegates.filter((d) => !d.cancelled).length);
  });

  test("the Deal Room comes back as it went in", () => {
    const rows = dealRoomToRows(seed.dealRoom, EV, seed.dealRoom.clock);
    const stored = {
      ...rows,
      outbox: rows.outbox.map((o) => ({ ...o, eventId: o.eventId ?? null, createdAt: o.createdAt as Date })),
    };
    expect(comparable(dealRoomFromRows(EV, stored as never, seed.dealRoom.clock))).toEqual(comparable(seed.dealRoom));
  });

  test("summary columns come from the rules' own selectors", () => {
    const rows = dealRoomToRows(seed.dealRoom, EV, seed.dealRoom.clock);
    const paid = rows.apps.filter((a) => a.feeState === "paid");
    expect(paid.length).toBeGreaterThan(0);
    expect(rows.apps.every((a) => a.pipelineStatus)).toBe(true);
    expect(rows.counters).toEqual([
      { eventId: EV, kind: "cs", n: seed.dealRoom.seq.cs },
      { eventId: EV, kind: "fp", n: seed.dealRoom.seq.fp },
    ]);
  });

  test("every meeting that holds a slot holds its room table and both people", () => {
    const rows = dealRoomToRows(seed.dealRoom, EV, seed.dealRoom.clock);
    const held = new Set(rows.busy.map((b) => b.sourceId));
    for (const id of held) expect(rows.busy.filter((b) => b.sourceId === id).map((b) => b.key.split(":")[0]).sort()).toEqual(["app", "app", "room"]);
    expect(rows.busy.every((b) => b.to > b.from)).toBe(true);
  });
});

describe("the demo seed's guards", () => {
  const fakeRepo = (real: { id: string; name: string }[]) => {
    const calls: string[] = [];
    const repo: SeedRepo = {
      realEvents: async () => real,
      demoCounts: async () => ({ organisers: 0, events: 0, users: 0 }),
      replaceDemo: async () => void calls.push("replace"),
      removeDemo: async () => void calls.push("remove"),
    };
    return { repo, calls };
  };

  test("never in production", async () => {
    const { repo, calls } = fakeRepo([]);
    await expect(createSeedService(repo).seedDemo({ appEnv: "production" })).rejects.toThrow(SeedRefused);
    await expect(createSeedService(repo).removeDemo({ appEnv: "production" })).rejects.toThrow(SeedRefused);
    expect(calls).toEqual([]);
  });

  test("never beside real events, whatever APP_ENV says", async () => {
    const { repo, calls } = fakeRepo([{ id: "ev_real", name: "A real summit" }]);
    await expect(createSeedService(repo).seedDemo({ appEnv: "staging" })).rejects.toThrow(/ev_real/);
    expect(calls).toEqual([]);
  });

  test("on staging with no real events it loads", async () => {
    const { repo, calls } = fakeRepo([]);
    const n = await createSeedService(repo).seedDemo({ appEnv: "staging" });
    expect(calls).toEqual(["replace"]);
    expect(n.applications).toBe(seed.dealRoom.apps.length);
  });

  test("everything it makes is flagged as demo", () => {
    const rows = demoRows();
    expect(rows.core.organisers.every((o) => o.demo)).toBe(true);
    expect(rows.core.events.every((e) => e.demo)).toBe(true);
    expect(rows.users.every((u) => u.demo)).toBe(true);
  });
});

const example = JSON.parse(readFileSync(new URL("../reference/connected-africa-3.example.json", import.meta.url), "utf8"));

describe("the reference file", () => {
  test("the example in the repository is valid", () => {
    expect(ReferenceFile.safeParse(example).success).toBe(true);
  });

  test("a bad file is refused with each problem named by its path", () => {
    const bad = structuredClone(example);
    bad.event.organiserId = "org_someone_else";
    bad.dealRoom.config.eventId = "ev_other";
    bad.dealRoom.staff[1].email = bad.dealRoom.staff[0].email;
    bad.dealRoom.staff = bad.dealRoom.staff.map((s: { role: string }) => ({ ...s, role: s.role === "Lead" ? "Reviewer" : s.role }));
    const r = ReferenceFile.safeParse(bad);
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["event.organiserId", "dealRoom.config.eventId", "dealRoom.staff.1", "dealRoom.staff"]));
  });

  test("an import never lands on demo data", async () => {
    const written: string[] = [];
    const service = createReferenceService({
      conflicts: async () => ({ demoOrganiser: true, demoEvent: true, demoUsers: [], slugTakenBy: undefined }),
      importFile: async () => (written.push("x"), { created: [], updated: [], staffNotInFile: [] }),
    });
    await expect(service.importFile(ReferenceFile.parse(example), "2026-11-11 12:00")).rejects.toThrow(ReferenceRefused);
    expect(written).toEqual([]);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("through PostgreSQL, as the app role", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 3);
  const seedRepo = createSeedRepo(db);
  const run = Date.now().toString(36);

  beforeAll(() => seedRepo.replaceDemo(demoRows()), 60_000);
  afterAll(async () => {
    await seedRepo.removeDemo();
    await db.$disconnect();
  }, 60_000);

  test("the core records come back from the database as they went in", async () => {
    const stored = await createEventsRepo(db).load(seed.events.map((e) => e.id));
    expect(sortCore(coreFromRows(stored))).toEqual(expectedCore);
  });

  test("the Deal Room comes back from the database as it went in", async () => {
    const stored = await createDealRoomRepo(db).load(EV);
    expect(stored).not.toBeNull();
    expect(comparable(dealRoomFromRows(EV, stored!.dealRoom, seed.dealRoom.clock))).toEqual(comparable(seed.dealRoom));
  });

  test("the busy slots are in, and the database refuses a clash with any of them", async () => {
    const [active] = await db.$queryRaw<{ id: string; key: string; lo: Date; hi: Date }[]>`
      SELECT id, key, lower(slot) AS lo, upper(slot) AS hi FROM dr_busy WHERE event_id = ${EV} AND active AND key LIKE 'room:%' LIMIT 1`;
    expect(active).toBeDefined();
    await expect(
      db.$executeRaw`INSERT INTO dr_busy (id, event_id, source, source_id, key, slot, active)
        VALUES (${`clash_${run}`}, ${EV}, 'meeting', 'x', ${active.key}, tstzrange(${active.lo}, ${active.hi}), true)`,
    ).rejects.toThrow();
  });

  test("loading again replaces the demo data, it doesn't add to it", async () => {
    await seedRepo.replaceDemo(demoRows());
    expect(await db.drApplication.count({ where: { eventId: EV } })).toBe(seed.dealRoom.apps.filter((a) => a.eventId === EV).length);
    expect(await seedRepo.demoCounts()).toEqual({ organisers: seed.organisers.length, events: seed.events.length, users: seed.dealRoom.staff.length });
  }, 60_000);

  test("a reference import refuses the demo's own ids, and imports and re-imports its own", async () => {
    const service = createReferenceService(createReferenceRepo(db));
    await expect(service.importFile(ReferenceFile.parse(example), "2026-11-11 12:00")).rejects.toThrow(/demo data/);

    // the same file under ids and emails of its own: a real event beside the demo
    const own = ReferenceFile.parse(
      JSON.parse(
        JSON.stringify(example)
          .replaceAll('"org_bouer"', `"org_ref${run}"`)
          .replaceAll('"ev_ca3"', `"ev_ref${run}"`)
          .replaceAll('"connected-africa-3"', `"ref-${run}"`)
          .replaceAll(".example", `.r${run}.example`)
          .replace(/"st_([a-z0-9_]+)"/g, `"st_$1_r${run}"`),
      ),
    );
    try {
      const first = await service.importFile(own, "2026-11-11 12:00");
      expect(first.created).toContain(`event ev_ref${run}`);
      expect(first.updated).toEqual([]);
      const again = await service.importFile(own, "2026-11-12 09:00");
      expect(again.created).toEqual([]);
      expect(again.updated).toContain(`event ev_ref${run}`);
      const staff = await db.drStaff.findMany({ where: { eventId: `ev_ref${run}` } });
      expect(staff).toHaveLength(own.dealRoom!.staff.length);
      expect(staff.every((s) => s.userId)).toBe(true);
      expect((staff[0].record as { addedAt: string }).addedAt).toBe("2026-11-11 12:00"); // kept from the first import
      expect(await db.event.findUnique({ where: { id: `ev_ref${run}` }, select: { demo: true } })).toEqual({ demo: false });
    } finally {
      const users = (await db.membership.findMany({ where: { eventId: `ev_ref${run}` }, select: { userId: true } })).map((m) => m.userId);
      await db.membership.deleteMany({ where: { eventId: `ev_ref${run}` } });
      await db.drStaff.deleteMany({ where: { eventId: `ev_ref${run}` } });
      await db.drConfig.deleteMany({ where: { eventId: `ev_ref${run}` } });
      await db.event.deleteMany({ where: { id: `ev_ref${run}` } });
      await db.organiser.deleteMany({ where: { id: `org_ref${run}` } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    }
  }, 60_000);
});
