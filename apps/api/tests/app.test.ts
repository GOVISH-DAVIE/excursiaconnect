/**
 * The API's frame: health, CORS for the web app only, and errors that always come back in the contract's shape.
 * Runs the real app on a random port. The database checks use the test database as the app role and skip where
 * TEST_DATABASE_URL is not set.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";
import { ErrorBody, Health } from "@excursia/contracts/http";
import { createDb, type Db } from "@excursia/db";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { errorHandler, HttpError, notFound } from "../src/http/errors";

const WEB = "https://events.example.co.ke";

async function listen(app: Express) {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise<void>((r) => server.close(() => r())) };
}

async function start(db: Db) {
  const config = loadConfig({ NODE_ENV: "test", DATABASE_URL: "postgresql://unused", WEB_ORIGINS: WEB });
  const logged: unknown[] = [];
  return { ...(await listen(createApp({ config, db, logError: (err) => logged.push(err) }))), logged };
}

describe("an API whose database is unreachable", () => {
  // port 1 refuses at once: ready must say so rather than hang
  const db = createDb("postgresql://nobody:nothing@127.0.0.1:1/none", 1);
  let api: Awaited<ReturnType<typeof start>>;
  beforeAll(async () => {
    api = await start(db);
  });
  afterAll(async () => {
    await api.close();
    await db.$disconnect();
  });

  test("live answers without the database", async () => {
    const res = await fetch(`${api.base}/health/live`);
    expect(res.status).toBe(200);
    expect(Health.parse(await res.json())).toEqual({ status: "ok" });
  });

  test("ready says the database is down, with 503, quickly", async () => {
    const t = Date.now();
    const res = await fetch(`${api.base}/health/ready`);
    expect(res.status).toBe(503);
    expect(Health.parse(await res.json())).toEqual({ status: "unavailable", db: "down" });
    expect(Date.now() - t).toBeLessThan(3000);
  });

  test("the web app's origin may call with cookies", async () => {
    const res = await fetch(`${api.base}/health/live`, {
      method: "OPTIONS",
      headers: { Origin: WEB, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(WEB);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("any other origin gets no CORS headers", async () => {
    const res = await fetch(`${api.base}/health/live`, { headers: { Origin: "https://evil.example" } });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("security headers are set and Express does not announce itself", async () => {
    const res = await fetch(`${api.base}/health/live`);
    expect(res.headers.get("x-powered-by")).toBeNull();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  test("an unknown route is a 404 in the contract's shape", async () => {
    const res = await fetch(`${api.base}/nowhere`);
    expect(res.status).toBe(404);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("not_found");
  });

  test("a body that is not JSON is the client's error, not ours", async () => {
    const res = await fetch(`${api.base}/health/live`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
    expect(res.status).toBe(400);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("bad_request");
  });

  test("a body over 100 kB is refused with 413", async () => {
    const res = await fetch(`${api.base}/health/live`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: "a".repeat(110_000) }) });
    expect(res.status).toBe(413);
    expect(ErrorBody.parse(await res.json()).error.code).toBe("payload_too_large");
  });
});

describe("the error handler", () => {
  // the handlers createApp ends with, behind two routes that fail on purpose
  const logged: unknown[] = [];
  let h: Awaited<ReturnType<typeof listen>>;
  beforeAll(async () => {
    const app = express();
    app.get("/boom", () => {
      throw new Error("a bug with a secret in it");
    });
    app.post("/refuse", () => {
      throw new HttpError("conflict", "That table is already booked at 10:00");
    });
    app.get("/contract", (req) => {
      z.object({ eventId: z.string(), size: z.coerce.number() }).parse(req.query);
    });
    app.use(notFound);
    app.use(errorHandler((err) => logged.push(err)));
    h = await listen(app);
  });
  afterAll(() => h.close());

  test("a refusal keeps its reason", async () => {
    const res = await fetch(`${h.base}/refuse`, { method: "POST" });
    expect(res.status).toBe(409);
    expect(ErrorBody.parse(await res.json()).error).toEqual({ code: "conflict", message: "That table is already booked at 10:00" });
  });

  test("a bug is logged, and the browser learns nothing about it", async () => {
    const res = await fetch(`${h.base}/boom`);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("secret");
    expect(ErrorBody.parse(JSON.parse(text)).error.code).toBe("internal");
    expect(logged).toHaveLength(1);
  });

  test("a request that breaks the contract names the fields, not the values", async () => {
    const res = await fetch(`${h.base}/contract?size=lots`);
    expect(res.status).toBe(400);
    const { error } = ErrorBody.parse(await res.json());
    expect(error.code).toBe("bad_request");
    expect(error.fields?.sort()).toEqual(["eventId", "size"]);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("an API with its database", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 2);
  let api: Awaited<ReturnType<typeof start>>;
  beforeAll(async () => {
    api = await start(db);
  });
  afterAll(async () => {
    await api.close();
    await db.$disconnect();
  });

  test("ready says ok", async () => {
    const res = await fetch(`${api.base}/health/ready`);
    expect(res.status).toBe(200);
    expect(Health.parse(await res.json())).toEqual({ status: "ok", db: "ok" });
  });
});

describe("the API's settings", () => {
  test("production needs https origins and a cookie domain, and names what is wrong without its value", () => {
    expect(() => loadConfig({ NODE_ENV: "production", DATABASE_URL: "postgresql://u:hunter2@db/x", WEB_ORIGINS: "http://events.example.co.ke" })).toThrow(
      /WEB_ORIGINS[\s\S]*COOKIE_DOMAIN/,
    );
    try {
      loadConfig({ NODE_ENV: "production", DATABASE_URL: "postgresql://u:hunter2@db/x" });
    } catch (e) {
      expect(String(e)).not.toContain("hunter2");
    }
  });

  test("a missing database URL stops the start", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  test("origins are a comma-separated list", () => {
    const c = loadConfig({ DATABASE_URL: "x", WEB_ORIGINS: "https://a.example, https://b.example" });
    expect(c.WEB_ORIGINS).toEqual(["https://a.example", "https://b.example"]);
    expect(c.API_HOST).toBe("127.0.0.1");
  });
});
