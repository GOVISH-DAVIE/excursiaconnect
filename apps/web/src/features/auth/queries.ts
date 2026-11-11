/** Sign-in's query contracts: the one key the session lives under, shared by every hook that reads or changes it. */
import { queryOptions } from "@tanstack/react-query";
import { authApi } from "./api";

export const sessionQuery = {
  key: ["session"] as const,
  options: () => queryOptions({ queryKey: sessionQuery.key, queryFn: authApi.session, staleTime: 30_000 }),
};
