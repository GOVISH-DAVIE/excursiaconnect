/**
 * M1.1: applying, through the real app and the test database, with a clock the tests set. An applicant signed in
 * by email starts a draft, autosaves field by field (merged across devices), uploads the required documents and
 * submits in one command for a reference from the event's counter. Nobody else can see or touch the draft.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ApplyForm, MyApplication, MyApplications, UploadTarget } from "@excursia/contracts/apply";
import { ErrorBody } from "@excursia/contracts/http";
import { createDb } from "@excursia/db";
import { seed } from "@excursia/domain/seed";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mail/mailer";
import { createSeedRepo } from "../src/modules/seed/seed.repo";
import { demoRows, demoUserId } from "../src/modules/seed/seed.service";
import { deriveKeys, hashToken, newToken } from "../src/security/secrets";
import { createLocalStorage } from "../src/storage/local";
import { toInstant } from "../src/persistence/time";

const WEB = "https://events.example.co.ke";
const SLUG = "connected-africa-3";
const run = Date.now().toString(36);
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(2000, 0x20)]);

describe.skipIf(!process.env.TEST_DATABASE_URL)("applying to the Deal Room", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 6);
  const seedRepo = createSeedRepo(db);
  const secret = Buffer.alloc(32, 5).toString("base64");
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "unused", WEB_ORIGINS: WEB, AUTH_SECRET: secret, UPLOAD_MAX_MB: "1" });
  let clock = toInstant("2026-12-16 09:00");
  let server: Server;
  let base = "";
  let dir = "";
  const cookies: Record<string, string> = {};
  const users: string[] = [];

  async function signedIn(userId: string) {
    const token = newToken();
    await db.session.create({ data: { tokenHash: hashToken(token), userId, createdAt: clock, lastSeenAt: clock, expiresAt: new Date(clock.getTime() + 86_400_000), stepUpAt: clock } });
    return `sid=${token}`;
  }
  async function applicant(name: string, email = `${name}-${run}@apply.example`) {
    const u = await db.user.create({ data: { kind: "participant", email, name } });
    users.push(u.id);
    cookies[name] = await signedIn(u.id);
    return email;
  }

  async function call(method: string, path: string, who?: string, body?: unknown, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...extra };
    if (who) headers.Cookie = cookies[who];
    if (method !== "GET") headers.Origin = WEB;
    if (body !== undefined && !Buffer.isBuffer(body)) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  }
  const mine = (path = "") => `/v1/apply/${SLUG}/mine${path}`;
  const start = (who: string, mode: string, invite?: string) => call("POST", mine(), who, { mode, ...(invite ? { invite } : {}) });
  const save = (who: string, id: string, changes: object) => call("PATCH", mine(`/${id}`), who, { changes });
  const submit = (who: string, id: string, changes?: object) => call("POST", mine(`/${id}/submit`), who, changes ? { changes } : {});
  const errorOf = (r: { json: unknown }) => ErrorBody.parse(r.json).error;

  async function upload(who: string, id: string, kind: string, bytes = PDF, contentType = "application/pdf") {
    const t = await call("POST", mine(`/${id}/documents`), who, { kind, name: `${kind}.pdf`, contentType, size: bytes.length });
    if (t.status !== 201) return { start: t };
    const target = UploadTarget.parse(t.json);
    const put = await call("PUT", target.url, undefined, bytes, target.headers);
    const done = await call("POST", mine(`/${id}/documents/${target.fileId}/complete`), who);
    return { start: t, target, put, done };
  }

  const SEEKER_FILLED = {
    "org.name": "Zambezi Pay Ltd", "org.regNo": "PVT-2019-0042", "org.country": "Zambia", "org.sector": "Fintech",
    "ask.amount": 2_000_000, "ask.instrument": "Equity", "ask.useOfFunds": "Expansion into Malawi", "ask.stage": "Growth",
    "traction.revenueBand": "USD 1m to 5m",
    "decisionMaker.name": "Mutale Banda", "decisionMaker.title": "CEO", "decisionMaker.email": "mutale@zambezipay.example", "decisionMaker.phone": "+260977000000",
    mission: "m1", source: "Referral",
  };
  const PROVIDER_FILLED = {
    "org.name": "Rift Capital", "org.country": "Kenya", providerKind: "Venture capital",
    "mandate.sectors": ["Fintech"], "mandate.countries": ["Kenya"], "mandate.stages": ["Growth"], "mandate.ticketMin": 250_000, "mandate.ticketMax": 2_000_000,
    "mandate.instruments": ["Equity"],
    "decisionMaker.name": "Wanjiku Mwangi", "decisionMaker.title": "Partner", "decisionMaker.email": "w@rift.example", "decisionMaker.phone": "+254700000000",
    mission: "m1", source: "Partner",
  };

  beforeAll(async () => {
    await seedRepo.replaceDemo(demoRows());
    dir = await mkdtemp(join(tmpdir(), "excursia-uploads-"));
    cookies.lead = await signedIn(demoUserId("st_lead"));
    const app = createApp({ config, db, mailer: memoryMailer(), now: () => clock, storage: createLocalStorage({ dir, key: deriveKeys(secret).upload }), logError: (e) => console.error(e) });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await db.file.deleteMany({ where: { eventId: "ev_ca3" } });
    await seedRepo.removeDemo();
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }, 60_000);

  test("the form's settings are public", async () => {
    const r = await call("GET", `/v1/apply/${SLUG}/form`);
    const form = ApplyForm.parse(r.json);
    expect(form).toMatchObject({ eventId: "ev_ca3", opens: "2026-12-15" });
    expect(form.seekerDocs.filter((d) => d.required).map((d) => d.kind)).toEqual(["Pitch deck", "Financial statements", "Registration certificate"]);
    expect((await call("GET", "/v1/apply/no-such-event/form")).status).toBe(404);
  });

  describe("a capital seeker", () => {
    let email = "";
    let id = "";

    beforeAll(async () => {
      email = await applicant("amina");
      cookies.aminaPhone = await signedIn(users.at(-1)!); // the same person on a second device
    });

    test("starts a draft owned by their verified email", async () => {
      const r = await start("amina", "seeker");
      expect(r.status).toBe(201);
      const app = MyApplication.parse(r.json);
      id = app.id;
      expect(app).toMatchObject({ mode: "seeker", status: "Draft", ref: null });
      expect(app.form.contact.email).toBe(email);
      expect(app.gaps.missing).toContain("Legal name");
    });

    test("autosaves field by field; two devices' edits merge", async () => {
      const a = MyApplication.parse((await save("amina", id, { "org.name": "Zambezi Pay Ltd" })).json);
      const b = MyApplication.parse((await save("aminaPhone", id, { "org.country": "Zambia" })).json);
      expect(b.version).toBe(a.version + 1);
      expect(b.form.org).toMatchObject({ name: "Zambezi Pay Ltd", country: "Zambia" });
      const list = MyApplications.parse((await call("GET", mine(), "aminaPhone")).json);
      expect(list.map((x) => x.id)).toEqual([id]);
    });

    test("fields an applicant may not write are refused, by name", async () => {
      const crafted = await save("amina", id, { status: "Decided", ref: "CA3-CS-99999" });
      expect(crafted.status).toBe(400);
      const otherKind = await save("amina", id, { "mandate.ticketMin": 5 });
      expect(otherKind.status).toBe(400);
      expect(errorOf(otherKind).fields).toEqual(["mandate.ticketMin"]);
    });

    test("can't submit with gaps: the rule names them", async () => {
      const r = await submit("amina", id, SEEKER_FILLED);
      expect(r.status).toBe(409);
      expect(errorOf(r).message).toMatch(/^Still needed: .*Pitch deck/);
      // and nothing of that command was kept, not even its field changes
      expect(MyApplication.parse((await call("GET", mine(`/${id}`), "amina")).json).form.org.regNo).toBe("");
    });

    test("uploads are checked: type, contents, size, kind, and one use per link", async () => {
      const fake = await upload("amina", id, "Pitch deck", Buffer.from("MZ this is not a pdf at all, it is something else"));
      expect(fake.put?.status).toBe(400);
      expect(errorOf(fake.put!).message).toMatch(/contents don't match/);
      expect((await upload("amina", id, "Pitch deck", Buffer.alloc(2_000_000, 0x25))).start.status).toBe(413);
      expect((await upload("amina", id, "Selfie")).start.status).toBe(400);
      expect((await upload("amina", id, "Pitch deck", PDF, "application/x-msdownload")).start.status).toBe(400);

      const ok = await upload("amina", id, "Pitch deck");
      expect(ok.put?.status).toBe(204);
      expect(MyApplication.parse(ok.done!.json).documents.map((d) => d.kind)).toEqual(["Pitch deck"]);
      // the same link again, and completing again, change nothing
      expect((await call("PUT", ok.target!.url, undefined, PDF, ok.target!.headers)).status).toBe(400);
      const again = await call("POST", mine(`/${id}/documents/${ok.target!.fileId}/complete`), "amina");
      expect(MyApplication.parse(again.json).documents).toHaveLength(1);
      // the file waits in quarantine for the virus scan (M1.2)
      expect((await db.file.findUniqueOrThrow({ where: { id: ok.target!.fileId } })).state).toBe("quarantine");
    });

    test("before applications open, submitting is refused with the date", async () => {
      await upload("amina", id, "Financial statements");
      await upload("amina", id, "Registration certificate");
      clock = toInstant("2026-12-14 17:00");
      try {
        const r = await submit("amina", id, SEEKER_FILLED);
        expect(r.status).toBe(409);
        expect(errorOf(r).message).toBe("Applications open on 2026-12-15");
      } finally {
        clock = toInstant("2026-12-16 09:00");
      }
    });

    test("save and submit is one command: the reference comes from the counter, and a message is queued", async () => {
      const r = await submit("amina", id, SEEKER_FILLED);
      expect(r.status).toBe(200);
      const app = MyApplication.parse(r.json);
      expect(app.status).toBe("Submitted");
      expect(app.ref).toBe(`CA3-CS-${String(seed.dealRoom.seq.cs + 1).padStart(5, "0")}`);
      expect(app.form.org.regNo).toBe("PVT-2019-0042");
      expect(await db.outboxMessage.count({ where: { recipient: id, subject: { contains: app.ref! } } })).toBe(1);
      const audit = await db.auditEntry.findFirstOrThrow({ where: { entity: "dr_application", entityId: id }, orderBy: { id: "desc" } });
      expect(audit).toMatchObject({ actorKind: "applicant", action: "dr/saveDraft + dr/submit" });
    });

    test("after submitting, the draft is closed to edits and uploads", async () => {
      expect((await save("amina", id, { "org.website": "https://zambezipay.example" })).status).toBe(409);
      expect((await submit("amina", id)).status).toBe(409);
      expect((await upload("amina", id, "E&S study")).start.status).toBe(409);
    });
  });

  test("nobody else can see or touch an applicant's draft", async () => {
    await applicant("owner");
    await applicant("intruder");
    const id = MyApplication.parse((await start("owner", "provider")).json).id;
    for (const r of [
      await call("GET", mine(`/${id}`), "intruder"),
      await save("intruder", id, { "org.name": "Taken over" }),
      await submit("intruder", id),
      await call("POST", mine(`/${id}/documents`), "intruder", { kind: "Pitch deck", name: "x.pdf", contentType: "application/pdf", size: 10 }),
    ])
      expect(r.status).toBe(404);
    expect(MyApplications.parse((await call("GET", mine(), "intruder")).json)).toEqual([]);
    expect((await call("GET", mine(), "lead")).status).toBe(403); // staff don't apply
    expect((await call("GET", mine())).status).toBe(401);
  });

  test("a challenge comes from a public institution or a corporate buyer, and providers upload no seeker documents", async () => {
    await applicant("county");
    const id = MyApplication.parse((await start("county", "challenge")).json).id;
    const vc = await save("county", id, { providerKind: "Venture capital" });
    expect(errorOf(vc).fields).toEqual(["providerKind"]);
    expect((await save("county", id, { providerKind: "Public institution", "challenge.title": "Water metering for Kisumu" })).status).toBe(200);
    expect((await upload("county", id, "Pitch deck")).start.status).toBe(400);
  });

  test("an invitation is taken up only by the email it was sent to", async () => {
    const invited = seed.dealRoom.apps.find((a) => a.id === "dr_cs05")!;
    await applicant("stranger");
    expect((await start("stranger", "seeker", invited.invite!.token)).status).toBe(403);
    await applicant("invitee", invited.contact.email);
    const r = MyApplication.parse((await start("invitee", "seeker", invited.invite!.token)).json);
    expect(r).toMatchObject({ id: "dr_cs05", status: "Draft" });
  });

  test("simultaneous submissions get distinct references, in order", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      await applicant(`fund${i}`);
      const id = MyApplication.parse((await start(`fund${i}`, "provider")).json).id;
      await save(`fund${i}`, id, PROVIDER_FILLED);
      ids.push(id);
    }
    const results = await Promise.all(ids.map((id, i) => submit(`fund${i}`, id)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    const refs = results.map((r) => MyApplication.parse(r.json).ref!).sort();
    const first = seed.dealRoom.seq.fp + 1;
    expect(refs).toEqual([0, 1, 2, 3].map((n) => `CA3-FP-${String(first + n).padStart(5, "0")}`));
  }, 30_000);
});
