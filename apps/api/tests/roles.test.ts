/**
 * Every role, walked through (M3.6): each Deal Room role signs in, gets the menu the workspace would show it, and
 * opens every staff screen's main read. A screen in its menu opens; a screen not in its menu is refused, so no menu
 * item ends in a refusal and no role reads what its menu hides. Its first screen is in its menu, and every email
 * the team gets links to a screen its recipient can open.
 *
 * The menu and first screen are the web app's own (apps/web/src/features/auth/roles.ts), not a copy.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { SessionView } from "@excursia/contracts/auth";
import { DealRoomOverview } from "@excursia/contracts/dealroom";
import { createDb } from "@excursia/db";
import { seed } from "@excursia/domain/seed";
import { homeOf, menuOf, rolesOf } from "../../web/src/features/auth/roles";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { memoryMailer } from "../src/mail/mailer";
import { linkFor } from "../src/modules/outbox/outbox.service";
import type { Recipient } from "../src/modules/outbox/outbox.repo";
import { createSeedRepo } from "../src/modules/seed/seed.repo";
import { demoRows, demoUserId } from "../src/modules/seed/seed.service";
import { toInstant } from "../src/persistence/time";
import { hashToken, newToken } from "../src/security/secrets";

const WEB = "https://events.example.co.ke";
const EV = "ev_ca3";
const dr = seed.dealRoom;

/** One person in each Deal Room role. */
const STAFF = { lead: "st_lead", reviewer: "st_rev1", operations: "st_ops1", coordinator: "st_coord1", oversight: "st_mom1" } as const;

/** Each staff screen, by the read it opens with. */
const SCREENS: Record<string, string> = {
  "/team/overview": `/v1/dealroom/${EV}/overview`,
  "/team/applications": `/v1/dealroom/${EV}/applications`,
  "/team/matching": `/v1/matching/${EV}`,
  "/team/meetings": `/v1/meetings/${EV}`,
  "/team/sessions": `/v1/sessions/${EV}`,
  "/team/live": `/v1/live/${EV}`,
  "/team/messages": `/v1/dealroom/${EV}/messages`,
  "/team/desk": `/v1/scan/${EV}/devices`,
  "/team/dealroom/settings": `/v1/dealroom/${EV}/settings`,
};

/** What each role's menu holds, written out, so a change to it is a change to this test too. */
const EXPECTED: Record<keyof typeof STAFF, string[]> = {
  lead: Object.keys(SCREENS),
  reviewer: ["/team/overview", "/team/applications", "/team/matching", "/team/sessions", "/team/live", "/team/messages", "/team/dealroom/settings"],
  operations: ["/team/overview", "/team/meetings", "/team/sessions", "/team/live", "/team/messages", "/team/desk"],
  coordinator: ["/team/overview", "/team/matching", "/team/meetings", "/team/sessions", "/team/live", "/team/messages", "/team/desk"],
  oversight: ["/team/overview", "/team/messages"],
};

/** The screen an emailed link opens: one application or pair opens on its list's screen. */
const screenOf = (url: string) => {
  const path = new URL(url).pathname;
  return path.replace(/^\/team\/(applications|matching)\/[a-z]{2}_[a-z0-9_]+$/, "/team/$1");
};

