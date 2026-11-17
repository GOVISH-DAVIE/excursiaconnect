/** Matching's query contracts. */
import { queryOptions } from "@tanstack/react-query";
import { matchingApi } from "./api";

export const matchingKeys = {
  all: (eventId: string) => ["matching", eventId] as const,
  board: (eventId: string) => ["matching", eventId, "board"] as const,
  candidates: (eventId: string, appId: string) => ["matching", eventId, "candidates", appId] as const,
  match: (eventId: string, matchId: string) => ["matching", eventId, "match", matchId] as const,
  mine: (slug: string) => ["introductions", slug] as const,
  profile: (slug: string) => ["introductions", slug, "teaser"] as const,
  directory: (slug: string) => ["introductions", slug, "directory"] as const,
};

export const boardQuery = (eventId: string) => queryOptions({ queryKey: matchingKeys.board(eventId), queryFn: () => matchingApi.board(eventId), staleTime: 15_000 });
export const candidatesQuery = (eventId: string, appId: string) =>
  queryOptions({ queryKey: matchingKeys.candidates(eventId, appId), queryFn: () => matchingApi.candidates(eventId, appId), staleTime: 15_000 });
export const matchQuery = (eventId: string, matchId: string) => queryOptions({ queryKey: matchingKeys.match(eventId, matchId), queryFn: () => matchingApi.match(eventId, matchId), staleTime: 10_000 });
export const introductionsQuery = (slug: string) => queryOptions({ queryKey: matchingKeys.mine(slug), queryFn: () => matchingApi.mine(slug), staleTime: 15_000 });
export const myProfileQuery = (slug: string) => queryOptions({ queryKey: matchingKeys.profile(slug), queryFn: () => matchingApi.myProfile(slug), staleTime: 15_000 });
export const directoryQuery = (slug: string) => queryOptions({ queryKey: matchingKeys.directory(slug), queryFn: () => matchingApi.directory(slug), staleTime: 15_000 });
