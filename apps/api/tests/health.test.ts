/**
 * The health module's layers, each tested with a stand-in for the one below: the controller and routes with a
 * fake service, and the service with a fake repo. No database is needed.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, describe, expect, test } from "vitest";
import { Health } from "@excursia/contracts/http";
import { createHealthController } from "../src/modules/health/health.controller";
import { healthRoutes } from "../src/modules/health/health.routes";
import { createHealthService, type HealthService } from "../src/modules/health/health.service";

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
    const h = await serve({ databaseAnswers: async () => true });
    servers.push(h);
    const res = await fetch(`${h.base}/health/ready`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(Health.parse(await res.json())).toEqual({ status: "ok", db: "ok" });
  });

  test("the database silent makes ready 503, and live still 200", async () => {
    let asked = 0;
    const h = await serve({ databaseAnswers: async () => (asked++, false) });
    servers.push(h);
    expect((await fetch(`${h.base}/health/ready`)).status).toBe(503);
    expect((await fetch(`${h.base}/health/live`)).status).toBe(200);
    expect(asked).toBe(1); // live never asks the database
  });
});

describe("the health service, with a fake repo", () => {
  test("a database that answers is up", async () => {
    expect(await createHealthService({ ping: async () => {} }).databaseAnswers()).toBe(true);
  });

  test("a database that hangs counts as down once the deadline passes", async () => {
    const hanging = { ping: () => new Promise<void>(() => {}) };
    const t = Date.now();
    expect(await createHealthService(hanging, 50).databaseAnswers()).toBe(false);
    expect(Date.now() - t).toBeLessThan(500);
  });

  test("a database that throws counts as down", async () => {
    const failing = { ping: () => Promise.reject(new Error("connection refused")) };
    expect(await createHealthService(failing).databaseAnswers()).toBe(false);
  });
});
