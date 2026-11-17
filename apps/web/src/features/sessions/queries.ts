/** Sessions' query contracts. */
import { queryOptions } from "@tanstack/react-query";
import { sessionsApi } from "./api";

export const sessionsKeys = {
  all: (eventId: string) => ["sessions", eventId] as const,
  board: (eventId: string) => ["sessions", eventId, "board"] as const,
  invitable: (eventId: string, sessionId: string) => ["sessions", eventId, "invitable", sessionId] as const,
};

export const sessionsBoardQuery = (eventId: string) => queryOptions({ queryKey: sessionsKeys.board(eventId), queryFn: () => sessionsApi.board(eventId), staleTime: 10_000 });
export const invitableQuery = (eventId: string, sessionId: string) => queryOptions({ queryKey: sessionsKeys.invitable(eventId, sessionId), queryFn: () => sessionsApi.invitable(eventId, sessionId), staleTime: 5_000 });
