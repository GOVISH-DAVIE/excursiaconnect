/** The team's schedule: what is ready, what is booked, and every change to it (M3.2). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MoveInput, ProposeInput } from "@excursia/contracts/meetings";
import { meetingsApi } from "../api";
import { scheduleQuery, slotsQuery } from "../queries";

export const useSchedule = (eventId: string) => useQuery(scheduleQuery(eventId));

export const useSlots = (eventId: string, q: { matchId: string; day: string; flagged?: boolean; meetingId?: string } | null) =>
  useQuery({ ...slotsQuery(eventId, q ?? { matchId: "", day: "" }), enabled: !!q?.matchId && !!q.day });

export function useScheduleActions(eventId: string) {
  const queryClient = useQueryClient();
  // any change moves the schedule, the free tables and the caps: read them again
  const reread = () => queryClient.invalidateQueries({ queryKey: ["meetings", eventId] });
  return {
    propose: useMutation({ mutationFn: (input: ProposeInput) => meetingsApi.propose(eventId, input), onSuccess: reread }),
    autoPropose: useMutation({ mutationFn: () => meetingsApi.autoPropose(eventId), onSuccess: reread }),
    move: useMutation({ mutationFn: ({ meetingId, input }: { meetingId: string; input: MoveInput }) => meetingsApi.move(eventId, meetingId, input), onSuccess: reread }),
    cancel: useMutation({ mutationFn: ({ meetingId, reason }: { meetingId: string; reason: string }) => meetingsApi.cancel(eventId, meetingId, reason), onSuccess: reread }),
    accept: useMutation({ mutationFn: (meetingId: string) => meetingsApi.acceptChange(eventId, meetingId), onSuccess: reread }),
    decline: useMutation({ mutationFn: ({ meetingId, reason }: { meetingId: string; reason: string }) => meetingsApi.declineChange(eventId, meetingId, reason), onSuccess: reread }),
  };
}
