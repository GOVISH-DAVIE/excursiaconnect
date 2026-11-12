import type { SessionView } from "@excursia/contracts/auth";

/** What the signed-in person is, from their memberships: the workspace's menu and first screen follow from it. */
export function rolesOf(s: SessionView | null | undefined) {
  const m = s?.memberships ?? [];
  const dr = m.find((x) => x.role.startsWith("dr_") && x.eventId);
  return {
    admin: s?.user.kind === "admin" || m.some((x) => x.role === "admin" || x.role === "super_admin"),
    /** a super admin also manages Algotech's team and the organisers' rate cards */
    superAdmin: m.some((x) => x.role === "super_admin"),
    owner: m.some((x) => x.role === "owner"),
    dealRoom: !!dr,
    lead: m.some((x) => x.role === "dr_lead"),
    dealRoomEvent: dr?.eventId ?? null,
  };
}

/** The first screen of the workspace for this person. */
export function homeOf(s: SessionView): string {
  const r = rolesOf(s);
  if (r.admin) return "/team/admin";
  if (r.owner) return "/team/organisation";
  if (r.dealRoom) return "/team/applications";
  return "/team/none";
}
