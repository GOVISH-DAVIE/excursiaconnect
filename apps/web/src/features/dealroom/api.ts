/** The Deal Room's calls to the API: the only file in the web app that knows these paths. */
import { z } from "zod";
import { ApplicationSummary, MessageRow, TeamView, type AssignReviewerInput } from "@excursia/contracts/dealroom";
import {
  DocumentLink, ReviewView, type CheckKycInput, type DecideInput, type ReadinessInput, type RecommendInput, type RequestInfoInput, type RfiExpiryInput, type SanctionsInput,
  type ScoreInput, type VerifyInput,
} from "@excursia/contracts/review";
import { http } from "../http";

export type QueueFilter = { status?: string; assignee?: string };
const one = (eventId: string, appId: string) => `/v1/dealroom/${eventId}/applications/${appId}`;

export const dealRoomApi = {
  team: (eventId: string) => http.get(`/v1/dealroom/${eventId}/team`, { schema: TeamView }),
  applications: (eventId: string, filter: QueueFilter) => http.get(`/v1/dealroom/${eventId}/applications`, { query: filter, schema: z.array(ApplicationSummary) }),
  review: (eventId: string, appId: string) => http.get(`/v1/dealroom/${eventId}/applications/${appId}`, { schema: ReviewView }),
  startReview: (eventId: string, appId: string) => http.post(`/v1/dealroom/${eventId}/applications/${appId}/start-review`, { schema: ReviewView }),
  score: (eventId: string, appId: string, input: ScoreInput) => http.post(`/v1/dealroom/${eventId}/applications/${appId}/scores`, { body: input, schema: ReviewView }),
  requestInfo: (eventId: string, appId: string, input: RequestInfoInput) =>
    http.post(`/v1/dealroom/${eventId}/applications/${appId}/requests`, { body: input, schema: ReviewView }),
  rfiExpiry: (eventId: string, appId: string, input: RfiExpiryInput) =>
    http.post(`/v1/dealroom/${eventId}/applications/${appId}/requests/expiry`, { body: input, schema: ReviewView }),
  // decisions, readiness and verification (M1.6): each answers with the review's new view
  recommend: (eventId: string, appId: string, input: RecommendInput) => http.post(`${one(eventId, appId)}/recommendations`, { body: input, schema: ReviewView }),
  decide: (eventId: string, appId: string, input: DecideInput) => http.post(`${one(eventId, appId)}/decisions`, { body: input, schema: ReviewView }),
  confirmSecond: (eventId: string, appId: string) => http.post(`${one(eventId, appId)}/decisions/confirm`, { schema: ReviewView }),
  meetCondition: (eventId: string, appId: string, conditionId: string) => http.post(`${one(eventId, appId)}/conditions/${conditionId}/met`, { schema: ReviewView }),
  confirmDecisionMaker: (eventId: string, appId: string) => http.post(`${one(eventId, appId)}/decision-maker/confirm`, { schema: ReviewView }),
  readiness: (eventId: string, appId: string, input: ReadinessInput) => http.post(`${one(eventId, appId)}/readiness`, { body: input, schema: ReviewView }),
  checkKyc: (eventId: string, appId: string, input: CheckKycInput) => http.post(`${one(eventId, appId)}/kyc/check`, { body: input, schema: ReviewView }),
  sanctions: (eventId: string, appId: string, input: SanctionsInput) => http.post(`${one(eventId, appId)}/sanctions`, { body: input, schema: ReviewView }),
  verify: (eventId: string, appId: string, input: VerifyInput) => http.post(`${one(eventId, appId)}/verification`, { body: input, schema: ReviewView }),
  documentLink: (eventId: string, appId: string, docId: string) => http.get(`/v1/dealroom/${eventId}/applications/${appId}/documents/${docId}`, { schema: DocumentLink }),
  messages: (eventId: string) => http.get(`/v1/dealroom/${eventId}/messages`, { schema: z.array(MessageRow) }),
  assignReviewer: (eventId: string, input: AssignReviewerInput) =>
    http.post(`/v1/dealroom/${eventId}/applications/assign`, { body: input, schema: z.array(ApplicationSummary) }),
};
