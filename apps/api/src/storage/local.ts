/**
 * The local-folder storage: files under STORAGE_DIR, uploaded through the API's own PUT /v1/uploads/:token. The
 * token is the only permission: HMAC-signed, it names one key, one size and one type, and expires in 15 minutes,
 * so it can't be reused for anything else or replayed later. Fine for one server with backed-up disk (deploy.md);
 * a bucket replaces it when D6 is decided.
 */
import { createHmac } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sameDigest } from "../security/secrets";
import { looksLike, type Storage } from "./storage";

const TTL_MS = 15 * 60_000;
const DOWNLOAD_TTL_MS = 2 * 60_000;
const SAFE_KEY = /^[a-z0-9][a-z0-9_/-]{2,200}$/;

type Grant = { k: string; s: number; t: string; e: number };
/** A download grant: the key, the name and type to serve it under, the expiry, and "d" so it can't pass as an upload. */
type DownloadGrant = { d: 1; k: string; n: string; t: string; e: number };

/** Where uploads are kept: STORAGE_DIR, else data/uploads in the repository. The API and the worker share it. */
export const uploadsDir = (config: { STORAGE_DIR?: string }) => config.STORAGE_DIR ?? fileURLToPath(new URL("../../../../data/uploads", import.meta.url));

export class UploadRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadRefused";
  }
}

export function createLocalStorage(opts: { dir: string; key: Buffer; now?: () => number }): Storage & {
  /** Checks the token and writes the body; throws UploadRefused with the reason. */
  receive(token: string, contentType: string | undefined, body: Buffer): Promise<void>;
  /** Checks a download token: the file's path, and the name and type to serve it under. */
  opening(token: string): Promise<{ path: string; name: string; contentType: string }>;
} {
  const root = resolve(opts.dir);
  const now = opts.now ?? Date.now;
  const sign = (payload: string) => createHmac("sha256", opts.key).update(payload).digest("hex");
  const pathOf = (key: string) => {
    if (!SAFE_KEY.test(key) || key.includes("..")) throw new UploadRefused("Not a storage key");
    return join(root, key);
  };

  return {
    uploadTarget(key, file) {
      pathOf(key);
      const payload = Buffer.from(JSON.stringify({ k: key, s: file.size, t: file.contentType, e: now() + TTL_MS } satisfies Grant)).toString("base64url");
      return { url: `/v1/uploads/${payload}.${sign(payload)}`, method: "PUT", headers: { "Content-Type": file.contentType } };
    },

    downloadUrl(key, file) {
      pathOf(key);
      const e = now() + DOWNLOAD_TTL_MS;
      const payload = Buffer.from(JSON.stringify({ d: 1, k: key, n: file.name, t: file.contentType, e } satisfies DownloadGrant)).toString("base64url");
      return { url: `/v1/files/${payload}.${sign(payload)}`, expiresAt: new Date(e) };
    },

    async opening(token) {
      const [payload, mac] = token.split(".");
      if (!payload || !mac || !sameDigest(mac, sign(payload))) throw new UploadRefused("This link isn't valid");
      let g: DownloadGrant;
      try {
        g = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DownloadGrant;
      } catch {
        throw new UploadRefused("This link isn't valid");
      }
      if (g.d !== 1) throw new UploadRefused("This link isn't valid");
      if (now() > g.e) throw new UploadRefused("This link has expired. Open the document again from the application.");
      const path = pathOf(g.k);
      if (!(await stat(path).then(() => true, () => false))) throw new UploadRefused("This file is no longer here");
      return { path, name: g.n, contentType: g.t };
    },

    read: (key) => readFile(pathOf(key)).catch(() => null),

    remove: (key) => rm(pathOf(key), { force: true }),

    async stat(key) {
      try {
        const s = await stat(pathOf(key));
        return { size: s.size };
      } catch {
        return null;
      }
    },

    async receive(token, contentType, body) {
      const [payload, mac] = token.split(".");
      if (!payload || !mac || !sameDigest(mac, sign(payload))) throw new UploadRefused("This upload link isn't valid");
      let g: Grant;
      try {
        g = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Grant;
      } catch {
        throw new UploadRefused("This upload link isn't valid");
      }
      if (now() > g.e) throw new UploadRefused("This upload link has expired. Choose the file again.");
      if (contentType !== g.t) throw new UploadRefused("The file's type doesn't match what was asked for");
      if (body.length !== g.s) throw new UploadRefused("The file's size doesn't match what was asked for");
      if (!looksLike(g.t, body.subarray(0, 8))) throw new UploadRefused("The file's contents don't match its type");
      const path = pathOf(g.k);
      const already = await stat(path).then(() => true, () => false);
      if (already) throw new UploadRefused("This file was already uploaded");
      await mkdir(dirname(path), { recursive: true });
      // write beside it, then rename, so a half-written file is never seen; "wx" lets only one request write it
      const tmp = `${path}.part`;
      const fh = await open(tmp, "wx").catch(() => {
        throw new UploadRefused("This file is already being uploaded");
      });
      try {
        await fh.writeFile(body);
      } finally {
        await fh.close();
      }
      await rename(tmp, path);
    },
  };
}
export type LocalStorage = ReturnType<typeof createLocalStorage>;
