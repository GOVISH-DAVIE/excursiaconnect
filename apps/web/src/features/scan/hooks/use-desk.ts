/**
 * The scanner at the Deal Room desk (M2.2): the event's badge list, kept current every 15 seconds against its
 * ETag; each scan sent with an id made here, and the server's verdict shown. When the API can't be reached, the
 * same rule decides here from the badge list (domain core/desk.ts), the scan joins a queue in this browser's
 * storage, and the queue goes when the connection returns: each scan once, whatever happens to the first try.
 * Where the server then decides otherwise (the badge was revoked meanwhile, say), it says so.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { BadgeList, ScanInput } from "@excursia/contracts/scan";
import { deskVerdict, type DeskEvent } from "@excursia/domain/core/desk";
import { ApiError } from "../../http";
import { scanApi } from "../api";

export type Shown = { id: string; code: string; verdict: "allow" | "deny"; outcome: string; reason: string; name: string | null; organisation: string | null; offline: boolean; at: number };
type Queued = ScanInput & { local: { verdict: "allow" | "deny"; reason: string; outcome: string } };

const SEND_WITHIN_MS = 4000;
const REFRESH_MS = 15_000;
const queueKey = (eventId: string) => `desk-queue:${eventId}`;
const listKey = (eventId: string) => `desk-list:${eventId}`;
type Kept = { data: BadgeList; etag: string | null; fetchedAt: number };

/**
 * The badge list is kept in this browser too, so a reload while offline still decides from it. It holds the
 * participants' names and badge codes, on an enrolled desk device only, and goes when someone signs out here.
 */
function readList(eventId: string): Kept | null {
  try {
    return JSON.parse(localStorage.getItem(listKey(eventId)) ?? "null") as Kept | null;
  } catch {
    return null;
  }
}
function keepList(eventId: string, l: Kept) {
  try {
    localStorage.setItem(listKey(eventId), JSON.stringify(l));
  } catch {
    // storage refused: the list lives as long as the page
  }
}
/** Signing out on this device: the list goes; scans not yet sent stay, to go with the next person's session. */
export function forgetList(eventId: string) {
  try {
    localStorage.removeItem(listKey(eventId));
  } catch {
    // nothing kept
  }
}

function readQueue(eventId: string): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(queueKey(eventId)) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}
function writeQueue(eventId: string, q: Queued[]) {
  try {
    if (q.length) localStorage.setItem(queueKey(eventId), JSON.stringify(q));
    else localStorage.removeItem(queueKey(eventId));
  } catch {
    // storage refused (a private window): the queue lives as long as the page
  }
}

/** The list's "now" moved on by the time since it came: the rules' clock, not this device's. */
function clockFrom(list: BadgeList, fetchedAt: number) {
  const t = Date.parse(`${list.now.replace(" ", "T")}:00Z`) + (Date.now() - fetchedAt);
  return new Date(t).toISOString().slice(0, 16).replace("T", " ");
}

/** A scan's effect on the local list: what the desk rule recorded, so the next local verdict knows it. */
function marked(list: BadgeList, code: string, outcome: string, hm: string): BadgeList {
  if (outcome !== "accredited" && outcome !== "arrived") return list;
  return { ...list, badges: list.badges.map((b) => (b.code.toLowerCase() === code.trim().toLowerCase() ? { ...b, accredited: true, arrivedAt: b.arrivedAt ?? hm } : b)) };
}

const offlineError = (e: unknown) => e === "timeout" || (e instanceof ApiError && (e.code === "network" || e.status >= 500));

