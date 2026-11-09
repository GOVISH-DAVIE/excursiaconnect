import "server-only";
import { randomUUID } from "node:crypto";
import type { VisitsDb } from "./db";
import { describeAgent } from "./ua";

/* The write path: what the browser may send, how it becomes rows, and the limits that keep the log clean. */

export const SESSION_COOKIE = "ec_sid";
export const SESSION_IDLE_MS = 30 * 60 * 1000; // a session ends after 30 minutes with no page, ping or click
export const RETENTION_DAYS = 90;
export const MAX_EVENTS_PER_HOUR = 600; // per session: a page a minute, a ping a minute and click batches fit well under
export const MAX_BODY = 8 * 1024;
const MAX_VISIBLE_SECONDS = 4 * 60 * 60;
const MAX_CLICKS = 20;

export type ClickKind = "link" | "button" | "tab" | "other";
export type VisitEvent =
  | { type: "view"; viewId: string; path: string; referrer: string }
  | { type: "ping"; viewId: string; path: string; visibleSeconds: number }
  | { type: "clicks"; viewId: string; path: string; items: { kind: ClickKind; label: string; href: string; ago: number }[] };

/** The pages that are never recorded: the watch itself and the API. */
export const unrecorded = (path: string) => /^\/(adminwatch|api)(\/|$)/.test(path);

