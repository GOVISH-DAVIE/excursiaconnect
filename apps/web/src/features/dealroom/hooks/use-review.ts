/**
 * One application's review: the view, and the reviewer's actions. Each action answers with the new view, which
 * replaces the cached one; the queue is asked again too, since status and reviewer show there.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RequestInfoInput, ReviewView, RfiExpiryInput, ScoreInput } from "@excursia/contracts/review";
import { dealRoomApi } from "../api";
import { dealRoomKeys, reviewQuery } from "../queries";

export const useReview = (eventId: string, appId: string) => useQuery(reviewQuery(eventId, appId));

export type ReviewAction =
  | { kind: "start" }
  | { kind: "score"; input: ScoreInput }
  | { kind: "request"; input: RequestInfoInput }
  | { kind: "expiry"; input: RfiExpiryInput };

export function useReviewAction(eventId: string, appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (a: ReviewAction): Promise<ReviewView> =>
      a.kind === "start"
        ? dealRoomApi.startReview(eventId, appId)
        : a.kind === "score"
          ? dealRoomApi.score(eventId, appId, a.input)
          : a.kind === "request"
            ? dealRoomApi.requestInfo(eventId, appId, a.input)
            : dealRoomApi.rfiExpiry(eventId, appId, a.input),
    onSuccess: (view) => {
      queryClient.setQueryData(dealRoomKeys.review(eventId, appId), view);
      void queryClient.invalidateQueries({ queryKey: dealRoomKeys.applications(eventId) });
    },
  });
}

/** Downloads a document through its short-lived link (it comes as an attachment, so the page stays put). */
export function useOpenDocument(eventId: string, appId: string) {
  return useMutation({
    mutationFn: (docId: string) => dealRoomApi.documentLink(eventId, appId, docId),
    onSuccess: (link) => {
      const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
      window.location.assign(link.url.startsWith("http") ? link.url : `${base}${link.url}`);
    },
  });
}
