/**
 * M-Pesa, through Safaricom's Daraja API (D5, backend-plan.md "Webhooks"): the STK push that puts a payment request
 * on the payer's phone, and the STK push query that says how it ended. The callback Daraja sends is only a hint:
 * a payment is settled after the query confirms it (payments.service.ts).
 *
 * Two of them: `daraja`, the real one (sandbox or production), and `testMpesa`, which stands in away from production
 * when no keys are set. The test one calls back itself after a few seconds, so the whole path runs locally; a phone
 * number ending in 0001 cancels, as a payer who declines on their phone.
 */
import { randomBytes } from "node:crypto";
import { mpesaMode, type Config } from "../config";

export type PushRequest = {
  /** 2547XXXXXXXX or 2541XXXXXXXX */
  phone: string;
  /** whole shillings */
  amount: number;
  /** shown to the payer as the account: 12 characters at most */
  reference: string;
  /** 13 characters at most */
  description: string;
  callbackUrl: string;
};
export type PushResult = { checkoutRequestId: string; customerMessage: string };
/** How a push ended: paid, failed (cancelled, timed out, not enough money…), or still on the phone. */
export type QueryResult = { state: "paid" | "failed" | "pending"; code: string; description: string };

export interface Mpesa {
  readonly name: "daraja" | "test";
  push(req: PushRequest): Promise<PushResult>;
  query(checkoutRequestId: string): Promise<QueryResult>;
}

/** M-Pesa refused or couldn't be reached; the message is safe to show the payer. */
export class MpesaError extends Error {
  name = "MpesaError";
}

/** A Kenyan mobile number as Daraja takes it, from 07…, 01…, +254… or 254…; null if it isn't one. */
export function msisdn(input: string): string | null {
  const d = input.replace(/[\s()-]/g, "").replace(/^\+/, "");
  const m = /^(?:254|0)?([17]\d{8})$/.exec(d);
  return m ? `254${m[1]}` : null;
}

/** Daraja's timestamp, YYYYMMDDHHmmss in Nairobi time (UTC+3, no daylight saving). */
export function darajaTimestamp(at = new Date()): string {
  return new Date(at.getTime() + 3 * 3_600_000).toISOString().replace(/\D/g, "").slice(0, 14);
}

/** What the callback says, picked out of Daraja's shape; null if it isn't a callback at all. */
export function readCallback(body: unknown): { checkoutRequestId: string; resultCode: number; resultDesc: string; amount?: number; receipt?: string; phone?: string } | null {
  const cb = (body as { Body?: { stkCallback?: Record<string, unknown> } })?.Body?.stkCallback;
  if (!cb || typeof cb.CheckoutRequestID !== "string") return null;
  const items = ((cb.CallbackMetadata as { Item?: { Name: string; Value?: unknown }[] } | undefined)?.Item ?? []).reduce<Record<string, unknown>>((o, i) => ({ ...o, [i.Name]: i.Value }), {});
  return {
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode: Number(cb.ResultCode),
    resultDesc: String(cb.ResultDesc ?? ""),
    amount: items.Amount === undefined ? undefined : Number(items.Amount),
    receipt: items.MpesaReceiptNumber === undefined ? undefined : String(items.MpesaReceiptNumber),
    phone: items.PhoneNumber === undefined ? undefined : String(items.PhoneNumber),
  };
}

type DarajaConfig = {
  env: "sandbox" | "production";
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  type: "paybill" | "till";
  till?: string;
  /** for tests: a stand-in Daraja */
  baseUrl?: string;
  timeoutMs?: number;
};