describe.skipIf(!process.env.TEST_DATABASE_URL)("every role, walked through", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 4);
  const seedRepo = createSeedRepo(db);
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "unused", WEB_ORIGINS: WEB, AUTH_SECRET: Buffer.alloc(32, 7).toString("base64") });
  const clock = toInstant(dr.clock);
  let server: Server;
  let base = "";
  const cookies: Record<string, string> = {};
  const views: Record<string, SessionView> = {};

  async function get(path: string, who: string) {
    const res = await fetch(`${base}${path}`, { headers: { Cookie: cookies[who] ?? "" } });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  }
  async function signedIn(userId: string) {
    const token = newToken();
    await db.session.create({ data: { tokenHash: hashToken(token), userId, createdAt: clock, lastSeenAt: clock, expiresAt: new Date(clock.getTime() + 86_400_000), stepUpAt: clock } });
    return `sid=${token}`;
  }
  const menu = (who: string) => menuOf(rolesOf(views[who])).map((i) => i.href);

  beforeAll(async () => {
    await seedRepo.replaceDemo(demoRows());
    const app = createApp({ config, db, mailer: memoryMailer(), now: () => clock, logError: (e) => console.error(e) });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const id of Object.values(STAFF)) {
      cookies[id] = await signedIn(demoUserId(id));
      views[id] = SessionView.parse((await get("/v1/session", id)).json);
    }
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await seedRepo.removeDemo();
    await db.$disconnect();
  });

  test.each(Object.entries(STAFF))("%s: the menu is the role's own", (role, id) => {
    const r = rolesOf(views[id]);
    expect(r.dealRoom).toBe(true);
    expect(r.dealRoomEvent).toBe(EV);
    expect(menu(id)).toEqual(EXPECTED[role as keyof typeof STAFF]);
  });

  test.each(Object.entries(STAFF))("%s: every screen in the menu opens, every other one is refused", async (_role, id) => {
    const mine = menu(id);
    for (const [screen, read] of Object.entries(SCREENS)) {
      const r = await get(read, id);
      expect({ screen, status: r.status }).toEqual({ screen, status: mine.includes(screen) ? 200 : 403 });
    }
  });

  test.each(Object.entries(STAFF))("%s: the first screen is in the menu", (_role, id) => {
    expect(menu(id)).toContain(homeOf(views[id]));
  });

  test("oversight's first screen is the overview, counts only", async () => {
    expect(homeOf(views[STAFF.oversight])).toBe("/team/overview");
    const o = DealRoomOverview.parse((await get(SCREENS["/team/overview"], STAFF.oversight)).json);
    expect(o.event.id).toBe(EV);
    expect(o.applications.submitted).toBeGreaterThan(0);
    // nothing in it names a person, an organisation or an amount
    const strings = JSON.stringify(o).match(/"[^"]*"/g)!.filter((s) => !/^"[a-zA-Z]+"$/.test(s));
    expect(strings.sort()).toEqual([`"${o.event.name}"`, `"${o.event.now}"`, `"${EV}"`].sort());
  });

  test("each role lands on its main work", () => {
    expect(homeOf(views[STAFF.lead])).toBe("/team/applications");
    expect(homeOf(views[STAFF.reviewer])).toBe("/team/applications");
    expect(homeOf(views[STAFF.coordinator])).toBe("/team/matching");
    expect(homeOf(views[STAFF.operations])).toBe("/team/meetings");
  });

  test("every email to the team links to a screen its recipient can open", () => {
    const staffRole = new Map(dr.staff.map((s) => [s.id, s.role]));
    const byRole = { Lead: STAFF.lead, Reviewer: STAFF.reviewer, Operations: STAFF.operations, Coordinator: STAFF.coordinator, Oversight: STAFF.oversight } as const;
    const to: Recipient = { email: "x@example.com", name: "X", kind: "staff", eventId: EV, slug: null, eventName: null, invite: null };
    // what the seed has sent, and what the rules send (meetings.ts, sessions.ts, conversion.ts, reducer.ts) to whom
    const sent = [
      ...dr.outbox.filter((m) => staffRole.has(m.to) && m.link).map((m) => ({ role: staffRole.get(m.to)!, link: m.link! })),
      { role: "Reviewer", link: "/dealroom/matching?tab=interest" },
      { role: "Operations", link: "/dealroom/meetings" },
      { role: "Operations", link: "/dealroom/meetings?tab=Changes" },
      { role: "Operations", link: "/dealroom/sessions" },
      { role: "Coordinator", link: "/dealroom/sessions" },
      { role: "Lead", link: "/dealroom/live" },
      { role: "Lead", link: "/dealroom/reports?day=2027-02-15" },
      { role: "Lead", link: "/dealroom/reports?tab=Conversion" },
      { role: "Lead", link: "/dealroom/opportunities?tab=Export" },
      { role: "Coordinator", link: "/dealroom/opportunities" },
      { role: "Oversight", link: "/dealroom/opportunities" },
    ];
    expect(sent.length).toBeGreaterThan(11);
    for (const m of sent) {
      const who = byRole[m.role as keyof typeof byRole];
      const screen = screenOf(linkFor(WEB, to, m.link));
      // /team sends each person on to their own first screen
      if (screen !== "/team") expect({ ...m, screen, opens: menu(who).includes(screen) }).toEqual({ ...m, screen, opens: true });
    }
  });
});
