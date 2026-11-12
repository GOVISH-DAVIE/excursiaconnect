/**
 * Virus scanning for uploads (backend-plan.md, M1.2). The worker hands each file that arrived to a Scanner:
 * - `clamdScanner` talks to ClamAV's daemon (clamd) over TCP or a Unix socket, with its INSTREAM command, so the
 *   bytes never touch the server's disk twice and no ClamAV library is needed (deploy.md, The server itself);
 * - `testScanner` is for machines without ClamAV: it catches only the standard EICAR test file, so the flow can be
 *   tried end to end. Production refuses to start with it (config.ts).
 */
import { connect, type Socket } from "node:net";

export type ScanResult = { infected: false } | { infected: true; signature: string };
export interface Scanner {
  /** what cleared a file, kept on its row ("clamav", "test") */
  name: string;
  scan(bytes: Buffer): Promise<ScanResult>;
}

/** The marker inside the EICAR test file, put together here so this source isn't itself flagged. */
const EICAR_MARK = ["EICAR", "STANDARD", "ANTIVIRUS", "TEST", "FILE"].join("-");

/** Catches only the EICAR test file; everything else passes. Never in production. */
export const testScanner: Scanner = {
  name: "test",
  scan: async (bytes) => (bytes.includes(EICAR_MARK) ? { infected: true, signature: "Eicar-Test-Signature (test scanner)" } : { infected: false }),
};

/** clamd's chunk size for INSTREAM; it refuses a stream over its StreamMaxLength (25 MB by default, as uploads). */
const CHUNK = 64 * 1024;

/**
 * Scans through clamd at `address`: "host:port", or the path of its Unix socket. Each scan opens one connection,
 * streams the bytes and reads the one-line answer: "stream: OK", or "stream: <signature> FOUND".
 */
export function clamdScanner(address: string, timeoutMs = 60_000): Scanner {
  const open = (): Socket => {
    if (address.startsWith("/")) return connect(address);
    const i = address.lastIndexOf(":");
    return connect(Number(address.slice(i + 1)), address.slice(0, i));
  };
  return {
    name: "clamav",
    scan: (bytes) =>
      new Promise<ScanResult>((resolve, reject) => {
        const socket = open();
        let answer = "";
        const fail = (why: string) => {
          socket.destroy();
          reject(new Error(`clamd at ${address}: ${why}`));
        };
        socket.setTimeout(timeoutMs, () => fail("no answer in time"));
        socket.on("error", (e) => fail(e.message));
        socket.on("data", (d) => (answer += d.toString("utf8")));
        socket.on("end", () => {
          const line = answer.replace(/\0/g, "").trim();
          if (/: OK$/.test(line)) return resolve({ infected: false });
          const found = /: (.+) FOUND$/.exec(line);
          if (found) return resolve({ infected: true, signature: found[1] });
          fail(line || "an empty answer");
        });
        socket.on("connect", () => {
          socket.write("zINSTREAM\0");
          for (let at = 0; at < bytes.length; at += CHUNK) {
            const part = bytes.subarray(at, at + CHUNK);
            const size = Buffer.alloc(4);
            size.writeUInt32BE(part.length);
            socket.write(size);
            socket.write(part);
          }
          socket.end(Buffer.alloc(4)); // a zero length ends the stream
        });
      }),
  };
}
