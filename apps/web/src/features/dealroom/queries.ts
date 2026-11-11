/** The Deal Room's query contracts: every key under ["dealroom", eventId], so one event's data invalidates together. */
import { queryOptions } from "@tanstack/react-query";
import { dealRoomApi, type QueueFilter } from "./api";

export const dealRoomKeys = {
  event: (eventId: string) => ["dealroom", eventId] as const,
  applications: (eventId: string) => ["dealroom", eventId, "applications"] as const,
  /** one application's review: kept apart from the queue's keys, so the queue's refresh doesn't refetch it */
  review: (eventId: string, appId: string) => ["dealroom", eventId, "review", appId] as const,
};

export const reviewQuery = (eventId: string, appId: string) =>
  queryOptions({ queryKey: dealRoomKeys.review(eventId, appId), queryFn: () => dealRoomApi.review(eventId, appId), staleTime: 10_000 });

export const teamQuery = (eventId: string) =>
  queryOptions({ queryKey: [...dealRoomKeys.event(eventId), "team"], queryFn: () => dealRoomApi.team(eventId), staleTime: 60_000 });

export const applicationsQuery = (eventId: string, filter: QueueFilter) =>
  queryOptions({ queryKey: [...dealRoomKeys.applications(eventId), filter], queryFn: () => dealRoomApi.applications(eventId, filter), staleTime: 15_000 });
