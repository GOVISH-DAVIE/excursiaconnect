/**
 * The only code in the web app that calls fetch (docs/architecture.md, "The layers"). It knows where the API is,
 * sends the session cookie, checks every answer against its contract, and turns an ErrorBody into an ApiError
 * whose message is the API's own sentence, ready to show.
 */
import type { z } from "zod";
import { ErrorBody, type ErrorCode } from "@excursia/contracts/http";

/** In the browser: the API's public address, written into the bundle at build time. */
const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | "network",
    message: string,
    readonly status: number,
    readonly fields?: string[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Options<T> = { body?: unknown; query?: Record<string, string | undefined>; schema?: z.ZodType<T> };

async function request<T>(method: string, path: string, { body, query, schema }: Options<T> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(query ?? {}).filter((e): e is [string, string] => !!e[1])).toString();
  let res: Response;
  try {
    res = await fetch(`${PUBLIC_API}${path}${qs ? `?${qs}` : ""}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("network", "Can't reach ExcursiaConnect. Check your connection and try again.", 0);
  }
  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const parsed = ErrorBody.safeParse(json);
    if (parsed.success) throw new ApiError(parsed.data.error.code, parsed.data.error.message, res.status, parsed.data.error.fields);
    throw new ApiError("internal", "Something went wrong on our side. Try again in a moment.", res.status);
  }
  return schema ? schema.parse(json) : (undefined as T);
}

export const http = {
  get: <T>(path: string, opts?: Options<T>) => request<T>("GET", path, opts),
  post: <T>(path: string, opts?: Options<T>) => request<T>("POST", path, opts),
  patch: <T>(path: string, opts?: Options<T>) => request<T>("PATCH", path, opts),
  put: <T>(path: string, opts?: Options<T>) => request<T>("PUT", path, opts),
  del: <T>(path: string, opts?: Options<T>) => request<T>("DELETE", path, opts),
  /** A file's bytes to an upload target: a path on the API (local storage) or a bucket's signed URL. */
  async upload(url: string, headers: Record<string, string>, file: Blob): Promise<void> {
    const target = url.startsWith("http") ? url : `${PUBLIC_API}${url}`;
    let res: Response;
    try {
      res = await fetch(target, { method: "PUT", headers, body: file, credentials: url.startsWith("http") ? "omit" : "include" });
    } catch {
      throw new ApiError("network", "The upload didn't get through. Check your connection and try again.", 0);
    }
    if (!res.ok) {
      const parsed = ErrorBody.safeParse(await res.json().catch(() => undefined));
      throw new ApiError(parsed.success ? parsed.data.error.code : "internal", parsed.success ? parsed.data.error.message : "The upload failed. Try again.", res.status);
    }
  },
};
