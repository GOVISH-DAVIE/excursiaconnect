/** Applying's query contracts: everything under ["apply", slug]. */
import { queryOptions } from "@tanstack/react-query";
import { applyApi } from "./api";

export const applyKeys = {
  all: (slug: string) => ["apply", slug] as const,
  mine: (slug: string) => ["apply", slug, "mine"] as const,
  one: (slug: string, id: string) => ["apply", slug, "mine", id] as const,
};

export const applyFormQuery = (slug: string) => queryOptions({ queryKey: [...applyKeys.all(slug), "form"], queryFn: () => applyApi.form(slug), staleTime: 300_000 });
export const myApplicationsQuery = (slug: string) => queryOptions({ queryKey: applyKeys.mine(slug), queryFn: () => applyApi.mine(slug), staleTime: 0 });
export const myApplicationQuery = (slug: string, id: string) =>
  // loaded once into the form; the form then owns the fields until the next visit
  queryOptions({ queryKey: applyKeys.one(slug, id), queryFn: () => applyApi.get(slug, id), staleTime: Infinity, refetchOnWindowFocus: false });
