/**
 * The M-Pesa client (M1.7) against a stand-in Daraja: the OAuth token (fetched once, reused), the STK push's
 * password and fields, the query's three answers, Daraja's errors as messages a payer can read; and the helpers
 * that read phone numbers and callbacks. The settings refuse half an M-Pesa setup, and production never gets the
 * test one.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { loadConfig, mpesaMode } from "../src/config";
import { daraja, darajaTimestamp, msisdn, readCallback, testMpesa } from "../src/payments/mpesa";

describe("reading what M-Pesa needs", () => {
  test("Kenyan mobile numbers, however written; anything else is refused", () => {
    for (const n of ["0712345678", "+254712345678", "254712345678", "0712 345 678", "(0712) 345-678"]) expect(msisdn(n)).toBe("254712345678");
    expect(msisdn("0110345678")).toBe("254110345678");
    for (const n of ["0212345678", "12345", "+255712345678", "07123456789", "abc"]) expect(msisdn(n)).toBeNull();
  });

  test("Daraja's timestamp is Nairobi time", () => {
    expect(darajaTimestamp(new Date("2026-12-16T06:05:09Z"))).toBe("20261216090509");
  });

  test("a callback's result, amount, receipt and phone; anything else isn't one", () => {
    const body = {
      Body: {
        stkCallback: {
          MerchantRequestID: "m", CheckoutRequestID: "ws_CO_1", ResultCode: 0, ResultDesc: "ok",
          CallbackMetadata: { Item: [{ Name: "Amount", Value: 32500 }, { Name: "MpesaReceiptNumber", Value: "SLK4ABC123" }, { Name: "TransactionDate", Value: 20261216090509 }, { Name: "PhoneNumber", Value: 254712345678 }] },
        },
      },
    };
    expect(readCallback(body)).toEqual({ checkoutRequestId: "ws_CO_1", resultCode: 0, resultDesc: "ok", amount: 32500, receipt: "SLK4ABC123", phone: "254712345678" });
    expect(readCallback({ Body: { stkCallback: { CheckoutRequestID: "ws_CO_2", ResultCode: 1032, ResultDesc: "Request cancelled by user" } } })).toMatchObject({ resultCode: 1032, receipt: undefined });
    expect(readCallback({ hello: "world" })).toBeNull();
    expect(readCallback(null)).toBeNull();
  });
});

describe("the Daraja client, against a stand-in Daraja", () => {
  let server: Server;
  let base = "";
  const seen: { path: string; auth?: string; body?: Record<string, unknown> }[] = [];
  let tokens = 0;
  let queryAnswer: { status: number; body: object } = { status: 200, body: {} };
  let pushAnswer: { status: number; body: object } = { status: 200, body: {} };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = raw ? JSON.parse(raw) : undefined;
        seen.push({ path: req.url!, auth: req.headers.authorization, body });
        const send = (status: number, b: object) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(b));
        if (req.url!.startsWith("/oauth/v1/generate")) {
          if (req.headers.authorization !== `Basic ${Buffer.from("key:secret").toString("base64")}`) return send(400, { errorMessage: "Invalid credentials" });
          tokens++;
          return send(200, { access_token: `tok${tokens}`, expires_in: "3599" });
        }
        if (req.headers.authorization !== `Bearer tok${tokens}`) return send(401, { errorMessage: "Invalid Access Token" });
        if (req.url === "/mpesa/stkpush/v1/processrequest") return send(pushAnswer.status, pushAnswer.body);
        if (req.url === "/mpesa/stkpushquery/v1/query") return send(queryAnswer.status, queryAnswer.body);
        send(404, {});
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const client = (over: Partial<Parameters<typeof daraja>[0]> = {}) =>
    daraja({ env: "sandbox", consumerKey: "key", consumerSecret: "secret", shortcode: "174379", passkey: "pass", type: "paybill", baseUrl: base, timeoutMs: 3000, ...over });
  const push = { phone: "254712345678", amount: 32500, reference: "EAGCCS00001X", description: "Deal Room fee", callbackUrl: "https://api.example/v1/hooks/mm/abc" };

  test("a push signs in once, sends the paybill's fields and password, and returns the request's id", async () => {
    pushAnswer = { status: 200, body: { MerchantRequestID: "m1", CheckoutRequestID: "ws_CO_123", ResponseCode: "0", ResponseDescription: "Success", CustomerMessage: "Success. Request accepted for processing" } };
    const mpesa = client();
    expect(await mpesa.push(push)).toEqual({ checkoutRequestId: "ws_CO_123", customerMessage: "Success. Request accepted for processing" });
    await mpesa.push(push);
    expect(tokens).toBe(1); // the token is reused while it lasts
    const sent = seen.filter((s) => s.path === "/mpesa/stkpush/v1/processrequest").at(-1)!.body!;
    expect(sent).toMatchObject({
      BusinessShortCode: "174379", TransactionType: "CustomerPayBillOnline", Amount: 32500, PartyA: "254712345678", PartyB: "174379", PhoneNumber: "254712345678",
      CallBackURL: push.callbackUrl, AccountReference: "EAGCCS00001X", TransactionDesc: "Deal Room fee",
    });
    expect(Buffer.from(String(sent.Password), "base64").toString()).toBe(`174379pass${sent.Timestamp}`);
  });

  test("a till is paid as buy goods, to the till", async () => {
    await client({ type: "till", till: "5551234" }).push(push);
    expect(seen.filter((s) => s.path === "/mpesa/stkpush/v1/processrequest").at(-1)!.body).toMatchObject({ TransactionType: "CustomerBuyGoodsOnline", PartyB: "5551234" });
  });

  test("Daraja's refusal reads as a message for the payer", async () => {
    pushAnswer = { status: 400, body: { requestId: "r", errorCode: "400.002.02", errorMessage: "Bad Request - Invalid PhoneNumber" } };
    await expect(client().push(push)).rejects.toThrow("M-Pesa didn't take the request: Bad Request - Invalid PhoneNumber");
    await expect(client({ consumerSecret: "wrong" }).push(push)).rejects.toThrow(/refused the platform's sign-in/);
    await expect(client({ baseUrl: "http://127.0.0.1:1" }).push(push)).rejects.toThrow(/can't be reached/);
  });

  test("the query: paid, failed with Daraja's reason, or still on the phone", async () => {
    const mpesa = client();
    queryAnswer = { status: 200, body: { ResponseCode: "0", ResultCode: "0", ResultDesc: "The service request is processed successfully." } };
    expect(await mpesa.query("ws_CO_123")).toMatchObject({ state: "paid", code: "0" });
    queryAnswer = { status: 200, body: { ResponseCode: "0", ResultCode: "1032", ResultDesc: "Request cancelled by user" } };
    expect(await mpesa.query("ws_CO_123")).toEqual({ state: "failed", code: "1032", description: "Request cancelled by user" });
    queryAnswer = { status: 500, body: { requestId: "r", errorCode: "500.001.1001", errorMessage: "The transaction is being processed" } };
    expect(await mpesa.query("ws_CO_123")).toMatchObject({ state: "pending" });
    queryAnswer = { status: 500, body: { errorCode: "500.003.02", errorMessage: "System is busy" } };
    await expect(mpesa.query("ws_CO_123")).rejects.toThrow(/status check failed: System is busy/);
  });
});

describe("the test M-Pesa", () => {
  test("pays a few seconds after the push, or cancels for a number ending 0001; it calls back on its own", async () => {
    const calls: unknown[] = [];
    const server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        calls.push(JSON.parse(raw));
        res.end("{}");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/cb`;
    const mpesa = testMpesa(150);
    const ok = await mpesa.push({ phone: "254712345678", amount: 100, reference: "R", description: "D", callbackUrl: url });
    const no = await mpesa.push({ phone: "254700000001", amount: 100, reference: "R", description: "D", callbackUrl: url });
    expect((await mpesa.query(ok.checkoutRequestId)).state).toBe("pending");
    await new Promise((r) => setTimeout(r, 400));
    expect((await mpesa.query(ok.checkoutRequestId)).state).toBe("paid");
    expect(await mpesa.query(no.checkoutRequestId)).toMatchObject({ state: "failed", code: "1032" });
    expect(calls.map((c) => readCallback(c)?.resultCode).sort()).toEqual([0, 1032]);
    expect(readCallback(calls.find((c) => readCallback(c)?.resultCode === 0))).toMatchObject({ amount: 100, phone: "254712345678" });
    await new Promise<void>((r) => server.close(() => r()));
  });
});

describe("M-Pesa's settings", () => {
  const base = { DATABASE_URL: "x", AUTH_SECRET: Buffer.alloc(32, 1).toString("base64") };
  test("all of the keys or none; a till needs its number; production needs Daraja's production", () => {
    expect(() => loadConfig({ ...base, MPESA_CONSUMER_KEY: "k" })).toThrow(/MPESA_CONSUMER_SECRET.*\n.*MPESA_SHORTCODE|MPESA_SHORTCODE/s);
    const full = { ...base, MPESA_CONSUMER_KEY: "k", MPESA_CONSUMER_SECRET: "s", MPESA_SHORTCODE: "174379", MPESA_PASSKEY: "p", PUBLIC_API_URL: "https://api.example.co.ke" };
    expect(mpesaMode(loadConfig(full))).toBe("daraja");
    expect(() => loadConfig({ ...full, MPESA_TYPE: "till" })).toThrow(/MPESA_TILL/);
    expect(() => loadConfig({ ...full, APP_ENV: "production", CLAMD_ADDRESS: "127.0.0.1:3310" })).toThrow(/MPESA_ENV: must be production/);
  });
  test("without keys: the test M-Pesa locally and on staging, none in production", () => {
    expect(mpesaMode(loadConfig(base))).toBe("test");
    expect(mpesaMode(loadConfig({ ...base, APP_ENV: "staging" }))).toBe("test");
    expect(mpesaMode(loadConfig({ ...base, APP_ENV: "production", CLAMD_ADDRESS: "127.0.0.1:3310" }))).toBe("off");
  });
});
