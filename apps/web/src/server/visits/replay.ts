import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import type { VisitsDb } from "./db";
import { SESSION_IDLE_MS } from "./record";

/*
  The screen replay: rrweb events from each browser tab, kept as gzipped chunks under the session. The browser
  masks every input field before anything leaves it; the server checks each chunk is a list of events before
  keeping it, and caps what one session may store.
*/

export const MAX_CHUNK_BYTES = 1024 * 1024; // one upload, as sent
const MAX_UNZIPPED = 16 * 1024 * 1024; // what one upload may expand to
export const MAX_SESSION_BYTES = 25 * 1024 * 1024; // what one session may keep in all

export interface Chunk {
  tab: string;
  seq: number;
  gzipped: boolean;
  body: Buffer;
}

type RrEvent = { type: number; timestamp: number; data?: unknown };

/** Checks an upload and returns its events gzipped for keeping; a string says why it was refused. */
export function readChunk(c: Chunk): { data: Buffer; events: number; firstTs: number; lastTs: number } | string {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(c.tab)) return "Bad tab";
  if (!Number.isInteger(c.seq) || c.seq < 0 || c.seq > 1_000_000) return "Bad sequence";
  if (!c.body.length || c.body.length > MAX_CHUNK_BYTES) return "Bad size";
  let text: string;
  try {
    // a bound on what it may expand to, so a small upload cannot fill the memory
    text = (c.gzipped ? gunzipSync(c.body, { maxOutputLength: MAX_UNZIPPED }) : c.body).toString("utf8");
  } catch {
    return "Not gzip";
  }
  let events: RrEvent[];
  try {
    events = JSON.parse(text);
  } catch {
    return "Not JSON";
  }
  if (!Array.isArray(events) || !events.length || events.length > 50_000) return "Not a list of events";
  if (!events.every((e) => e && typeof e === "object" && Number.isInteger(e.type) && Number.isFinite(e.timestamp))) return "Not rrweb events";
  let firstTs = Infinity;
  let lastTs = -Infinity;
  for (const e of events) {
    firstTs = Math.min(firstTs, e.timestamp);
    lastTs = Math.max(lastTs, e.timestamp);
  }
  return { data: c.gzipped ? c.body : gzipSync(c.body), events: events.length, firstTs, lastTs };
}

/** Keeps a chunk under a live session. A chunk sent twice is kept once; a session past its cap keeps no more. */
export function storeChunk(db: VisitsDb, sessionId: string | undefined, c: Chunk, now: Date): "stored" | "no session" | "full" | "duplicate" | string {
  if (!sessionId) return "no session";
  const live = db.prepare("SELECT id FROM sessions WHERE id = ? AND last_seen_at >= ?").get(sessionId, new Date(now.getTime() - SESSION_IDLE_MS).toISOString());
  if (!live) return "no session";
  const read = readChunk(c);
  if (typeof read === "string") return read;
  const { used } = db.prepare("SELECT COALESCE(SUM(bytes), 0) AS used FROM recordings WHERE session_id = ?").get(sessionId) as { used: number };
  if (used + read.data.length > MAX_SESSION_BYTES) return "full";
  const added = db
    .prepare("INSERT OR IGNORE INTO recordings (session_id, tab, seq, first_ts, last_ts, events, bytes, data, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(sessionId, c.tab, c.seq, read.firstTs, read.lastTs, read.events, read.data.length, read.data, now.toISOString()).changes;
  if (!added) return "duplicate";
  // moving the mouse and scrolling count as being here
  db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now.toISOString(), sessionId);
  return "stored";
}

/** The tabs a session was recorded in, longest first, with how much each holds. */
export function recordedTabs(db: VisitsDb, sessionId: string) {
  return db
    .prepare("SELECT tab, COUNT(*) AS chunks, SUM(events) AS events, SUM(bytes) AS bytes, MIN(first_ts) AS first_ts, MAX(last_ts) AS last_ts FROM recordings WHERE session_id = ? GROUP BY tab ORDER BY (MAX(last_ts) - MIN(first_ts)) DESC")
    .all(sessionId) as { tab: string; chunks: number; events: number; bytes: number; first_ts: number; last_ts: number }[];
}

/** One tab's events in order, as a JSON array ready for the player. */
export function tabEvents(db: VisitsDb, sessionId: string, tab: string): string {
  const rows = db.prepare("SELECT data FROM recordings WHERE session_id = ? AND tab = ? ORDER BY seq").all(sessionId, tab) as { data: Buffer }[];
  // each chunk is a JSON array; their insides are joined into one array without parsing them again
  const parts = rows.map((r) => gunzipSync(r.data).toString("utf8").trim().slice(1, -1)).filter(Boolean);
  return `[${parts.join(",")}]`;
}
