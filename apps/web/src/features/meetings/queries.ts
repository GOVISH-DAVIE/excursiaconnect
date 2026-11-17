/** Scheduling's query contracts. */
import { queryOptions } from "@tanstack/react-query";
import { meetingsApi } from "./api";

export const meetingsKeys = {
  schedule: (eventId: string) => ["meetings", eventId, "schedule"] as const,
  slots: (eventId: string, matchId: string, day: string, flagged: boolean | undefined, meetingId: string | undefined) => ["meetings", eventId, "slots", matchId, day, flagged ?? null, meetingId ?? null] as const,
  mine: (slug: string) => ["my-meetings", slug] as const,
  times: (slug: string, meetingId: string, day: string) => ["my-meetings", slug, "times", meetingId, day] as const,
};

export const scheduleQuery = (eventId: string) => queryOptions({ queryKey: meetingsKeys.schedule(eventId), queryFn: () => meetingsApi.schedule(eventId), staleTime: 10_000 });
export const slotsQuery = (eventId: string, q: { matchId: string; day: string; flagged?: boolean; meetingId?: string }) =>
  queryOptions({ queryKey: meetingsKeys.slots(eventId, q.matchId, q.day, q.flagged, q.meetingId), queryFn: () => meetingsApi.slots(eventId, q), staleTime: 5_000 });
export const myMeetingsQuery = (slug: string) => queryOptions({ queryKey: meetingsKeys.mine(slug), queryFn: () => meetingsApi.mine(slug), staleTime: 10_000 });
export const moveTimesQuery = (slug: string, meetingId: string, day: string) =>
  queryOptions({ queryKey: meetingsKeys.times(slug, meetingId, day), queryFn: () => meetingsApi.times(slug, meetingId, day), staleTime: 5_000 });