const clean = (s: unknown, max: number) =>
  typeof s === "string"
    ? s
        .replace(/[\p{Cc}\p{Cf}]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

/** A path as the log keeps it: no query string or fragment, which can carry a name. */
function cleanPath(p: unknown): string | undefined {
  if (typeof p !== "string" || !p.startsWith("/") || p.length > 300) return undefined;
  return p.split(/[?#]/)[0] || "/";
}

/** An outside link keeps its origin only; an inside one its path. */
function cleanHref(h: unknown): string {
  if (typeof h !== "string" || !h) return "";
  if (h.startsWith("/")) return cleanPath(h) ?? "";
  try {
    return new URL(h).origin.slice(0, 120);
  } catch {
    return "";
  }
}

/** What the browser sent, checked; a string says why it was refused. */
export function parseEvent(raw: unknown): VisitEvent | string {
  if (!raw || typeof raw !== "object") return "Not an event";
  const r = raw as Record<string, unknown>;
  const viewId = typeof r.viewId === "string" && /^[A-Za-z0-9-]{8,64}$/.test(r.viewId) ? r.viewId : undefined;
  if (!viewId) return "No view id";
  const path = cleanPath(r.path);
  if (!path) return "Bad path";
  if (unrecorded(path)) return "Not recorded";
  if (r.type === "view") {
    let referrer = "";
    if (typeof r.referrer === "string" && r.referrer) {
      try {
        const u = new URL(r.referrer);
        referrer = `${u.origin}${u.pathname}`.slice(0, 300);
      } catch {
        referrer = "";
      }
    }
    return { type: "view", viewId, path, referrer };
  }
  if (r.type === "ping") {
    const s = Number(r.visibleSeconds);
    if (!Number.isFinite(s) || s < 0) return "Bad seconds";
    return { type: "ping", viewId, path, visibleSeconds: Math.min(Math.round(s), MAX_VISIBLE_SECONDS) };
  }
  if (r.type === "clicks") {
    if (!Array.isArray(r.items) || !r.items.length || r.items.length > MAX_CLICKS) return "Bad clicks";
    const items = r.items.map((i: Record<string, unknown>) => ({
      kind: (["link", "button", "tab", "other"].includes(i?.kind as string) ? i.kind : "other") as ClickKind,
      label: clean(i?.label, 80) || "(no label)",
      href: cleanHref(i?.href),
      ago: Math.min(Math.max(Number(i?.ago) || 0, 0), 120_000),
    }));
    return { type: "clicks", viewId, path, items };
  }
  return "Unknown type";
}

/** Requests per session in the current hour, kept in memory; a restart only forgets the count. */
export class RateLimiter {
  private hits = new Map<string, { from: number; n: number }>();
  constructor(private max = MAX_EVENTS_PER_HOUR) {}
  allow(key: string, now: number) {
    const h = this.hits.get(key);
    if (!h || now - h.from >= 3_600_000) {
      this.hits.set(key, { from: now, n: 1 });
      if (this.hits.size > 50_000) this.hits.clear();
      return true;
    }
    h.n += 1;
    return h.n <= this.max;
  }
}

const g = globalThis as typeof globalThis & { __visitsLimiter?: RateLimiter; __visitsPurgedAt?: number };
export const defaultLimiter = () => (g.__visitsLimiter ??= new RateLimiter());

export interface RecordContext {
  sessionId?: string; // from the ec_sid cookie
  ip: string;
  userAgent: string;
  now: Date;
  limiter?: RateLimiter;
}

/** Writes one event. Returns the session the browser should keep, and whether anything was written. */
export function recordEvent(db: VisitsDb, ev: VisitEvent, ctx: RecordContext): { sessionId: string; isNew: boolean; recorded: boolean } {
  const now = ctx.now.toISOString();
  const idleSince = new Date(ctx.now.getTime() - SESSION_IDLE_MS).toISOString();
  const known = ctx.sessionId ? (db.prepare("SELECT id FROM sessions WHERE id = ? AND last_seen_at >= ?").get(ctx.sessionId, idleSince) as { id: string } | undefined) : undefined;
  const sessionId = known?.id ?? randomUUID();
  const isNew = !known;
  if (!(ctx.limiter ?? defaultLimiter()).allow(sessionId, ctx.now.getTime())) return { sessionId, isNew, recorded: false };

  db.transaction(() => {
    if (isNew) {
      const a = describeAgent(ctx.userAgent);
      db.prepare(
        `INSERT INTO sessions (id, ip, user_agent, browser, os, device, is_bot, started_at, last_seen_at, entry_path, referrer)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(sessionId, ctx.ip, ctx.userAgent.slice(0, 400), a.browser, a.os, a.device, a.isBot ? 1 : 0, now, now, ev.path, ev.type === "view" ? ev.referrer : "");
    } else db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now, sessionId);

    if (ev.type === "view") {
      const added = db.prepare("INSERT OR IGNORE INTO page_views (id, session_id, path, at) VALUES (?, ?, ?, ?)").run(ev.viewId, sessionId, ev.path, now).changes;
      if (added) db.prepare("UPDATE sessions SET views = views + 1 WHERE id = ?").run(sessionId);
    } else if (ev.type === "ping") {
      // seconds only ever grow: a late beacon carrying an older count changes nothing
      db.prepare("UPDATE page_views SET visible_seconds = MAX(visible_seconds, ?) WHERE id = ? AND session_id = ?").run(ev.visibleSeconds, ev.viewId, sessionId);
    } else {
      const add = db.prepare("INSERT INTO clicks (session_id, view_id, path, at, kind, label, href) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const c of ev.items) add.run(sessionId, ev.viewId, ev.path, new Date(ctx.now.getTime() - c.ago).toISOString(), c.kind, c.label, c.href);
      db.prepare("UPDATE sessions SET clicks = clicks + ? WHERE id = ?").run(ev.items.length, sessionId);
    }
  })();
  return { sessionId, isNew, recorded: true };
}

/** Deletes sessions idle for more than 90 days, with their views and clicks, and old sign-in attempts. */
export function purgeOld(db: VisitsDb, now: Date): number {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString();
  const gone = db.prepare("DELETE FROM sessions WHERE last_seen_at < ?").run(cutoff).changes;
  db.prepare("DELETE FROM signins WHERE at < ?").run(cutoff);
  return gone;
}

/** The purge, at most once an hour per process. */
export function purgeHourly(db: VisitsDb, now: Date) {
  if (g.__visitsPurgedAt && now.getTime() - g.__visitsPurgedAt < 3_600_000) return;
  g.__visitsPurgedAt = now.getTime();
  purgeOld(db, now);
}
