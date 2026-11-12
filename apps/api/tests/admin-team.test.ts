/**
 * Algotech's team: two levels. Super admins invite admins (an email goes out), change their level and remove them;
 * an admin can't; nobody removes themselves, Algotech always keeps a super admin, and a removed admin is signed
 * out everywhere at once.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ErrorBody } from "@excursia/contracts/http";
import { AdminMember } from "@excursia/contracts/onboarding";
import { createDb } from "@excursia/db";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mail/mailer";
import { createPlatformRepo } from "../src/modules/platform/platform.repo";
import { hashToken, newToken } from "../src/security/secrets";

const WEB = "https://events.example.co.ke";
const run = Date.now().toString(36);
const at = (who: string) => `${who}@${run}.team.example`;

describe.skipIf(!process.env.TEST_DATABASE_URL)("Algotech's team", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 4);
  const platform = createPlatformRepo(db);
  let server: Server;
  let base = "";
  const jar: Record<string, string> = {};
  const ids: Record<string, string> = {};

  async function signIn(who: string, userId: string, opts: { skipped?: boolean } = {}) {
    const token = newToken();
    const now = new Date();
    await db.session.create({ data: { tokenHash: hashToken(token), userId, createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + 3_600_000), stepUpAt: opts.skipped ? null : now, mfaSkipped: !!opts.skipped } });
    jar[who] = token;
  }
  async function call(method: string, path: string, who?: string, body?: unknown) {
    const headers: Record<string, string> = { "X-Forwarded-For": `10.77.${run.length}.${Object.keys(jar).indexOf(who ?? "") + 2}` };
    if (who) headers.Cookie = `sid=${jar[who]}`;
    if (method !== "GET") headers.Origin = WEB;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  }
  const errorOf = (r: { json: unknown }) => ErrorBody.parse(r.json).error;
  const team = (r: { json: unknown }) => AdminMember.array().parse(r.json);

  beforeAll(async () => {
    const app = createApp({ config: loadConfig({ NODE_ENV: "test", DATABASE_URL: "unused", WEB_ORIGINS: WEB, AUTH_SECRET: Buffer.alloc(32, 3).toString("base64") }), db, mailer: memoryMailer(), logError: (e) => console.error(e) });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const [who, superAdmin] of [["chief", true], ["clerk", false]] as const) {
      const r = await platform.createAdmin(at(who), `${who} Algotech`, superAdmin);
      if (!("id" in r)) throw new Error("not made");
      ids[who] = r.id!;
      await signIn(who, r.id!);
    }
    await signIn("lazychief", ids.chief, { skipped: true });
    ids.owner = (await db.user.create({ data: { kind: "staff", email: at("owner"), name: "An Owner" } })).id;
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    const users = await db.user.findMany({ where: { email: { contains: `@${run}.team.example` } }, select: { id: true } });
    await db.outboxMessage.deleteMany({ where: { recipient: { in: users.map((u) => `user:${u.id}`) } } });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.$disconnect();
  });

  test("only a super admin sees and changes the team", async () => {
    expect((await call("GET", "/v1/admin/team", "clerk")).status).toBe(403);
    expect((await call("POST", "/v1/admin/team", "clerk", { name: "Someone", email: at("someone") })).status).toBe(403);
    const list = team(await call("GET", "/v1/admin/team", "chief"));
    expect(list.find((m) => m.id === ids.chief)).toMatchObject({ superAdmin: true, me: true });
    expect(list.find((m) => m.id === ids.clerk)).toMatchObject({ superAdmin: false, status: "invited" });
  });

  test("an invitation makes the account, gives its level, and emails the person", async () => {
    // changing the team needs the authenticator, not "set up later"
    expect((await call("POST", "/v1/admin/team", "lazychief", { name: "New Person", email: at("new") })).status).toBe(403);
    const r = await call("POST", "/v1/admin/team", "chief", { name: "New Person", email: at("new"), superAdmin: true });
    expect(r.status).toBe(201);
    const member = team(r).find((m) => m.email === at("new"))!;
    expect(member).toMatchObject({ superAdmin: true, status: "invited" });
    const mail = await db.outboxMessage.findFirst({ where: { recipient: `user:${member.id}` } });
    expect(mail?.subject).toMatch(/^You are a super admin for Algotech/);
    // an organiser's email can't also be an admin
    const clash = await call("POST", "/v1/admin/team", "chief", { name: "An Owner", email: at("owner") });
    expect(clash.status).toBe(409);
    ids.new = member.id;
  });

  test("levels change, but nobody changes or removes themselves", async () => {
    expect(errorOf(await call("POST", `/v1/admin/team/${ids.chief}/level`, "chief", { superAdmin: false })).message).toMatch(/Another super admin/);
    expect(errorOf(await call("POST", `/v1/admin/team/${ids.chief}/remove`, "chief")).message).toMatch(/Another super admin/);
    expect(team(await call("POST", `/v1/admin/team/${ids.clerk}/level`, "chief", { superAdmin: true })).find((m) => m.id === ids.clerk)?.superAdmin).toBe(true);
    expect(team(await call("POST", `/v1/admin/team/${ids.clerk}/level`, "chief", { superAdmin: false })).find((m) => m.id === ids.clerk)?.superAdmin).toBe(false);
  });

  test("a removed admin is signed out everywhere at once, and can't come back by signing in", async () => {
    expect((await call("GET", "/v1/admin/queue", "clerk")).status).toBe(200);
    const r = await call("POST", `/v1/admin/team/${ids.clerk}/remove`, "chief");
    expect(team(r).find((m) => m.id === ids.clerk)?.status).toBe("removed");
    expect((await call("GET", "/v1/admin/queue", "clerk")).status).toBe(401);
    expect(await db.membership.count({ where: { userId: ids.clerk, revokedAt: null } })).toBe(0);
  });

  test("Algotech always keeps a super admin", async () => {
    const r = await platform.setLevel(ids.chief, false, { userId: ids.new, ip: null });
    expect(r).toBe("ok"); // another super admin (new) remains
    expect(await platform.setLevel(ids.new, false, { userId: ids.chief, ip: null })).toBe(await expectedLast());
    async function expectedLast() {
      const others = await db.membership.count({ where: { role: "super_admin", revokedAt: null, userId: { not: ids.new } } });
      return others === 0 ? "last_super" : "ok";
    }
  });
});
