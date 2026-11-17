/**
 * What a phone keeps for the live board while the venue's connection is down (M3.5), in this browser's storage
 * so a reload doesn't lose it: the last board it had, the outcomes recorded since (each with its own id), when it
 * lost the connection, and a name for the device, which the lead sees on an incident or a conflict. The board holds
 * participants' names and the outcomes, on a staff member's own phone; it goes when they sign out here.
 */
import type { LiveBoard, OfflineRecord } from "@excursia/contracts/live";
import { ApiError } from "../http";

const queueKey = (eventId: string) => `live-queue:${eventId}`;
const boardKey = (eventId: string, day: string | null) => `live-board:${eventId}:${day ?? "today"}`;
const sinceKey = (eventId: string) => `live-offline-since:${eventId}`;
const DEVICE = "live-device";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null || (Array.isArray(value) && !value.length)) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage refused (a private window): it lives as long as the page
  }
}

/** A network failure or the server down, as opposed to a refusal: only these queue. */
export const isOffline = (e: unknown) => e instanceof ApiError && (e.code === "network" || e.status >= 500);

export const readQueue = (eventId: string) => read<OfflineRecord[]>(queueKey(eventId), []);
export const writeQueue = (eventId: string, q: OfflineRecord[]) => write(queueKey(eventId), q);

export const readBoard = (eventId: string, day: string | null) => read<{ board: LiveBoard; at: number } | null>(boardKey(eventId, day), null);
export const keepBoard = (eventId: string, day: string | null, board: LiveBoard) => write(boardKey(eventId, day), { board, at: Date.now() });

export const readSince = (eventId: string) => read<string | null>(sinceKey(eventId), null);
export const writeSince = (eventId: string, since: string | null) => write(sinceKey(eventId), since);

/** This phone's name for the lead: chosen once, kept. */
export function deviceName(person: string): string {
  const kept = read<string | null>(DEVICE, null);
  if (kept) return kept;
  const name = `${person.split(" ")[0] || "A"}'s phone ${Math.random().toString(36).slice(2, 6)}`;
  write(DEVICE, name);
  return name;
}

/** The rules' clock now, from the last board this phone had: its "now" moved on by the time since. */
export function rulesNow(board: LiveBoard, fetchedAt: number): string {
  const t = Date.parse(`${board.event.now.replace(" ", "T")}:00Z`) + (Date.now() - fetchedAt);
  return new Date(t).toISOString().slice(0, 16).replace("T", " ");
}

/**
 * The boards kept on this phone, gone when its user signs out here. Outcomes not yet sent stay: they are the
 * team's records, and go with the next sync from this phone.
 */
export function forgetLiveBoards() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("live-board:")) localStorage.removeItem(k);
  } catch {
    // nothing kept
  }
}

/**
 * The offline state of the live board on this phone, one per event, as a small store the screens subscribe to:
 * when the connection went, what waits to be sent, and what the last sync did. The poll itself writes it (no
 * effects): a failed poll notes the moment the connection went, the first poll that reaches the server sends the
 * queue.
 */
export type SyncedResults = { at: number; results: { clientId: string; meetingId: string; result: "recorded" | "duplicate" | "conflict" | "refused"; reason: string | null }[] };
export type OfflineState = { since: string | null; lostAt: number | null; queue: OfflineRecord[]; synced: SyncedResults | null; failed: string | null };

const states = new Map<string, OfflineState>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const offlineStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get(eventId: string): OfflineState {
    let s = states.get(eventId);
    if (!s) {
      s = { since: readSince(eventId), lostAt: null, queue: readQueue(eventId), synced: null, failed: null };
      states.set(eventId, s);
    }
    return s;
  },
  set(eventId: string, patch: Partial<OfflineState>) {
    const next = { ...offlineStore.get(eventId), ...patch };
    states.set(eventId, next);
    if ("since" in patch) writeSince(eventId, next.since);
    if ("queue" in patch) writeQueue(eventId, next.queue);
    emit();
  },
};
