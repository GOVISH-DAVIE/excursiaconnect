/** The badge's query contracts. */
import { queryOptions } from "@tanstack/react-query";
import { badgesApi } from "./api";

export const badgeKeys = { mine: (slug: string) => ["badges", slug] as const };

export const myBadgesQuery = (slug: string) => queryOptions({ queryKey: badgeKeys.mine(slug), queryFn: () => badgesApi.mine(slug), staleTime: 30_000 });
