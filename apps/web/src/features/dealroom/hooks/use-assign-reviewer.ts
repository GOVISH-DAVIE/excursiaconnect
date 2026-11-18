import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AssignReviewerInput } from "@excursia/contracts/dealroom";
import { dealRoomApi } from "../api";
import { dealRoomKeys } from "../queries";

/** Assigns applications to a reviewer; every queue view of this event then asks again. */
export function useAssignReviewer(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignReviewerInput) => dealRoomApi.assignReviewer(eventId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dealRoomKeys.applications(eventId) }),
  });
}
