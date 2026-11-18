/**
 * The health module's layers, each tested with a stand-in for the one below: the controller and routes with a
 * fake service, and the service with a fake repo. No database is needed.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, describe, expect, test } from "vitest";
import { Health, QueueHealth } from "@excursia/contracts/http";
import { createHealthController } from "../src/modules/health/health.controller";
import { healthRoutes } from "../src/modules/health/health.routes";
import type { QueueCounts } from "../src/modules/health/health.repo";
import { createHealthService, queueProblems, type HealthService } from "../src/modules/health/health.service";

const QUIET: QueueCounts = { outboxDue: 0, outboxOldestDueSeconds: 0, outboxFailedToday: 0, scansDue: 0, scansOldestDueSeconds: 0, scansRejectedToday: 0, scansFailing: 0, scansFailingOldestSeconds: 0, retentionOverdue: 0 };
const fakeService = (up: () => Promise<boolean>, counts = QUIET): HealthService => ({ databaseAnswers: up, queues: async () => ({ counts, problems: queueProblems(counts) }) });

async function serve(service: HealthService) {
  const app = express();
  app.use("/health", healthRoutes(createHealthController(service)));
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise<void>((r) => server.close(() => r())) };
}

describe("the health controller, behind its routes, with a fake service", () => {
  const servers: { close: () => Promise<void> }[] = [];
  afterAll(() => Promise.all(servers.map((s) => s.close())));

  test("the database answering makes ready 200 and never cached", async () => {
    const h = await serve(fakeService(async () => true));
    servers.push(h);
    const res = await fetch(`${h.base}/health/ready`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(Health.parse(await res.json())).toEqual({ status: "ok", db: "ok" });
  });

  test("the database silent makes ready 503, and live still 200", async () => {
    let asked = 0;
    const h = await serve(fakeService(async () => (asked++, false)));
    servers.push(h);
    expect((await fetch(`${h.base}/health/ready`)).status).toBe(503);
    expect((await fetch(`${h.base}/health/live`)).status).toBe(200);
    expect(asked).toBe(1); // live never asks the database
  });

  test("queues answer 200 when the worker keeps up, 503 with the reason when it doesn't", async () => {
    const fine = await serve(fakeService(async () => true, { ...QUIET, outboxDue: 2, outboxOldestDueSeconds: 4 }));
    servers.push(fine);
    const ok = await fetch(`${fine.base}/health/queues`);
    expect(ok.status).toBe(200);
    expect(QueueHealth.parse(await ok.json())).toMatchObject({ status: "ok", problems: [], outbox: { due: 2 } });
    const stuck = await serve(fakeService(async () => true, { ...QUIET, scansDue: 3, scansOldestDueSeconds: 600 }));
    servers.push(stuck);
    const behind = await fetch(`${stuck.base}/health/queues`);
    expect(behind.status).toBe(503);
    expect(QueueHealth.parse(await behind.json()).problems).toEqual([expect.stringMatching(/3 uploads waiting for the virus scan, the oldest for 600 s/)]);
  });
});

describe("what counts as the worker falling behind", () => {
  test("seconds of waiting are normal; minutes, failed emails in bulk or overdue deletions are not", () => {
    expect(queueProblems({ ...QUIET, outboxDue: 40, outboxOldestDueSeconds: 30, scansDue: 5, scansOldestDueSeconds: 20, outboxFailedToday: 3 })).toEqual([]);
    expect(queueProblems({ ...QUIET, outboxDue: 1, outboxOldestDueSeconds: 300 })).toEqual(["1 email waiting, the oldest for 300 s: is the worker running?"]);
    expect(queueProblems({ ...QUIET, outboxFailedToday: 21 })).toEqual([expect.stringMatching(/21 emails failed/)]);
    expect(queueProblems({ ...QUIET, retentionOverdue: 1 })).toEqual(["1 file past their retention date not deleted"]);
    // a scanner that is down keeps rescheduling its files, so they are judged by how long they have waited
    expect(queueProblems({ ...QUIET, scansFailing: 2, scansFailingOldestSeconds: 60 })).toEqual([]);
    expect(queueProblems({ ...QUIET, scansFailing: 2, scansFailingOldestSeconds: 300 })).toEqual([expect.stringMatching(/2 uploads the virus scanner failed on, .* is clamd running/)]);
  });
});

describe("the health service, with a fake repo", () => {
  test("a database that answers is up", async () => {
    expect(await createHealthService({ ping: async () => {}, queues: async () => QUIET }).databaseAnswers()).toBe(true);
  });

  test("a database that hangs counts as down once the deadline passes", async () => {
    const hanging = { ping: () => new Promise<void>(() => {}), queues: async () => QUIET };
    const t = Date.now();
    expect(await createHealthService(hanging, 50).databaseAnswers()).toBe(false);
    expect(Date.now() - t).toBeLessThan(500);
  });

  test("a database that throws counts as down", async () => {
    const failing = { ping: () => Promise.reject(new Error("connection refused")), queues: async () => QUIET };
    expect(await createHealthService(failing).databaseAnswers()).toBe(false);
  });
});
