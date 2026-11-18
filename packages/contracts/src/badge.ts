/**
 * The Deal Room badge (backend-plan.md, M2.1): what its participant sees on the badge page, what they may correct,
 * and what the desk does to it. The badge's code is what its QR carries, so it travels only to its holder and to
 * the staff who may reissue it, never in an email or a URL.
 */
import { z } from "zod";

export const BadgeParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{3,80}$/), appId: z.string().regex(/^dr_[a-z0-9_]{2,60}$/) });

/** One badge, as its holder sees it. */
export const BadgeView = z.object({
  appId: z.string(),
  ref: z.string().nullable(),
  code: z.string(),
  /** revoked: a later decision took the place away; the code opens nothing */
  status: z.enum(["valid", "revoked"]),
  name: z.string(),
  organisation: z.string(),
  jobTitle: z.string(),
  category: z.string(),
  tier: z.string(),
  /** the desk has checked them in once; until then, the desk is the first stop */
  accredited: z.boolean(),
  /** the organiser has locked names and titles for printing (OS-10): changes go through the desk */
  locked: z.boolean(),
  event: z.object({
    name: z.string(),
    venue: z.string(),
    city: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    brand: z.object({ primary: z.string(), logoText: z.string() }),
  }),
});
export type BadgeView = z.infer<typeof BadgeView>;

/** The signed-in participant's badges at one event: one per application that holds one. */
export const MyBadges = z.array(BadgeView);
export type MyBadges = z.infer<typeof MyBadges>;

/** The name and title printed on the badge. */
export const BadgeDetailsInput = z.object({
  name: z.string().trim().min(2, "give the name to print, 2 to 80 characters").max(80, "at most 80 characters"),
  jobTitle: z.string().trim().max(80, "at most 80 characters"),
});
export type BadgeDetailsInput = z.infer<typeof BadgeDetailsInput>;

/** A lost or shared badge: a new code, and the old one stops opening doors. */
export const ReissueBadgeInput = z.object({ reason: z.string().trim().min(1, "say why it is reissued").max(300) });
export type ReissueBadgeInput = z.infer<typeof ReissueBadgeInput>;

/** The badge on the team's review page. */
export const StaffBadge = z.object({
  code: z.string(),
  status: z.enum(["valid", "revoked"]),
  name: z.string(),
  jobTitle: z.string(),
  accredited: z.boolean(),
});
export type StaffBadge = z.infer<typeof StaffBadge>;
