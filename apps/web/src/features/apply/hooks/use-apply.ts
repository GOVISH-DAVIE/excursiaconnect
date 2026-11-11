/**
 * Applying's hooks. The form keeps its own copy of the fields while someone types; these save the changed fields,
 * submit, and upload, and keep the cached application (status, gaps, documents) current.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApplyMode, DraftChanges, MyApplication } from "@excursia/contracts/apply";
import { applyApi } from "../api";
import { applyFormQuery, applyKeys, myApplicationQuery, myApplicationsQuery } from "../queries";

/** The form's settings: missions, options, required fields, the window. No sign-in needed. */
export const useApplyForm = (slug: string) => useQuery(applyFormQuery(slug));

/** The signed-in applicant's applications to this event. */
export const useMyApplications = (slug: string, enabled: boolean) => useQuery({ ...myApplicationsQuery(slug), enabled });

/** One application, loaded into the form. */
export const useMyApplication = (slug: string, id: string | null) => useQuery({ ...myApplicationQuery(slug, id ?? ""), enabled: !!id });

function useKeepCurrent(slug: string) {
  const queryClient = useQueryClient();
  return (app: MyApplication) => {
    queryClient.setQueryData(applyKeys.one(slug, app.id), app);
    void queryClient.invalidateQueries({ queryKey: applyKeys.mine(slug), exact: true });
  };
}

export function useStartApplication(slug: string) {
  const keep = useKeepCurrent(slug);
  return useMutation({ mutationFn: (input: { mode: ApplyMode; invite?: string }) => applyApi.start(slug, input), onSuccess: keep });
}

/** Autosave. Its result carries the new version, gaps and save time; the form keeps the fields it has. */
export function useSaveDraft(slug: string, id: string) {
  const keep = useKeepCurrent(slug);
  return useMutation({ mutationFn: (changes: DraftChanges) => applyApi.save(slug, id, changes), onSuccess: keep, scope: { id: `draft:${id}` } });
}

/** The last changes and the submission, as one command. Shares the autosave's queue, so it goes after any save in flight. */
export function useSubmitApplication(slug: string, id: string) {
  const keep = useKeepCurrent(slug);
  return useMutation({ mutationFn: (changes: DraftChanges) => applyApi.submit(slug, id, changes), onSuccess: keep, scope: { id: `draft:${id}` } });
}

export function useUploadDocument(slug: string, id: string) {
  const keep = useKeepCurrent(slug);
  return useMutation({ mutationFn: ({ kind, file }: { kind: string; file: File }) => applyApi.upload(slug, id, kind, file), onSuccess: (r) => keep(r.app) });
}

/** Answers the team's open request: the text, and the files uploaded for it. */
export function useRespond(slug: string, id: string) {
  const keep = useKeepCurrent(slug);
  return useMutation({ mutationFn: (input: { text: string; fileIds: string[] }) => applyApi.respond(slug, id, input), onSuccess: keep });
}
