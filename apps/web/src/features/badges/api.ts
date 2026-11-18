/** The badge's calls to the API: the only file in the web app that knows these paths. */
import { BadgeView, MyBadges, StaffBadge, type BadgeDetailsInput, type ReissueBadgeInput } from "@excursia/contracts/badge";
import { http } from "../http";

export const badgesApi = {
  /** The signed-in participant's badges at one event. */
  mine: (slug: string) => http.get(`/v1/badges/${slug}`, { schema: MyBadges }),
  /** The name and title printed on their badge, corrected by its holder. */
  details: (slug: string, appId: string, input: BadgeDetailsInput) => http.patch(`/v1/badges/${slug}/${appId}`, { body: input, schema: BadgeView }),
  /** The desk's correction, at any time, even when locked for printing. */
  deskDetails: (eventId: string, appId: string, input: BadgeDetailsInput) =>
    http.patch(`/v1/dealroom/${eventId}/applications/${appId}/badge`, { body: input, schema: StaffBadge }),
  /** A lost or shared badge: a new code; the old one stops opening doors. */
  reissue: (eventId: string, appId: string, input: ReissueBadgeInput) =>
    http.post(`/v1/dealroom/${eventId}/applications/${appId}/badge/reissue`, { body: input, schema: StaffBadge }),
};
