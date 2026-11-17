/**
 * The live board on a phone (M3.4): it asks every 3 seconds with the version it has, and gets the board again only
 * when something changed, so every phone on the team is at most one poll behind. A change made here shows at once,
 * from the board the server answers with.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type { LiveBoard, OutcomeEntry } from "@excursia/contracts/live";
import { liveApi } from "../api";

export const POLL_MS = 3_000;
const key = (eventId: string, day: string | null) => ["live", eventId, day ?? "today"] as const;

export function useLiveBoard(eventId: string, day: string | null) {
  const queryClient = useQueryClient();
  const etag = useRef<string | null>(null);
  return useQuery({
    queryKey: key(eventId, day),
    queryFn: async (): Promise<LiveBoard> => {
      const had = queryClient.getQueryData<LiveBoard>(key(eventId, day));
      const r = await liveApi.board(eventId, day, had ? etag.current : null);
      if (r.notModified && had) return had;
      if (r.notModified) throw new Error("The board changed while loading; it reloads at the next poll.");
      etag.current = r.etag;
      return r.data;
    },
    refetchInterval: POLL_MS,
    // a phone in a pocket stops asking; it catches up the moment it is looked at again
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

export function useLiveActions(eventId: string, day: string | null) {
  const queryClient = useQueryClient();
  const put = (b: LiveBoard) => queryClient.setQueryData(key(eventId, day), b);
  return {
    start: useMutation({ mutationFn: (meetingId: string) => liveApi.start(eventId, meetingId, day), onSuccess: put }),
    outcome: useMutation({ mutationFn: ({ meetingId, input }: { meetingId: string; input: OutcomeEntry }) => liveApi.outcome(eventId, meetingId, day, input), onSuccess: put }),
    refill: useMutation({ mutationFn: ({ meetingId, matchId }: { meetingId: string; matchId: string }) => liveApi.refill(eventId, meetingId, day, matchId), onSuccess: put }),
  };
}
