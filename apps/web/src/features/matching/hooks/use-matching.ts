/** The team's matching hooks: the board, one participant's candidates, one match, and the changes to them. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BriefInput, DecideMatchInput, IntroduceInput } from "@excursia/contracts/matching";
import { matchingApi } from "../api";
import { boardQuery, candidatesQuery, matchingKeys, matchQuery } from "../queries";

export const useBoard = (eventId: string) => useQuery(boardQuery(eventId));
export const useCandidates = (eventId: string, appId: string) => useQuery({ ...candidatesQuery(eventId, appId), enabled: !!appId });
export const useMatch = (eventId: string, matchId: string) => useQuery(matchQuery(eventId, matchId));

/** A decision changes the board, the candidates and the match: all of it is read again. */
export function useDecide(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DecideMatchInput) => matchingApi.decide(eventId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: matchingKeys.all(eventId) }),
  });
}

/** The brief and the introduction answer with the match as it is now. */
export function useMatchActions(eventId: string, matchId: string) {
  const queryClient = useQueryClient();
  const put = (view: Awaited<ReturnType<typeof matchingApi.match>>) => {
    queryClient.setQueryData(matchingKeys.match(eventId, matchId), view);
    void queryClient.invalidateQueries({ queryKey: matchingKeys.board(eventId) });
  };
  return {
    brief: useMutation({ mutationFn: (input: BriefInput) => matchingApi.brief(eventId, matchId, input), onSuccess: put }),
    introduce: useMutation({ mutationFn: (input: IntroduceInput) => matchingApi.introduce(eventId, matchId, input), onSuccess: put }),
  };
}
