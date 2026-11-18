/** The participant's own meetings: confirming, moving, answering a move, and taking one into a calendar (M3.2). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { downloadText } from "@/lib/download";
import { meetingsApi } from "../api";
import { meetingsKeys, moveTimesQuery, myMeetingsQuery } from "../queries";

export const useMyMeetings = (slug: string, enabled: boolean) => useQuery({ ...myMeetingsQuery(slug), enabled });

export const useMoveTimes = (slug: string, meetingId: string, day: string) => useQuery({ ...moveTimesQuery(slug, meetingId, day), enabled: !!day });

export function useMyMeetingActions(slug: string, meetingId: string) {
  const queryClient = useQueryClient();
  const put = (all: Awaited<ReturnType<typeof meetingsApi.mine>>) => {
    queryClient.setQueryData(meetingsKeys.mine(slug), all);
    void queryClient.invalidateQueries({ queryKey: ["my-meetings", slug, "times"] });
  };
  return {
    confirm: useMutation({ mutationFn: () => meetingsApi.confirm(slug, meetingId), onSuccess: put }),
    ask: useMutation({ mutationFn: (input: { start: string; reason: string }) => meetingsApi.askMove(slug, meetingId, input), onSuccess: put }),
    answer: useMutation({ mutationFn: (input: { agree: boolean; reason?: string }) => meetingsApi.answerMove(slug, meetingId, input), onSuccess: put }),
    /** Takes the meeting's start, for the file's name: the API's own name isn't readable across origins. */
    calendar: useMutation({
      mutationFn: (start: string) => meetingsApi.invite(slug, meetingId).then((f) => ({ ...f, start })),
      onSuccess: (f) => downloadText(f.filename ?? `deal-room-${f.start.slice(0, 10)}-${f.start.slice(11).replace(":", "")}.ics`, f.text, "text/calendar"),
    }),
  };
}

/** The participant's answer to a session's invitation (M3.3). */
export function useSessionAnswer(slug: string, sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answer: "Accepted" | "Declined") => meetingsApi.respondSession(slug, sessionId, answer),
    onSuccess: (all) => queryClient.setQueryData(meetingsKeys.mine(slug), all),
  });
}
