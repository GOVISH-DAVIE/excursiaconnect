/**
 * One application's review: the view, and the reviewer's actions. Each action answers with the new view, which
 * replaces the cached one; the queue is asked again too, since status and reviewer show there.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CheckKycInput, DecideInput, ReadinessInput, RecommendInput, RequestInfoInput, ReviewView, RfiExpiryInput, SanctionsInput, ScoreInput, VerifyInput, WaiveFeeInput } from "@excursia/contracts/review";
import { dealRoomApi } from "../api";
import { dealRoomKeys, reviewQuery } from "../queries";

export const useReview = (eventId: string, appId: string) => useQuery(reviewQuery(eventId, appId));

export type ReviewAction =
  | { kind: "start" }
  | { kind: "score"; input: ScoreInput }
  | { kind: "request"; input: RequestInfoInput }
  | { kind: "expiry"; input: RfiExpiryInput }
  | { kind: "recommend"; input: RecommendInput }
  | { kind: "decide"; input: DecideInput }
  | { kind: "confirmSecond" }
  | { kind: "meetCondition"; conditionId: string }
  | { kind: "confirmDecisionMaker" }
  | { kind: "readiness"; input: ReadinessInput }
  | { kind: "checkKyc"; input: CheckKycInput }
  | { kind: "sanctions"; input: SanctionsInput }
  | { kind: "verify"; input: VerifyInput }
  | { kind: "waiveFee"; input: WaiveFeeInput };

/** One call per action; each answers with the review's new view. */
function send(eventId: string, appId: string, a: ReviewAction): Promise<ReviewView> {
  switch (a.kind) {
    case "start":
      return dealRoomApi.startReview(eventId, appId);
    case "score":
      return dealRoomApi.score(eventId, appId, a.input);
    case "request":
      return dealRoomApi.requestInfo(eventId, appId, a.input);
    case "expiry":
      return dealRoomApi.rfiExpiry(eventId, appId, a.input);
    case "recommend":
      return dealRoomApi.recommend(eventId, appId, a.input);
    case "decide":
      return dealRoomApi.decide(eventId, appId, a.input);
    case "confirmSecond":
      return dealRoomApi.confirmSecond(eventId, appId);
    case "meetCondition":
      return dealRoomApi.meetCondition(eventId, appId, a.conditionId);
    case "confirmDecisionMaker":
      return dealRoomApi.confirmDecisionMaker(eventId, appId);
    case "readiness":
      return dealRoomApi.readiness(eventId, appId, a.input);
    case "checkKyc":
      return dealRoomApi.checkKyc(eventId, appId, a.input);
    case "sanctions":
      return dealRoomApi.sanctions(eventId, appId, a.input);
    case "verify":
      return dealRoomApi.verify(eventId, appId, a.input);
    case "waiveFee":
      return dealRoomApi.waiveFee(eventId, appId, a.input);
  }
}

export function useReviewAction(eventId: string, appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (a: ReviewAction) => send(eventId, appId, a),
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
