import { useMutation, useQueryClient, type MutationFunction } from "@tanstack/react-query";
import { sessionQuery } from "../queries";

/** A sign-in step that changes who is signed in: when it succeeds, the session is asked for again. */
export function useSessionMutation<T, V>(mutationFn: MutationFunction<T, V>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionQuery.key }) });
}
