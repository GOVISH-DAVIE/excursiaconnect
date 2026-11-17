/**
 * The live board on a phone (M3.4, M3.5). It asks every 3 seconds with the version it has, and gets the board again
 * only when something changed, so every phone on the team is at most one poll behind. With no connection it keeps
 * showing the last board it had (kept in this browser, so a reload doesn't lose it), outcomes recorded meanwhile
 * wait on the phone with their own ids, and the first poll that reaches the server again sends them in one sync.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { LiveBoard, OutcomeEntry } from "@excursia/contracts/live";
import { liveApi } from "../api";
import { isOffline, keepBoard, offlineStore, readBoard, rulesNow, type OfflineState } from "../offline";

export const POLL_MS = 3_000;
/** A blip shorter than this, with nothing recorded meanwhile, isn't reported to the lead as an incident. */
const INCIDENT_AFTER_MS = 60_000;
const key = (eventId: string, day: string | null) => ["live", eventId, day ?? "today"] as const;

export function useLiveBoard(eventId: string, day: string | null, device: string) {
  const queryClient = useQueryClient();
  const etag = useRef<string | null>(null);
  const [kept] = useState(() => readBoard(eventId, day));
  return useQuery({
    queryKey: key(eventId, day),
    queryFn: async (): Promise<LiveBoard> => {
      const had = queryClient.getQueryData<LiveBoard>(key(eventId, day));
      const fetchedAt = queryClient.getQueryState(key(eventId, day))?.dataUpdatedAt ?? Date.now();
      let r: Awaited<ReturnType<typeof liveApi.board>>;
      try {
        r = await liveApi.board(eventId, day, had ? etag.current : null);
      } catch (e) {
        // the connection went: noted once, at the rules' time, for the incident the sync will report
        const o = offlineStore.get(eventId);
        if (isOffline(e) && !o.since && had) offlineStore.set(eventId, { since: rulesNow(had, fetchedAt), lostAt: Date.now() });
        throw e;
      }
      if (r.notModified && !had) throw new Error("The board changed while loading; it reloads at the next poll.");
      const board = r.notModified ? had! : r.data;
      if (!r.notModified) etag.current = r.etag;
      // back: the queue goes now, in one sync; a short blip with nothing recorded is just forgotten
      const o = offlineStore.get(eventId);
      // an outage is reported when records were taken during it, or when it lasted a minute or more
      const report = !!o.since && (o.queue.length > 0 || o.lostAt === null || Date.now() - o.lostAt >= INCIDENT_AFTER_MS);
      if (o.queue.length || report) {
        let s: Awaited<ReturnType<typeof liveApi.sync>>;
        try {
          s = await liveApi.sync(eventId, day, { device, offlineSince: report ? o.since : null, records: o.queue });
        } catch (e) {
          if (isOffline(e)) throw e;
          // refused as a whole (not a lost connection): the records stay here, the board keeps going, and the page says why
          offlineStore.set(eventId, { failed: (e as Error).message });
          if (!r.notModified) keepBoard(eventId, day, board);
          return board;
        }
        const done = new Set(s.results.map((x) => x.clientId));
        offlineStore.set(eventId, { since: null, lostAt: null, failed: null, queue: offlineStore.get(eventId).queue.filter((x) => !done.has(x.clientId)), synced: s.results.length ? { at: Date.now(), results: s.results } : o.synced });
        etag.current = null;
        keepBoard(eventId, day, s.board);
        return s.board;
      }
      if (o.since) offlineStore.set(eventId, { since: null, lostAt: null });
      if (!r.notModified) keepBoard(eventId, day, board);
      return board;
    },
    // the last board this phone had shows at once, and while the connection is down
    initialData: kept?.board,
    initialDataUpdatedAt: kept?.at,
    refetchInterval: POLL_MS,
    // a phone in a pocket stops asking; it catches up the moment it is looked at again
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    // the next poll is the retry: an outage shows within one poll
    retry: false,
  });
}

const EMPTY: OfflineState = { since: null, lostAt: null, queue: [], synced: null, failed: null };

/** What waits on this phone, when the connection went, and what the last sync did. */
export function useLiveOffline(eventId: string, board: LiveBoard | undefined, fetchedAt: number) {
  const state = useSyncExternalStore(
    offlineStore.subscribe,
    () => offlineStore.get(eventId),
    () => EMPTY,
  );
  /** An outcome recorded with no connection: kept on this phone, with the rules' time, until the sync. */
  const record = useCallback(
    (meetingId: string, input: OutcomeEntry) => {
      const at = board ? rulesNow(board, fetchedAt) : new Date().toISOString().slice(0, 16).replace("T", " ");
      const queue = offlineStore.get(eventId).queue.filter((r) => r.clientId !== input.clientId);
      offlineStore.set(eventId, { queue: [...queue, { meetingId, clientId: input.clientId, attendance: input.attendance, noShow: input.noShow, outcome: input.outcome, at }] });
    },
    [board, fetchedAt, eventId],
  );
  return { ...state, record, dismiss: () => offlineStore.set(eventId, { synced: null }) };
}

export function useLiveActions(eventId: string, day: string | null, queueRecord: (meetingId: string, input: OutcomeEntry) => void) {
  const queryClient = useQueryClient();
  const put = (b: LiveBoard | null) => {
    if (!b) return;
    queryClient.setQueryData(key(eventId, day), b);
    keepBoard(eventId, day, b);
  };
  return {
    start: useMutation({ mutationFn: (meetingId: string) => liveApi.start(eventId, meetingId, day), onSuccess: put }),
    /** An outcome goes at once; with no connection it waits on this phone and goes with the sync. */
    outcome: useMutation({
      mutationFn: async ({ meetingId, input }: { meetingId: string; input: OutcomeEntry }): Promise<LiveBoard | null> => {
        try {
          return await liveApi.outcome(eventId, meetingId, day, input);
        } catch (e) {
          if (!isOffline(e) || input.paper) throw e;
          queueRecord(meetingId, input);
          return null;
        }
      },
      onSuccess: put,
    }),
    refill: useMutation({ mutationFn: ({ meetingId, matchId }: { meetingId: string; matchId: string }) => liveApi.refill(eventId, meetingId, day, matchId), onSuccess: put }),
    resolve: useMutation({ mutationFn: ({ conflictId, chose }: { conflictId: string; chose: "kept" | "incoming" }) => liveApi.resolve(eventId, conflictId, day, chose), onSuccess: put }),
  };
}
