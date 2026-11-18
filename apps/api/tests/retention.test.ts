/**
 * Document retention (PRD: deleted 12 months after the conversion end, unless the lead extends it with a reason):
 * only the lead extends it; every document still kept moves to the new date in the same transaction, a deleted
 * one stays deleted; the change is audited and logged; and it still works once the Deal Room is archived.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, expect, test, describe } from "vitest";
import { ErrorBody } from "@excursia/contracts/http";
import { DealRoomSettings } from "@excursia/contracts/onboarding";
import { createDb } from "@excursia/db";
import { retentionDate } from "@excursia/domain/dealroom/apply";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mail/mailer";
import { createSeedRepo } from "../src/modules/seed/seed.repo";
import { demoRows, demoUserId } from "../src/modules/seed/seed.service";
import { toInstant } from "../src/persistence/time";
import { hashToken, newToken } from "../src/security/secrets";

const WEB = "https://events.example.co.ke";
const EV = "ev_ca3";
const run = Date.now().toString(36);

describe.skipIf(!process.env.TEST_DATABASE_URL)("document retention", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 4);
  const seedRepo = createSeedRepo(db);
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "unused", WEB_ORIGINS: WEB, AUTH_SECRET: Buffer.alloc(32, 4).toString("base64") });
  const clock = toInstant("2026-12-16 09:00");
  let server: Server;
  let base = "";
  const cookies: Record<string, string> = {};
  const ids = { kept: `file_${run}kept`, gone: `file_${run}gone`, other: `file_${run}other` };

  async function call(method: string, path: string, who: string, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Cookie: cookies[who], ...(method !== "GET" ? { Origin: WEB } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  }
  const extend = (who: string, body: unknown) => call("POST", `/v1/dealroom/${EV}/settings/retention`, who, body);
  const file = (id: string) => db.file.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    await seedRepo.replaceDemo(demoRows());
    for (const id of ["st_lead", "st_rev1", "st_coord1"]) {
      const token = newToken();
      await db.session.create({ data: { tokenHash: hashToken(token), userId: demoUserId(id), createdAt: clock, lastSeenAt: clock, expiresAt: new Date(clock.getTime() + 86_400_000), stepUpAt: clock } });
      cookies[id] = `sid=${token}`;
    }
    const at = new Date("2027-08-31T20:59:59Z");
    const common = { eventId: EV, ownerKind: "dr_application", ownerId: "dr_cs40", kind: "Pitch deck", name: "deck.pdf", contentType: "application/pdf", size: 10, retentionUntil: at };
    await db.file.create({ data: { ...common, id: ids.kept, storageKey: `t/${ids.kept}` } });
    await db.file.create({ data: { ...common, id: ids.gone, storageKey: `t/${ids.gone}`, deletedAt: new Date() } });
    // an organiser's KYC document is no Deal Room document: it isn't moved
    await db.file.create({ data: { ...common, id: ids.other, storageKey: `t/${ids.other}`, ownerKind: "organiser", ownerId: "org_x" } });
    const app = createApp({ config, db, mailer: memoryMailer(), now: () => clock, logError: (e) => console.error(e) });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await db.file.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await seedRepo.removeDemo();
    await db.$disconnect();
  }, 60_000);

  test("the settings say when documents are deleted, and who may keep them longer", async () => {
    const lead = DealRoomSettings.parse((await call("GET", `/v1/dealroom/${EV}/settings`, "st_lead")).json).retention;
    expect(lead).toMatchObject({ months: 12, canExtend: true });
    expect(lead.deleteOn).toBe(retentionDate({ conversionEnd: lead.conversionEnd, retentionMonths: 12 }));
    expect(DealRoomSettings.parse((await call("GET", `/v1/dealroom/${EV}/settings`, "st_rev1")).json).retention.canExtend).toBe(false);
  });

  test("only the lead extends it, by whole months, with a reason", async () => {
    for (const who of ["st_rev1", "st_coord1"]) {
      const r = await extend(who, { months: 6, reason: "A deal in diligence" });
      expect(r.status).toBe(409);
      expect(ErrorBody.parse(r.json).error.message).toBe("Only the lead can extend document retention");
    }
    expect((await extend("st_lead", { months: 0, reason: "x" })).status).toBe(400);
    expect((await extend("st_lead", { months: 6, reason: " " })).status).toBe(400);
    expect((await file(ids.kept)).retentionUntil?.toISOString()).toBe("2027-08-31T20:59:59.000Z");
  });

  test("extended: every kept document moves to the new date, a deleted one stays deleted, and it's audited", async () => {
    const r = await extend("st_lead", { months: 6, reason: "Two deals still in due diligence" });
    expect(r.status).toBe(200);
    const s = DealRoomSettings.parse(r.json);
    expect(s.retention.months).toBe(18);
    expect(s.log[0].what).toBe("Document retention extended by 6 months: Two deals still in due diligence");
    const until = new Date(`${s.retention.deleteOn}T23:59:59+03:00`);
    expect((await file(ids.kept)).retentionUntil).toEqual(until);
    expect((await file(ids.gone)).retentionUntil?.toISOString()).toBe("2027-08-31T20:59:59.000Z");
    expect((await file(ids.other)).retentionUntil?.toISOString()).toBe("2027-08-31T20:59:59.000Z");
    expect(await db.auditEntry.findFirst({ where: { entity: "dr_config", entityId: EV, action: "dr/retention" } })).toMatchObject({ actorKind: "staff", detail: { months: 6, reason: "Two deals still in due diligence" } });
  });

  test("it still works once the Deal Room is archived, when it matters most", async () => {
    const cfg = await db.drConfig.findUniqueOrThrow({ where: { eventId: EV } });
    await db.drConfig.update({ where: { eventId: EV }, data: { record: { ...(cfg.record as object), archivedAt: "2027-03-31 23:59" } } });
    const r = await extend("st_lead", { months: 3, reason: "A commitment letter is due in June" });
    expect(r.status).toBe(200);
    expect(DealRoomSettings.parse(r.json).retention.months).toBe(21);
  });
});
