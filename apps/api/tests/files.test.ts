/**
 * The worker's file jobs (M1.2): an upload is scanned once it has arrived, looked at again while it is on its way,
 * forgotten when it never came; a scanner that is down only delays the scan; files past their retention date lose
 * their bytes but keep their row. And the ClamAV client speaks clamd's INSTREAM protocol.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type AddressInfo, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createDb } from "@excursia/db";
import { createFilesRepo } from "../src/modules/files/files.repo";
import { createFilesService } from "../src/modules/files/files.service";
import { clamdScanner, testScanner, type Scanner } from "../src/scan/scanner";
import { createLocalStorage, type LocalStorage } from "../src/storage/local";

const run = Date.now().toString(36);
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(300, 0x20)]);
const MARK = ["EICAR", "STANDARD", "ANTIVIRUS", "TEST", "FILE"].join("-");

describe("clamd's INSTREAM protocol", () => {
  let server: Server;
  let address = "";
  let received = Buffer.alloc(0);

  beforeAll(async () => {
    // a stand-in clamd: reads the chunks up to the zero length, then answers like the real one
    server = createServer((socket) => {
      let buf = Buffer.alloc(0);
      socket.on("data", (d) => {
        buf = Buffer.concat([buf, d]);
        if (!buf.subarray(0, 10).equals(Buffer.from("zINSTREAM\0"))) return;
        let at = 10;
        const parts: Buffer[] = [];
        while (at + 4 <= buf.length) {
          const n = buf.readUInt32BE(at);
          if (n === 0) {
            received = Buffer.concat(parts);
            socket.end(received.includes(MARK) ? "stream: Eicar-Signature FOUND\0" : "stream: OK\0");
            return;
          }
          if (at + 4 + n > buf.length) return;
          parts.push(buf.subarray(at + 4, at + 4 + n));
          at += 4 + n;
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    address = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  test("a clean file passes, sent whole in chunks", async () => {
    const big = Buffer.alloc(200_000, 7);
    expect(await clamdScanner(address).scan(big)).toEqual({ infected: false });
    expect(received.equals(big)).toBe(true);
  });

  test("an infected file names its signature", async () => {
    expect(await clamdScanner(address).scan(Buffer.from(`x ${MARK} y`))).toEqual({ infected: true, signature: "Eicar-Signature" });
  });

  test("a clamd that isn't there is an error, not a pass", async () => {
    await expect(clamdScanner("127.0.0.1:1", 2000).scan(PDF)).rejects.toThrow(/clamd at 127\.0\.0\.1:1/);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("the worker's file jobs", () => {
  const db = createDb(process.env.TEST_DATABASE_URL, 3);
  let dir = "";
  let storage: LocalStorage;
  const ids: string[] = [];

  async function file(name: string, opts: { bytes?: Buffer; size?: number; createdAt?: Date; retentionUntil?: Date } = {}) {
    const id = `file_${run}${name}`;
    const storageKey = `test/${run}/${name}`;
    await db.file.create({
      data: { id, ownerKind: "dr_application", ownerId: `dr_t_${run}`, kind: "Pitch deck", storageKey, name: `${name}.pdf`, contentType: "application/pdf", size: opts.size ?? opts.bytes?.length ?? PDF.length, createdAt: opts.createdAt, retentionUntil: opts.retentionUntil },
    });
    if (opts.bytes) {
      const target = storage.uploadTarget(storageKey, { contentType: "application/pdf", size: opts.bytes.length });
      await storage.receive(target.url.split("/").pop()!, "application/pdf", opts.bytes);
    }
    ids.push(id);
    return id;
  }
  const row = (id: string) => db.file.findUniqueOrThrow({ where: { id } });
  /** Runs the scan until this file is no longer due (other tests' files may be ahead of it). */
  async function scanned(scanner: Scanner, id: string) {
    const jobs = createFilesService({ repo: createFilesRepo(db), storage, scanner, log: { error: () => {} } });
    for (let i = 0; i < 20; i++) {
      const f = await db.file.findUnique({ where: { id } });
      if (!f || f.state !== "quarantine" || (f.nextScanAt && f.nextScanAt > new Date())) return;
      await jobs.scan();
    }
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "excursia-files-"));
    storage = createLocalStorage({ dir, key: Buffer.alloc(32, 9) });
  });
  afterAll(async () => {
    await db.auditEntry.deleteMany({ where: { entity: "file", entityId: { in: ids } } }).catch(() => {}); // the app role can't; the test role may
    await db.outboxMessage.deleteMany({ where: { recipient: `dr_t_${run}` } });
    await db.file.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  test("a clean upload is cleared, with an audit row", async () => {
    const id = await file("clean", { bytes: PDF });
    await scanned(testScanner, id);
    expect(await row(id)).toMatchObject({ state: "clean", scanNote: "test", deletedAt: null });
    expect(await db.auditEntry.count({ where: { entity: "file", entityId: id, action: "file/scan" } })).toBe(1);
  });

  test("an upload still on its way is looked at again shortly; one that never came is forgotten", async () => {
    const coming = await file("coming");
    await scanned(testScanner, coming);
    const r = await row(coming);
    expect(r.state).toBe("quarantine");
    expect(r.nextScanAt!.getTime()).toBeGreaterThan(Date.now());
    const lost = await file("lost", { createdAt: new Date(Date.now() - 2 * 3_600_000) });
    await scanned(testScanner, lost);
    expect(await db.file.findUnique({ where: { id: lost } })).toBeNull();
  });

  test("a scanner that is down only delays the scan", async () => {
    const id = await file("waits", { bytes: PDF });
    const down: Scanner = { name: "down", scan: async () => Promise.reject(new Error("clamd is down")) };
    await scanned(down, id);
    const r = await row(id);
    expect(r.state).toBe("quarantine");
    expect(r.nextScanAt!.getTime()).toBeGreaterThan(Date.now() + 30_000);
    expect(await storage.read(r.storageKey)).not.toBeNull();
  });

  test("files past their retention date lose their bytes and keep their row", async () => {
    const due = await file("due", { bytes: PDF, retentionUntil: new Date(Date.now() - 60_000) });
    const kept = await file("kept", { bytes: PDF, retentionUntil: new Date(Date.now() + 86_400_000) });
    const jobs = createFilesService({ repo: createFilesRepo(db), storage, scanner: testScanner });
    while (await jobs.purge()) {
      /* other tests' due files may come first */
    }
    const d = await row(due);
    expect(d.deletedAt).not.toBeNull();
    expect(await storage.read(d.storageKey)).toBeNull();
    expect(await db.auditEntry.count({ where: { entity: "file", entityId: due, action: "file/delete" } })).toBe(1);
    const k = await row(kept);
    expect(k.deletedAt).toBeNull();
    expect(await storage.read(k.storageKey)).not.toBeNull();
  });
});
