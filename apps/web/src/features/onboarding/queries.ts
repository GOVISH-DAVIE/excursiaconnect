/** Onboarding's query contracts: an organiser's keys under ["organiser", id], an event's under ["event", id]. */
import { queryOptions } from "@tanstack/react-query";
import { onboardingApi } from "./api";

export const onboardingKeys = {
  mine: ["organisers", "mine"] as const,
  organiser: (id: string) => ["organiser", id] as const,
  event: (id: string) => ["event", id] as const,
  queue: ["admin", "queue"] as const,
  settings: (eventId: string) => ["dealroom", eventId, "settings"] as const,
};

export const mineQuery = () => queryOptions({ queryKey: onboardingKeys.mine, queryFn: onboardingApi.mine, staleTime: 15_000 });
export const organiserQuery = (id: string) => queryOptions({ queryKey: onboardingKeys.organiser(id), queryFn: () => onboardingApi.organiser(id), staleTime: 15_000 });
export const eventQuery = (id: string) => queryOptions({ queryKey: onboardingKeys.event(id), queryFn: () => onboardingApi.event(id), staleTime: 15_000 });
export const queueQuery = () => queryOptions({ queryKey: onboardingKeys.queue, queryFn: onboardingApi.queue, staleTime: 15_000 });
export const settingsQuery = (eventId: string) => queryOptions({ queryKey: onboardingKeys.settings(eventId), queryFn: () => onboardingApi.settings(eventId), staleTime: 30_000 });
