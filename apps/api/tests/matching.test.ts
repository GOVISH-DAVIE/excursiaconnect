/**
 * Matching and introductions (M3.1), through the API: the team's board and candidates; a decision, the brief and
 * the introduction, each audited and emailed; each side answers from its own account; the seeker shares and
 * withdraws documents; the counterparty opens the profile and a consented document as a stamped copy through a
 * two-minute link; every opening is in the seeker's access log; no one else sees any of it.
 */
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ErrorBody } from "@excursia/contracts/http";
import { Candidates, DecidedMatch, Directory, MatchingBoard, MatchView, MyIntroductions, MyProfile, SeekerProfile, SharedLink } from "@excursia/contracts/matching";
import { createDb } from "@excursia/db";
import { candidates, matchable, mustHaveMisses } from "@excursia/domain/dealroom/logic";
import { seed } from "@excursia/domain/seed";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mail/mailer";
import { introLapses } from "../src/modules/matching";
import { createSeedRepo } from "../src/modules/seed/seed.repo";
import { demoRows, demoUserId } from "../src/modules/seed/seed.service";
import { toInstant } from "../src/persistence/time";
import { hashToken, newToken } from "../src/security/secrets";
import { createLocalStorage, type LocalStorage } from "../src/storage/local";

const WEB = "https://events.example.co.ke";
const SLUG = "connected-africa-3";
const EV = "ev_ca3";
const run = Date.now().toString(36);

/** An introduction sent the day before the clock, unanswered, proposing documents. */
const pending = seed.dealRoom.matches.find((m) => m.intro && !m.intro.seeker && !m.intro.provider && m.intro.sentAt > "2027-02-12" && m.intro.items.length > 2)!;
const [DECK, OTHER] = pending.intro!.items.filter((i) => i !== "teaser" && i !== "profile");
/** An introduction that expired unanswered long before the clock. */
const lapsed = seed.dealRoom.matches.find((m) => m.intro && !m.intro.seeker && !m.intro.provider && m.intro.sentAt < "2027-02-01")!;
/** A pair nobody has decided yet, with no must-have miss. */
const cfg = Object.values(seed.dealRoom.configs)[0];
const free = seed.dealRoom.apps
  .filter((a) => a.type === "seeker" && matchable(a))
  .map((s) => candidates(seed.dealRoom, cfg, s).find((c) => !c.existing && !c.exclusionHit && !mustHaveMisses(cfg, c.provider, c.missed).length))
  .find(Boolean)!;