export function daraja(c: DarajaConfig): Mpesa {
  const base = c.baseUrl ?? (c.env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke");
  const timeoutMs = c.timeoutMs ?? 15_000;
  let token: { value: string; until: number } | null = null;

  async function call(path: string, init: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      throw new MpesaError(`M-Pesa can't be reached right now (${(e as Error).name}). Try again in a few minutes.`);
    }
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { errorMessage: text.slice(0, 200) };
    }
    return { status: res.status, body };
  }

  async function bearer(): Promise<string> {
    if (token && token.until > Date.now()) return token.value;
    const basic = Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString("base64");
    const r = await call("/oauth/v1/generate?grant_type=client_credentials", { method: "GET", headers: { Authorization: `Basic ${basic}` } });
    if (r.status !== 200 || typeof r.body.access_token !== "string") throw new MpesaError("M-Pesa refused the platform's sign-in. The team has been told.");
    // Daraja's tokens last an hour: renew a minute early
    token = { value: r.body.access_token, until: Date.now() + (Number(r.body.expires_in ?? 3599) - 60) * 1000 };
    return token.value;
  }

  const secret = (timestamp: string) => Buffer.from(`${c.shortcode}${c.passkey}${timestamp}`).toString("base64");
  const post = async (path: string, body: object) =>
    call(path, { method: "POST", headers: { Authorization: `Bearer ${await bearer()}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

  return {
    name: "daraja",
    async push(req) {
      const timestamp = darajaTimestamp();
      const r = await post("/mpesa/stkpush/v1/processrequest", {
        BusinessShortCode: c.shortcode,
        Password: secret(timestamp),
        Timestamp: timestamp,
        TransactionType: c.type === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
        Amount: req.amount,
        PartyA: req.phone,
        PartyB: c.type === "till" ? c.till : c.shortcode,
        PhoneNumber: req.phone,
        CallBackURL: req.callbackUrl,
        AccountReference: req.reference.slice(0, 12),
        TransactionDesc: req.description.slice(0, 13),
      });
      if (r.status !== 200 || r.body.ResponseCode !== "0" || typeof r.body.CheckoutRequestID !== "string")
        throw new MpesaError(`M-Pesa didn't take the request: ${String(r.body.errorMessage ?? r.body.ResponseDescription ?? `status ${r.status}`)}`);
      return { checkoutRequestId: r.body.CheckoutRequestID, customerMessage: String(r.body.CustomerMessage ?? "") };
    },
    async query(checkoutRequestId) {
      const timestamp = darajaTimestamp();
      const r = await post("/mpesa/stkpushquery/v1/query", { BusinessShortCode: c.shortcode, Password: secret(timestamp), Timestamp: timestamp, CheckoutRequestID: checkoutRequestId });
      // while the payer still has the request on their phone, Daraja answers with an error that says so
      if (r.status !== 200) {
        const msg = String(r.body.errorMessage ?? "");
        if (/being processed/i.test(msg)) return { state: "pending", code: String(r.body.errorCode ?? ""), description: msg };
        throw new MpesaError(`M-Pesa's status check failed: ${msg || `status ${r.status}`}`);
      }
      const code = String(r.body.ResultCode ?? "");
      return { state: code === "0" ? "paid" : "failed", code, description: String(r.body.ResultDesc ?? "") };
    },
  };
}

/** The test M-Pesa: accepts every push, calls back after `delayMs`, and a number ending in 0001 cancels. */
export function testMpesa(delayMs = 3_000): Mpesa {
  const outcome = (id: string) => (id.includes("_cancel_") ? { code: "1032", description: "Request cancelled by user" } : { code: "0", description: "The service request is processed successfully." });
  return {
    name: "test",
    async push(req) {
      const kind = req.phone.endsWith("0001") ? "cancel" : "ok";
      const checkoutRequestId = `ws_CO_TEST_${Date.now()}_${kind}_${randomBytes(4).toString("hex")}`;
      setTimeout(() => {
        const o = outcome(checkoutRequestId);
        const paid = o.code === "0";
        const body = {
          Body: {
            stkCallback: {
              MerchantRequestID: "test",
              CheckoutRequestID: checkoutRequestId,
              ResultCode: Number(o.code),
              ResultDesc: o.description,
              ...(paid
                ? {
                    CallbackMetadata: {
                      Item: [
                        { Name: "Amount", Value: req.amount },
                        { Name: "MpesaReceiptNumber", Value: `TST${checkoutRequestId.slice(-7).toUpperCase()}` },
                        { Name: "TransactionDate", Value: Number(darajaTimestamp()) },
                        { Name: "PhoneNumber", Value: Number(req.phone) },
                      ],
                    },
                  }
                : {}),
            },
          },
        };
        fetch(req.callbackUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch((e) => console.error("[test M-Pesa] callback failed", e));
      }, delayMs).unref();
      return { checkoutRequestId, customerMessage: "Success. Request accepted for processing" };
    },
    async query(checkoutRequestId) {
      const at = Number(checkoutRequestId.split("_")[3]);
      if (Date.now() - at < delayMs) return { state: "pending", code: "500.001.1001", description: "The transaction is being processed" };
      const o = outcome(checkoutRequestId);
      return { state: o.code === "0" ? "paid" : "failed", ...o };
    },
  };
}

/** M-Pesa as the settings say (config.ts, mpesaMode): Daraja with keys, the test one locally, else none. */
export function mpesaFor(config: Config): Mpesa | null {
  const mode = mpesaMode(config);
  if (mode === "off") return null;
  if (mode === "test") return testMpesa();
  return daraja({
    env: config.MPESA_ENV,
    consumerKey: config.MPESA_CONSUMER_KEY!,
    consumerSecret: config.MPESA_CONSUMER_SECRET!,
    shortcode: config.MPESA_SHORTCODE!,
    passkey: config.MPESA_PASSKEY!,
    type: config.MPESA_TYPE,
    till: config.MPESA_TILL,
  });
}
