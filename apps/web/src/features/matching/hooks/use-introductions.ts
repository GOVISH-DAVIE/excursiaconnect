/** The participant's introductions: answering, sharing documents, and opening the other side's. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RespondIntroInput } from "@excursia/contracts/matching";
import { matchingApi } from "../api";
import { introductionsQuery, matchingKeys } from "../queries";

export const useIntroductions = (slug: string, enabled: boolean) => useQuery({ ...introductionsQuery(slug), enabled });

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function useIntroActions(slug: string, matchId: string) {
  const queryClient = useQueryClient();
  const put = (all: Awaited<ReturnType<typeof matchingApi.mine>>) => queryClient.setQueryData(matchingKeys.mine(slug), all);
  // every opening is logged where the business sees it: its own list changes too
  const reread = () => queryClient.invalidateQueries({ queryKey: matchingKeys.mine(slug) });
  return {
    respond: useMutation({ mutationFn: (input: RespondIntroInput) => matchingApi.respond(slug, matchId, input), onSuccess: put }),
    consent: useMutation({ mutationFn: ({ docId, granted }: { docId: string; granted: boolean }) => matchingApi.consent(slug, matchId, docId, granted), onSuccess: put }),
    profile: useMutation({ mutationFn: () => matchingApi.profile(slug, matchId), onSuccess: reread }),
    /**
     * Opens a document's stamped copy. A view goes to a tab opened at the click (a tab opened after the answer would
     * be blocked as a pop-up); a download stays on the page.
     */
    open: useMutation({
      mutationFn: async ({ docId, action }: { docId: string; action: "view" | "download"; tab: Window | null }) => matchingApi.open(slug, matchId, docId, action),
      onSuccess: (link, { action, tab }) => {
        const url = link.url.startsWith("http") ? link.url : `${API}${link.url}`;
        if (action === "view" && tab) tab.location.href = url;
        else window.location.assign(url);
        void reread();
      },
      onError: (_e, { tab }) => tab?.close(),
    }),
  };
}
