/** The Deal Room's calls to the API: the only file in the web app that knows these paths. */
import { z } from "zod";
import { ApplicationSummary, TeamView, type AssignReviewerInput } from "@excursia/contracts/dealroom";
import { http } from "../http";

export type QueueFilter = { status?: string; assignee?: string };

export const dealRoomApi = {
  team: (eventId: string) => http.get(`/v1/dealroom/${eventId}/team`, { schema: TeamView }),
  applications: (eventId: string, filter: QueueFilter) => http.get(`/v1/dealroom/${eventId}/applications`, { query: filter, schema: z.array(ApplicationSummary) }),
  assignReviewer: (eventId: string, input: AssignReviewerInput) =>
    http.post(`/v1/dealroom/${eventId}/applications/assign`, { body: input, schema: z.array(ApplicationSummary) }),
};
