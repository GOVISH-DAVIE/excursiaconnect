/** The badge's hooks: the participant's own, and the desk's changes from the review page. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BadgeDetailsInput, ReissueBadgeInput } from "@excursia/contracts/badge";
import { badgesApi } from "../api";
import { badgeKeys, myBadgesQuery } from "../queries";

export const useMyBadges = (slug: string, enabled: boolean) => useQuery({ ...myBadgesQuery(slug), enabled });

export function useBadgeDetails(slug: string, appId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BadgeDetailsInput) => badgesApi.details(slug, appId, input),
    onSuccess: (badge) => queryClient.setQueryData(badgeKeys.mine(slug), (all: Awaited<ReturnType<typeof badgesApi.mine>> | undefined) => all?.map((b) => (b.appId === badge.appId ? badge : b))),
  });
}

/** The desk's changes; the review page reloads its view after each. */
export function useDeskBadge(eventId: string, appId: string, reviewKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: reviewKey });
  return {
    details: useMutation({ mutationFn: (input: BadgeDetailsInput) => badgesApi.deskDetails(eventId, appId, input), onSuccess: refresh }),
    reissue: useMutation({ mutationFn: (input: ReissueBadgeInput) => badgesApi.reissue(eventId, appId, input), onSuccess: refresh }),
  };
}