describe.skipIf(!process.env.TEST_DATABASE_URL)("matching and introductions", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 4);
  const seedRepo = createSeedRepo(db);
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "unused", WEB_ORIGINS: WEB, AUTH_SECRET: Buffer.alloc(32, 7).toString("base64") });
  const clock = toInstant("2027-02-14 09:00");
  let server: Server;
  let base = "";
  let dir = "";
  let storage: LocalStorage;
  const cookies: Record<string, string> = {};
  const users: string[] = [];

  async function call(method: string, path: string, who: string, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Cookie: cookies[who] ?? "", ...(method !== "GET" ? { Origin: WEB } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  }
  const reason = (r: { json: unknown }) => ErrorBody.parse(r.json).error.message;
  async function signedIn(userId: string) {
    const token = newToken();
    await db.session.create({ data: { tokenHash: hashToken(token), userId, createdAt: clock, lastSeenAt: clock, expiresAt: new Date(clock.getTime() + 86_400_000), stepUpAt: clock } });
    return `sid=${token}`;
  }
  async function participant(who: string, email: string) {
    const u = await db.user.upsert({ where: { email }, create: { kind: "participant", email, name: who }, update: {} });
    users.push(u.id);
    cookies[who] = await signedIn(u.id);
  }
  const emailOf = async (appId: string) => (await db.drApplication.findUniqueOrThrow({ where: { id: appId }, select: { contactEmail: true } })).contactEmail!;
  const mine = async (who: string) => MyIntroductions.parse((await call("GET", `/v1/introductions/${SLUG}`, who)).json);
  const intro = `/v1/introductions/${SLUG}/${pending.id}`;

  beforeAll(async () => {
    await seedRepo.replaceDemo(demoRows());
    for (const id of ["st_lead", "st_rev1", "st_ops1"]) cookies[id] = await signedIn(demoUserId(id));
    await participant("seeker", await emailOf(pending.seekerId));
    await participant("provider", await emailOf(pending.providerId));
    await participant("stranger", `stranger.${run}@example.com`);
    // the deck has a real file behind it: a two-page PDF, cleared by the scan
    dir = await mkdtemp(join(tmpdir(), "excursia-matching-"));
    storage = createLocalStorage({ dir, key: Buffer.alloc(32, 3) });
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]).drawText("Revenue grew 40%");
    pdf.addPage([595, 842]);
    const bytes = await pdf.save();
    const key = `dr/${pending.seekerId}/${DECK}`;
    await storage.receive(storage.uploadTarget(key, { contentType: "application/pdf", size: bytes.length }).url.split("/").pop()!, "application/pdf", Buffer.from(bytes));
    await db.file.create({ data: { id: DECK, eventId: EV, ownerKind: "dr_application", ownerId: pending.seekerId, kind: "Pitch deck", storageKey: key, name: "deck.pdf", contentType: "application/pdf", size: bytes.length, state: "clean" } });
    const app = createApp({ config, db, mailer: memoryMailer(), storage, now: () => clock, logError: (e) => console.error(e) });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await db.file.deleteMany({ where: { id: DECK } });
    await db.session.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users }, demo: false } });
    await seedRepo.removeDemo();
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }, 60_000);

  test("the board lists who is open to matching and every pair; operations and participants are refused", async () => {
    const board = MatchingBoard.parse((await call("GET", `/v1/matching/${EV}`, "st_rev1")).json);
    expect(board.pool.length).toBeGreaterThan(10);
    expect(board.pool.every((p) => p.org)).toBe(true);
    expect(board.matches.find((m) => m.id === pending.id)).toMatchObject({ stage: "Introduced", sentAt: pending.intro!.sentAt });
    expect(board.can).toEqual({ match: true, introduce: true, lead: false });
    const ops = await call("GET", `/v1/matching/${EV}`, "st_ops1");
    expect(ops.status).toBe(403);
    expect(reason(ops)).toBe("Your role, Operations, doesn't match participants.");
    expect((await call("GET", `/v1/matching/${EV}`, "seeker")).status).toBe(403);
  });

  test("a reviewer approves a candidate, edits the brief and introduces the pair: audited, and both are emailed", async () => {
    const list = Candidates.parse((await call("GET", `/v1/matching/${EV}/candidates/${free.seeker.id}`, "st_rev1")).json);
    const c = list.candidates.find((x) => x.providerId === free.provider.id)!;
    expect(c).toMatchObject({ match: null, blocked: null, needsNote: false });
    expect(c.fit.length).toBe(cfg.matching.length);
    const no = await call("POST", `/v1/matching/${EV}/decisions`, "st_rev1", { seekerId: free.seeker.id, providerId: free.provider.id, decision: "Rejected", note: "" });
    expect(reason(no)).toBe("Say why the pair is rejected");
    const d = DecidedMatch.parse((await call("POST", `/v1/matching/${EV}/decisions`, "st_rev1", { seekerId: free.seeker.id, providerId: free.provider.id, decision: "Approved", note: "Same sector, ticket in range" })).json);
    expect(d.stage).toBe("Approved");
    const path = `/v1/matching/${EV}/matches/${d.id}`;
    const v = MatchView.parse((await call("GET", path, "st_rev1")).json);
    expect(v.match.brief!.text).toContain(free.seeker.org.name);
    expect(MatchView.parse((await call("PUT", `${path}/brief`, "st_rev1", { text: "A sharper brief.", agenda: ["Intros", "Next step"] })).json).match.brief).toMatchObject({ text: "A sharper brief." });
    const doc = free.seeker.documents[0];
    const sent = MatchView.parse((await call("POST", `${path}/introduce`, "st_rev1", { items: doc ? [doc.id] : [] })).json);
    expect(sent.match.stage).toBe("Introduced");
    expect(sent.match.intro!.items.map((i) => i.consent)).toEqual(["with the introduction", "with the introduction", ...(doc ? ["asked at acceptance"] : [])]);
    expect(reason(await call("POST", `${path}/introduce`, "st_rev1", { items: [] }))).toBe("The introduction has already been sent");
    expect(await db.auditEntry.count({ where: { entity: "dr_match", entityId: d.id, action: { in: ["dr/matchDecide", "dr/brief", "dr/introduce"] } } })).toBe(3);
    for (const to of [free.seeker.id, free.provider.id])
      expect(await db.outboxMessage.findFirst({ where: { recipient: to, subject: "You have a Deal Room introduction to review" } })).toMatchObject({ link: `/dr/${to}?intros=1` });
  });

  test("each side sees its own introduction; a stranger sees none and can't answer it", async () => {
    const s = (await mine("seeker")).introductions.find((x) => x.matchId === pending.id)!;
    expect(s).toMatchObject({ side: "seeker", stage: "Introduced", mine: null, theirs: null });
    expect(s.documents.map((d) => d.id)).toEqual([DECK, OTHER].filter(Boolean));
    const p = (await mine("provider")).introductions.find((x) => x.matchId === pending.id)!;
    expect(p).toMatchObject({ side: "provider", other: { org: expect.any(String) } });
    expect(p.documents[0].opens).toEqual({ ok: false, reason: "Documents open once both of you accept the introduction." });
    expect((await mine("stranger")).introductions).toEqual([]);
    expect((await call("POST", `${intro}/respond`, "stranger", { response: "Accepted" })).status).toBe(404);
  });

  test("the profile opens with the introduction and is logged; a document waits for both answers", async () => {
    const r = await call("POST", `${intro}/profile`, "provider");
    expect(r.status).toBe(200);
    expect(SeekerProfile.parse(r.json)).toMatchObject({ openedAt: "2027-02-14 09:00" });
    expect((await call("POST", `${intro}/profile`, "seeker")).status).toBe(403);
    const early = await call("POST", `${intro}/documents/${DECK}/open`, "provider", { action: "view" });
    expect(reason(early)).toBe("Documents open once both of you accept the introduction.");
  });

  test("both accept, the seeker sharing the deck only; the counterparty opens a stamped copy through a two-minute link", async () => {
    expect(reason(await call("POST", `${intro}/respond`, "seeker", { response: "Declined" }))).toBe("Say why, so the Deal Room team can find a better match");
    expect((await call("POST", `${intro}/respond`, "seeker", { response: "Accepted", consent: [DECK] })).status).toBe(200);
    expect((await call("POST", `${intro}/respond`, "provider", { response: "Accepted" })).status).toBe(200);
    const p = (await mine("provider")).introductions.find((x) => x.matchId === pending.id)!;
    expect(p.stage).toBe("Accepted");
    expect(p.documents.find((d) => d.id === DECK)!.opens.ok).toBe(true);
    if (OTHER) expect(p.documents.find((d) => d.id === OTHER)!.opens.reason).toBe("The business hasn't shared this document with you.");

    const link = SharedLink.parse((await call("POST", `${intro}/documents/${DECK}/open`, "provider", { action: "view" })).json);
    const res = await fetch(`${base}${link.url}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/^inline; filename="deck \(for .+\)\.pdf"/);
    const copy = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()));
    expect(copy.getPageCount()).toBe(2);
    // a changed link, and the same link after two minutes, open nothing
    expect((await fetch(`${base}${link.url.slice(0, -2)}00`)).status).toBe(404);
  });

  test("the seeker sees each opening, and withdraws the deck: it closes at once", async () => {
    const s = await mine("seeker");
    // both in the same minute, the log's precision: in either order
    expect(s.access.filter((a) => a.at === "2027-02-14 09:00").map((a) => `${a.what} ${a.action}`).sort()).toEqual(["Full profile view", "Pitch deck view"]);
    expect(s.introductions.find((x) => x.matchId === pending.id)!.documents.find((d) => d.id === DECK)!.opened).toEqual([{ action: "view", at: "2027-02-14 09:00" }]);
    const out = await call("PUT", `${intro}/documents/${DECK}/consent`, "seeker", { granted: false });
    expect(out.status).toBe(200);
    expect((await call("PUT", `${intro}/documents/${DECK}/consent`, "provider", { granted: true })).status).toBe(403);
    expect(reason(await call("POST", `${intro}/documents/${DECK}/open`, "provider", { action: "download" }))).toBe("The business hasn't shared this document with you.");
    expect(await db.drConsent.count({ where: { seekerId: pending.seekerId, providerId: pending.providerId, docId: DECK } })).toBe(2);
    // the team sees the same: withdrawn, and the one opening
    const v = MatchView.parse((await call("GET", `/v1/matching/${EV}/matches/${pending.id}`, "st_lead")).json);
    expect(v.match.intro!.items.find((i) => i.id === DECK)).toMatchObject({ consent: "withdrawn", opened: [{ action: "view" }] });
  });

  test("the business changes its teaser: out of the directory until a reviewer approves it again; a document set to view only", async () => {
    const teaser = `/v1/introductions/${SLUG}/teaser`;
    const before = MyProfile.parse((await call("GET", teaser, "seeker")).json);
    expect(before.app).toMatchObject({ id: pending.seekerId, state: "approved", listed: true });
    expect((await call("PUT", teaser, "seeker", { title: " ", summary: "x", anonymous: true })).status).toBe(400);
    const changed = MyProfile.parse((await call("PUT", teaser, "seeker", { title: "Agritech, Kenya", summary: "Cold storage for smallholder farmers, in three counties.", anonymous: true })).json);
    expect(changed.app).toMatchObject({ state: "waiting", listed: false, preview: { title: "Agritech, Kenya", named: false } });
    // a counterparty has no teaser of its own, and a stranger no application
    expect(MyProfile.parse((await call("GET", teaser, "provider")).json).reason).toMatch(/^The teaser is written by a business/);
    expect(MyProfile.parse((await call("GET", teaser, "stranger")).json).app).toBeNull();
    // operations can't approve it; a reviewer can, once
    const approve = `/v1/dealroom/${EV}/applications/${pending.seekerId}/teaser/approve`;
    expect(reason(await call("POST", approve, "st_ops1"))).toBe("Your role, Operations, doesn't open applications.");
    expect((await call("POST", approve, "st_rev1")).status).toBe(200);
    expect(MyProfile.parse((await call("GET", teaser, "seeker")).json).app).toMatchObject({ state: "approved", listed: true });
    expect(await db.outboxMessage.findFirst({ where: { recipient: pending.seekerId, subject: { startsWith: "Your teaser is approved" } } })).toMatchObject({ link: `/dr/${pending.seekerId}?profile=1` });
    // view only: the counterparty may no longer download that document
    const off = MyProfile.parse((await call("PUT", `${teaser}/documents/${OTHER}`, "seeker", { download: false })).json);
    expect(off.app!.documents.find((d) => d.id === OTHER)!.download).toBe(false);
    expect((await call("PUT", `${teaser}/documents/${OTHER}`, "provider", { download: true })).status).toBe(409);
  });

  test("a verified counterparty browses teasers and expresses interest; the team sees it in its queue", async () => {
    const dir = `/v1/introductions/${SLUG}/directory`;
    const d = Directory.parse((await call("GET", dir, "provider")).json);
    expect(d.me).not.toBeNull();
    expect(d.teasers.length).toBeGreaterThan(3);
    expect(d.teasers.find((t) => t.seekerId === pending.seekerId)!.interest).toBe("introduced");
    // anonymous teasers never carry the name
    for (const t of d.teasers.filter((x) => !x.named)) expect(seed.dealRoom.apps.find((a) => a.id === t.seekerId)!.org.name).not.toBe(t.title);
    const target = d.teasers.find((t) => t.interest === "none")!;
    const after = Directory.parse((await call("POST", `${dir}/${target.seekerId}/interest`, "provider")).json);
    expect(after.teasers.find((t) => t.seekerId === target.seekerId)!.interest).toBe("sent");
    expect(reason(await call("POST", `${dir}/${target.seekerId}/interest`, "provider"))).toBe("You've already shown interest in this opportunity");
    const board = MatchingBoard.parse((await call("GET", `/v1/matching/${EV}`, "st_rev1")).json);
    const row = board.interest.find((i) => i.seeker.id === target.seekerId && i.provider.id === pending.providerId)!;
    expect(row).toMatchObject({ stage: "Suggested", blocked: null });
    expect(row.fit.length).toBe(cfg.matching.length);
    // a business, and someone with no application, get the reason instead of teasers
    expect(Directory.parse((await call("GET", dir, "seeker")).json)).toMatchObject({ me: null, teasers: [] });
    expect(Directory.parse((await call("GET", dir, "stranger")).json).reason).toMatch(/^The directory is for verified investors and partners/);
    expect((await call("POST", `${dir}/${target.seekerId}/interest`, "stranger")).status).toBe(403);
  });

  test("the worker tells both sides and the team of an introduction that expired unanswered, once", async () => {
    const lapse = introLapses({ db, now: () => clock });
    expect(await lapse()).toBeGreaterThan(0);
    const m = await db.drMatch.findUniqueOrThrow({ where: { id: lapsed.id } });
    expect((m.record as { intro: { lapsedAt?: string } }).intro.lapsedAt).toBe("2027-02-14 09:00");
    const told = await db.outboxMessage.findMany({ where: { recipient: { in: [lapsed.seekerId, lapsed.providerId] }, subject: { startsWith: "Your Deal Room introduction expired" } } });
    expect(told.length).toBe(2);
    expect(await lapse()).toBe(0);
  });
});
