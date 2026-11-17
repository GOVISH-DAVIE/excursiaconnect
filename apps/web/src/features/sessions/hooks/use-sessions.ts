/** The team's sessions: the board, who may be invited to one, and every change (M3.3). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SessionInput } from "@excursia/contracts/sessions";
import { sessionsApi } from "../api";
import { invitableQuery, sessionsBoardQuery, sessionsKeys } from "../queries";

export const useSessionsBoard = (eventId: string) => useQuery(sessionsBoardQuery(eventId));
export const useInvitable = (eventId: string, sessionId: string, enabled: boolean) => useQuery({ ...invitableQuery(eventId, sessionId), enabled });

export function useSessionActions(eventId: string) {
  const queryClient = useQueryClient();
  // a session changes the schedule too: a meeting can no longer go over it
  const reread = () => {
    void queryClient.invalidateQueries({ queryKey: sessionsKeys.all(eventId) });
    void queryClient.invalidateQueries({ queryKey: ["meetings", eventId] });
  };
  return {
    plan: useMutation({ mutationFn: (input: SessionInput) => sessionsApi.plan(eventId, input), onSuccess: reread }),
    update: useMutation({ mutationFn: ({ sessionId, input }: { sessionId: string; input: SessionInput }) => sessionsApi.update(eventId, sessionId, input), onSuccess: reread }),
    invite: useMutation({ mutationFn: ({ sessionId, appIds }: { sessionId: string; appIds: string[] }) => sessionsApi.invite(eventId, sessionId, appIds), onSuccess: reread }),
    cancel: useMutation({ mutationFn: ({ sessionId, reason }: { sessionId: string; reason: string }) => sessionsApi.cancel(eventId, sessionId, reason), onSuccess: reread }),
    attend: useMutation({ mutationFn: ({ sessionId, appId, present }: { sessionId: string; appId: string; present: boolean }) => sessionsApi.attend(eventId, sessionId, appId, present), onSuccess: reread }),
    outcome: useMutation({ mutationFn: ({ sessionId, ...input }: { sessionId: string; appId: string; category: string; note: string }) => sessionsApi.outcome(eventId, sessionId, input), onSuccess: reread }),
  };
}
