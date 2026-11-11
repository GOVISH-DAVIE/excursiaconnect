/**
 * M1.3: the first half of review, through the real app and the test database. A real application (submitted by
 * an applicant, with real files) is started, scored against the rubric with evidence, asked for more information,
 * answered with a document, and opened by its reviewer through a short-lived link; an expired request is the lead's.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { MyApplication, UploadTarget } from "@excursia/contracts/apply";
import { ErrorBody } from "@excursia/contracts/http";
import { DocumentLink, ReviewView } from "@excursia/contracts/review";
import { createDb } from "@excursia/db";
import type { DrApplication } from "@excursia/domain/dealroom/types";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mail/mailer";
import { createSeedRepo } from "../src/modules/seed/seed.repo";
import { demoRows, demoUserId } from "../src/modules/seed/seed.service";
import { deriveKeys, hashToken, newToken } from "../src/security/secrets";
import { createLocalStorage } from "../src/storage/local";
import { toInstant } from "../src/persistence/time";

const WEB = "https://events.example.co.ke";
const EV = "ev_ca3";
const SLUG = "connected-africa-3";
const run = Date.now().toString(36);
const pdf = (label: string) => Buffer.concat([Buffer.from(`%PDF-1.4\n% ${label}\n`), Buffer.alloc(600, 0x20)]);

describe.skipIf(!process.env.TEST_DATABASE_URL)("reviewing an application", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 6);
  const seedRepo = createSeedRepo(db);
  const secret = Buffer.alloc(32, 6).toString("base64");
  let clock = toInstant("2026-12-16 09:00");
  const servers: Server[] = [];
  let base = "";
  let prodBase = "";
  let dir = "";
  const cookies: Record<string, string> = {};
  const users: string[] = [];
  let appId = "";
  let deckId = "";

  async function signedIn(userId: string) {
    const token = newToken();
    await db.session.create({ data: { tokenHash: hashToken(token), userId, createdAt: clock, lastSeenAt: clock, expiresAt: new Date(clock.getTime() + 30 * 86_400_000), stepUpAt: clock } });
    return `sid=${token}`;
  }
  async function call(method: string, path: string, who?: string, body?: unknown, extra: Record<string, string> = {}, at = base) {
    const headers: Record<string, string> = { ...extra };
    if (who) headers.Cookie = cookies[who];
    if (method !== "GET") headers.Origin = WEB;
    if (body !== undefined && !Buffer.isBuffer(body)) headers["Content-Type"] = "application/json";
    const res = await fetch(`${at}${path}`, { method, headers, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) });
    const buf = Buffer.from(await res.arrayBuffer());
    const json = (res.headers.get("content-type") ?? "").includes("json") && buf.length ? JSON.parse(buf.toString()) : undefined;
    return { status: res.status, json, buf, headers: res.headers };
  }
  const errorOf = (r: { json: unknown }) => ErrorBody.parse(r.json).error;
  const one = (who: string, path = "") => call("GET", `/v1/dealroom/${EV}/applications/${appId}${path}`, who);
  const post = (who: string, path: string, body?: unknown) => call("POST", `/v1/dealroom/${EV}/applications/${appId}${path}`, who, body ?? {});
  const record = (r: { json: unknown }) => ReviewView.parse(r.json).application as unknown as DrApplication;
  const mine = (path = "") => `/v1/apply/${SLUG}/mine${path}`;

  async function upload(who: string, kind: string, bytes: Buffer) {
    const t = UploadTarget.parse((await call("POST", mine(`/${appId}/documents`), who, { kind, name: `${kind}.pdf`, contentType: "application/pdf", size: bytes.length })).json);
    expect((await call("PUT", t.url, undefined, bytes, t.headers)).status).toBe(204);
    const done = await call("POST", mine(`/${appId}/documents/${t.fileId}/complete`), who);
    return { fileId: t.fileId, view: MyApplication.parse(done.json) };
  }

  beforeAll(async () => {
    await seedRepo.replaceDemo(demoRows());
    dir = await mkdtemp(join(tmpdir(), "excursia-review-"));
    const storage = createLocalStorage({ dir, key: deriveKeys(secret).upload });
    for (const id of ["st_lead", "st_rev2", "st_ops1"]) cookies[id] = await signedIn(demoUserId(id));
    const u = await db.user.create({ data: { kind: "participant", email: `founder-${run}@review.example`, name: "Founder" } });
    users.push(u.id);
    cookies.applicant = await signedIn(u.id);

    const start = async (cfg: Record<string, string>) => {
      const app = createApp({ config: loadConfig({ NODE_ENV: "test", DATABASE_URL: "unused", WEB_ORIGINS: WEB, AUTH_SECRET: secret, ...cfg }), db, mailer: memoryMailer(), now: () => clock, storage, logError: (e) => console.error(e) });
      const server = await new Promise<Server>((resolve) => {
        const s = app.listen(0, "127.0.0.1", () => resolve(s));
      });
      servers.push(server);
      return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    };
    base = await start({});
    prodBase = await start({ APP_ENV: "production" }); // production: unscanned files stay closed

    // a real application, with real files, submitted by its applicant
    appId = MyApplication.parse((await call("POST", mine(), "applicant", { mode: "seeker" })).json).id;
    await call("PATCH", mine(`/${appId}`), "applicant", {
      changes: {
        "org.name": "Kivu Solar Ltd", "org.regNo": "RW-2021-77", "org.country": "Rwanda", "org.sector": "Energy Technology & Climate Innovation",
        "ask.amount": 1_500_000, "ask.instrument": "Debt and credit", "ask.useOfFunds": "Mini-grids in the Western Province", "ask.stage": "Growth",
        "traction.revenueBand": "USD 1m to 5m",
        "decisionMaker.name": "Aline Uwase", "decisionMaker.title": "CEO", "decisionMaker.email": "aline@kivusolar.example", "decisionMaker.phone": "+250788000000",
        mission: "m1", source: "Referral",
      },
    });
    deckId = (await upload("applicant", "Pitch deck", pdf("deck"))).fileId;
    await upload("applicant", "Financial statements", pdf("financials"));
    await upload("applicant", "Registration certificate", pdf("registration"));
    expect((await call("POST", mine(`/${appId}/submit`), "applicant", {})).status).toBe(200);
  }, 60_000);

  afterAll(async () => {
    await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r()))));
    await db.file.deleteMany({ where: { eventId: EV } });
    await seedRepo.removeDemo();
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }, 60_000);

  test("reviewers open the whole application with the rubric; operations staff don't, nor applicants", async () => {
    const r = ReviewView.parse((await one("st_rev2")).json);
    expect(r.application).toMatchObject({ id: appId, status: "Submitted" });
    expect(r.config.rubric.assessment.length).toBeGreaterThan(0);
    expect(r.can).toEqual({ review: true, assign: false, decideExpiry: false });
    expect(ReviewView.parse((await one("st_lead")).json).can.decideExpiry).toBe(true);
    expect((await one("st_ops1")).status).toBe(403);
    expect((await one("applicant")).status).toBe(403);
  });

  test("starting the review takes it, if nobody had", async () => {
    const app = record(await post("st_rev2", "/start-review"));
    expect(app).toMatchObject({ status: "In review", assignee: "st_rev2" });
    expect(errorOf(await post("st_rev2", "/start-review")).message).toBe("Only a submitted application can be started");
  });

  test("a score rests on evidence, against a criterion of the rubric", async () => {
    expect((await post("st_rev2", "/scores", { layer: "assessment", criterion: "zz", score: 70, note: "x" })).status).toBe(400);
    const bare = await post("st_rev2", "/scores", { layer: "assessment", criterion: "a1", score: 70 });
    expect(errorOf(bare).message).toBe("A score needs a document or a note as evidence");
    expect(errorOf(await post("st_rev2", "/scores", { layer: "assessment", criterion: "a1", score: 70, docId: "file_notours0000" })).fields).toEqual(["docId"]);
    expect(errorOf(await post("st_rev2", "/scores", { layer: "eligibility", criterion: "e1" })).fields).toEqual(["pass"]);

    const app = record(await post("st_rev2", "/scores", { layer: "assessment", criterion: "a1", score: 72, docId: deckId }));
    expect(app.assessments.at(-1)).toMatchObject({ layer: "assessment", criterion: "a1", score: 72, docId: deckId, by: "st_rev2" });
    expect(record(await post("st_rev2", "/scores", { layer: "eligibility", criterion: "e1", pass: true })).assessments).toHaveLength(2);
  });

  test("a reviewer opens a document through a short link, and the opening is audited", async () => {
    const link = DocumentLink.parse((await one("st_rev2", `/documents/${deckId}`)).json);
    const file = await call("GET", link.url);
    expect(file.status).toBe(200);
    expect(file.buf.equals(pdf("deck"))).toBe(true);
    expect(file.headers.get("content-disposition")).toMatch(/^attachment; filename="Pitch deck.pdf"/);
    expect(file.headers.get("content-security-policy")).toContain("sandbox");
    expect(await db.auditEntry.count({ where: { entity: "file", entityId: deckId, action: "file/open" } })).toBe(1);

    expect((await call("GET", link.url.replace(/.$/, (c) => (c === "a" ? "b" : "a")))).status).toBe(404); // a tampered link
    expect((await one("applicant", `/documents/${deckId}`)).status).toBe(403);
    const demoDoc = (await db.drApplication.findUniqueOrThrow({ where: { id: "dr_cs14" } })).record as unknown as DrApplication;
    if (demoDoc.documents[0]) expect((await call("GET", `/v1/dealroom/${EV}/applications/dr_cs14/documents/${demoDoc.documents[0].id}`, "st_rev2")).status).toBe(404);
    // in production an unscanned file stays closed until M1.2's virus scan clears it
    const prod = await call("GET", `/v1/dealroom/${EV}/applications/${appId}/documents/${deckId}`, "st_rev2", undefined, {}, prodBase);
    expect(prod.status).toBe(409);
  });

  test("information is requested, answered with the asked-for document, and the review resumes", async () => {
    const asked = record(await post("st_rev2", "/requests", { questions: ["Please send the 2025 management accounts."], docs: ["Financial statements"] }));
    expect(asked.status).toBe("Information requested");
    const view = MyApplication.parse((await call("GET", mine(`/${appId}`), "applicant")).json);
    expect(view.requests.at(-1)).toMatchObject({ open: true, due: expect.stringMatching(/^2026-12-23/), docs: ["Financial statements"] });

    // only the document asked for, and it waits for the answer instead of attaching on its own
    expect((await call("POST", mine(`/${appId}/documents`), "applicant", { kind: "Pitch deck", name: "x.pdf", contentType: "application/pdf", size: 700 })).status).toBe(400);
    const { fileId, view: during } = await upload("applicant", "Financial statements", pdf("2025 accounts"));
    expect(during.documents.some((d) => d.id === fileId)).toBe(false);

    const answered = MyApplication.parse((await call("POST", mine(`/${appId}/respond`), "applicant", { text: "Attached, as asked.", fileIds: [fileId] })).json);
    expect(answered.status).toBe("In review");
    expect(answered.documents.some((d) => d.id === fileId)).toBe(true);
    expect(answered.requests.at(-1)).toMatchObject({ open: false, answeredAt: expect.any(String) });
    const rfi = record(await one("st_rev2")).rfis.at(-1)!;
    expect(rfi.response).toMatchObject({ text: "Attached, as asked.", docIds: [fileId] });
  });

  test("a request that expires unanswered is the lead's to settle, not the reviewer's", async () => {
    await post("st_rev2", "/requests", { questions: ["Who are the shareholders?"], docs: [] });
    clock = toInstant("2027-01-05 09:00");
    // twenty days on, staff sessions have idled out (as they should): sign in again at the new time
    const relog = async () => {
      for (const id of ["st_lead", "st_rev2"]) cookies[id] = await signedIn(demoUserId(id));
    };
    await relog();
    try {
      const r = await post("st_rev2", "/requests/expiry", { how: "Extended", note: "Holidays" });
      expect(errorOf(r).message).toBe("Only the lead decides an expired request");
      const app = record(await post("st_lead", "/requests/expiry", { how: "Extended", note: "Holiday season: a full period more" }));
      expect(app.status).toBe("Information requested");
      expect(app.rfis.at(-1)!.at).toBe("2027-01-05 09:00");
    } finally {
      clock = toInstant("2026-12-16 09:00");
      await relog();
    }
  });

  test("another event's application, and a missing one, are refused", async () => {
    expect((await call("GET", `/v1/dealroom/${EV}/applications/dr_nobody_here`, "st_rev2")).status).toBe(404);
    expect((await call("GET", `/v1/dealroom/ev_other_event/applications/${appId}`, "st_rev2")).status).toBe(403);
  });
});