export function useDesk(event: DeskEvent, onSignedOut: () => void) {
  const eventId = event.id;
  const [list, setList] = useState<Kept | null>(() => readList(eventId));
  const [online, setOnline] = useState(true);
  // what was queued before a reload is still here (the page renders only in the browser, once the device is known)
  const [queue, setQueue] = useState<Queued[]>(() => readQueue(eventId));
  const [last, setLast] = useState<Shown | null>(null);
  const [recent, setRecent] = useState<Shown[]>([]);
  const [differ, setDiffer] = useState<string[]>([]);
  const queueRef = useRef<Queued[]>(queue);
  const etagRef = useRef<string | null>(list?.etag ?? null);
  const syncing = useRef(false);

  const setQ = useCallback(
    (q: Queued[]) => {
      queueRef.current = q;
      setQueue(q);
      writeQueue(eventId, q);
    },
    [eventId],
  );

  const ended = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        onSignedOut();
        return true;
      }
      return false;
    },
    [onSignedOut],
  );

  const refreshList = useCallback(async () => {
    try {
      const r = await scanApi.badges(eventId, etagRef.current);
      setOnline(true);
      const fetchedAt = Date.now();
      if (r.notModified) return setList((l) => (l ? { ...l, fetchedAt, data: { ...l.data, now: clockFrom(l.data, l.fetchedAt) } } : l));
      // what is still queued here hasn't reached the server's list yet: it stays marked
      let data = r.data;
      for (const q of queueRef.current) data = marked(data, q.code, q.local.outcome, data.now.slice(11, 16));
      etagRef.current = r.etag;
      setList({ data, etag: r.etag, fetchedAt });
      keepList(eventId, { data: r.data, etag: r.etag, fetchedAt });
    } catch (e) {
      if (!ended(e) && offlineError(e)) setOnline(false);
    }
  }, [eventId, ended]);

  /** Sends what is queued, oldest first; each scan's id makes a second send harmless. */
  const sync = useCallback(async () => {
    const q = queueRef.current;
    if (!q.length || syncing.current) return;
    syncing.current = true;
    try {
      const r = await scanApi.scan(eventId, q.map(({ id, code, at, offline }) => ({ id, code, at, offline })));
      setOnline(true);
      const changed = r.results.filter((res) => {
        const mine = q.find((x) => x.id === res.id)!;
        return res.verdict !== mine.local.verdict;
      });
      if (changed.length) setDiffer((d) => [...changed.map((c) => `${c.name ?? q.find((x) => x.id === c.id)!.code}: ${c.reason}`), ...d].slice(0, 10));
      const sent = new Set(r.results.map((x) => x.id));
      setQ(queueRef.current.filter((x) => !sent.has(x.id)));
    } catch (e) {
      if (!ended(e) && offlineError(e)) setOnline(false);
    } finally {
      syncing.current = false;
    }
  }, [eventId, setQ, ended]);

  useEffect(() => {
    const first = setTimeout(() => void sync().then(refreshList), 0);
    const t = setInterval(() => {
      void sync();
      void refreshList();
    }, REFRESH_MS);
    const back = () => void sync().then(refreshList);
    window.addEventListener("online", back);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      window.removeEventListener("online", back);
    };
  }, [sync, refreshList]);

  const show = (s: Shown) => {
    setLast(s);
    setRecent((r) => [s, ...r].slice(0, 8));
  };

  /** One scan: to the server if it answers within a few seconds, else decided here and queued. */
  const scan = useCallback(
    async (input: string) => {
      const code = input.trim();
      if (!code) return;
      const id = crypto.randomUUID();
      const at = new Date().toISOString();
      const data = list?.data;
      const now = data ? clockFrom(data, list!.fetchedAt) : `${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
      const badge = data?.badges.find((b) => b.code.toLowerCase() === code.toLowerCase());
      const local = deskVerdict(badge ? { code: badge.code, eventId, revoked: badge.revoked, accredited: badge.accredited, arrivedAt: badge.arrivedAt } : undefined, event, now);
      try {
        const r = await Promise.race([scanApi.scan(eventId, [{ id, code, at, offline: false }]), new Promise<never>((_, no) => setTimeout(() => no("timeout"), SEND_WITHIN_MS))]);
        const res = r.results[0];
        setOnline(true);
        if (data) setList((l) => (l ? { ...l, data: marked(l.data, code, res.outcome, now.slice(11, 16)) } : l));
        show({ id, code, verdict: res.verdict, outcome: res.outcome, reason: res.reason, name: res.name, organisation: res.organisation, offline: false, at: Date.now() });
        void sync();
      } catch (e) {
        if (ended(e)) return;
        if (!offlineError(e)) {
          show({ id, code, verdict: "deny", outcome: "error", reason: e instanceof Error ? e.message : "The scan wasn't recorded", name: null, organisation: null, offline: false, at: Date.now() });
          return;
        }
        // decided here, from the list; it goes when the connection is back (and if this try did land, its id makes
        // the second send change nothing)
        setOnline(false);
        setQ([...queueRef.current, { id, code, at, offline: true, local: { verdict: local.verdict, reason: local.reason, outcome: local.outcome } }]);
        if (data) setList((l) => (l ? { ...l, data: marked(l.data, code, local.outcome, now.slice(11, 16)) } : l));
        show({ id, code, verdict: local.verdict, outcome: local.outcome, reason: local.reason, name: badge?.name ?? null, organisation: badge?.organisation ?? null, offline: true, at: Date.now() });
      }
    },
    [eventId, event, list, setQ, sync, ended],
  );

  const counts = list
    ? { badges: list.data.badges.filter((b) => !b.revoked).length, accredited: list.data.badges.filter((b) => !b.revoked && b.accredited).length, arrivedToday: list.data.badges.filter((b) => b.arrivedAt).length }
    : null;

  // from the list as this device has it: the server's, plus what was scanned here and not yet sent
  return { scan, last, recent, online, queued: queue.length, differ, summary: counts && list ? { day: list.data.day, ...counts } : null, listReady: !!list, sync };
}
