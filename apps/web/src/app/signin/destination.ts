import type { SessionView } from "@excursia/contracts/auth";

/** Where a person lands once signed in: their own workspace, until a `next` link says otherwise. */
export function destination(s: SessionView): string {
  // staff and Algotech: the workspace on the API, which opens on the person's own first screen (team/page.tsx)
  if (s.user.kind === "admin" || s.user.kind === "staff") return "/team";
  // applicants: the prototype's home until their portal reads from the API
  return "/";
}
