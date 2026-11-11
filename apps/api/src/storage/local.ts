/**
 * The local-folder storage: files under STORAGE_DIR, uploaded through the API's own PUT /v1/uploads/:token. The
 * token is the only permission: HMAC-signed, it names one key, one size and one type, and expires in 15 minutes,
 * so it can't be reused for anything else or replayed later. Fine for one server with backed-up disk (deploy.md);
 * a bucket replaces it when D6 is decided.
 */
import { createHmac } from "node:crypto";
import { mkdir, open, rename, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { sameDigest } from "../security/secrets";
import { looksLike, type Storage } from "./storage";

const TTL_MS = 15 * 60_000;
const SAFE_KEY = /^[a-z0-9][a-z0-9_/-]{2,200}$/;

type Grant = { k: string; s: number; t: string; e: number };

export class UploadRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadRefused";
  }
}

export function createLocalStorage(opts: { dir: string; key: Buffer; now?: () => number }): Storage & {
  /** Checks the token and writes the body; throws UploadRefused with the reason. */
  receive(token: string, contentType: string | undefined, body: Buffer): Promise<void>;
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
