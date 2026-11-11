/** The Deal Room's calls to the API: the only file in the web app that knows these paths. */
import { z } from "zod";
import { ApplicationSummary, TeamView, type AssignReviewerInput } from "@excursia/contracts/dealroom";
import { DocumentLink, ReviewView, type RequestInfoInput, type RfiExpiryInput, type ScoreInput } from "@excursia/contracts/review";
import { http } from "../http";

export type QueueFilter = { status?: string; assignee?: string };

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
  documentLink: (eventId: string, appId: string, docId: string) => http.get(`/v1/dealroom/${eventId}/applications/${appId}/documents/${docId}`, { schema: DocumentLink }),
  assignReviewer: (eventId: string, input: AssignReviewerInput) =>
    http.post(`/v1/dealroom/${eventId}/applications/assign`, { body: input, schema: z.array(ApplicationSummary) }),
};
