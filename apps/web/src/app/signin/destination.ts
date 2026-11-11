import type { SessionView } from "@excursia/contracts/auth";

/** Where a person lands once signed in: their own workspace, until a `next` link says otherwise. */
export function destination(s: SessionView): string {
  if (s.user.kind === "admin" || s.memberships.some((m) => m.role === "admin")) return "/admin";
  if (s.memberships.some((m) => m.role.startsWith("dr_"))) return "/dealroom";
  if (s.user.kind === "staff") return "/organiser";
  // applicants: the prototype's home until their portal reads from the API
  return "/";
}
