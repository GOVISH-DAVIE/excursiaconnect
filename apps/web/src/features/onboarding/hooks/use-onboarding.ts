/**
 * Onboarding's hooks. Every change answers with the new view, which replaces the cached one; the lists that show
 * it (the organiser's own, Algotech's queue) are asked again.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminMember, EventView, OrganiserView } from "@excursia/contracts/onboarding";
import { onboardingApi } from "../api";
import { adminTeamQuery, eventQuery, mineQuery, onboardingKeys, organiserQuery, queueQuery, settingsQuery } from "../queries";

export const useMyOrganisers = (enabled = true) => useQuery({ ...mineQuery(), enabled });
export const useOrganiser = (id: string) => useQuery(organiserQuery(id));
export const useEvent = (id: string) => useQuery(eventQuery(id));
export const useAdminQueue = (enabled = true) => useQuery({ ...queueQuery(), enabled });
export const useDealRoomSettings = (eventId: string, enabled = true) => useQuery({ ...settingsQuery(eventId), enabled });

/** A change to an organiser: the answer is its new view. */
export function useOrganiserChange<A>(organiserId: string, fn: (arg: A) => Promise<OrganiserView>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (view) => {
      qc.setQueryData(onboardingKeys.organiser(organiserId), view);
      void qc.invalidateQueries({ queryKey: onboardingKeys.mine });
      void qc.invalidateQueries({ queryKey: onboardingKeys.queue });
    },
  });
}

/** A change to an event: the answer is its new view. */
export function useEventChange<A>(fn: (arg: A) => Promise<EventView>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (view) => {
      qc.setQueryData(onboardingKeys.event(view.id), view);
      void qc.invalidateQueries({ queryKey: onboardingKeys.mine });
      void qc.invalidateQueries({ queryKey: onboardingKeys.queue });
      void qc.invalidateQueries({ queryKey: onboardingKeys.organiser(view.organiser.id) });
    },
  });
}

/** Opens a KYC document through its short-lived link (an attachment, so the page stays put). */
export function useOpenKycDoc(organiserId: string) {
  return useMutation({
    mutationFn: (fileId: string) => onboardingApi.kycDocLink(organiserId, fileId),
    onSuccess: (link) => {
      const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
      window.location.assign(link.url.startsWith("http") ? link.url : `${base}${link.url}`);
    },
  });
}

export function useSaveSettings(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof onboardingApi.saveSettings>[1]) => onboardingApi.saveSettings(eventId, input),
    onSuccess: (view) => qc.setQueryData(onboardingKeys.settings(eventId), view),
  });
}

export const useAdminTeam = () => useQuery(adminTeamQuery());

/** A change to Algotech's team: the answer is the team as it now is. */
export function useAdminTeamChange<A>(fn: (arg: A) => Promise<AdminMember[]>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (team) => qc.setQueryData(onboardingKeys.team, team) });
}
