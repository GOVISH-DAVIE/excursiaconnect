/** The business's own teaser and documents, and the directory of teasers a verified counterparty browses (M3.1). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Directory, MyProfile, TeaserInput } from "@excursia/contracts/matching";
import { matchingApi } from "../api";
import { directoryQuery, matchingKeys, myProfileQuery } from "../queries";

export const useMyProfile = (slug: string, enabled: boolean) => useQuery({ ...myProfileQuery(slug), enabled });

export function useTeaserActions(slug: string) {
  const queryClient = useQueryClient();
  const put = (p: MyProfile) => queryClient.setQueryData(matchingKeys.profile(slug), p);
  return {
    save: useMutation({ mutationFn: (input: TeaserInput) => matchingApi.saveTeaser(slug, input), onSuccess: put }),
    download: useMutation({ mutationFn: ({ docId, download }: { docId: string; download: boolean }) => matchingApi.setDownload(slug, docId, download), onSuccess: put }),
  };
}

export const useDirectory = (slug: string, enabled: boolean) => useQuery({ ...directoryQuery(slug), enabled });

export function useInterest(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (seekerId: string) => matchingApi.interest(slug, seekerId), onSuccess: (d: Directory) => queryClient.setQueryData(matchingKeys.directory(slug), d) });
}
