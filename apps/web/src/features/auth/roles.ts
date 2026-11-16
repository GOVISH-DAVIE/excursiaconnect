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
    /** works the Deal Room desk: enrols scanners and scans (M2.2) */
    desk: m.some((x) => x.role === "dr_lead" || x.role === "dr_operations" || x.role === "dr_coordinator"),
    /** matches participants and sends introductions (M3.1): the lead, reviewers and coordinators */
    matching: m.some((x) => x.role === "dr_lead" || x.role === "dr_reviewer" || x.role === "dr_coordinator"),
    /** opens applications: the lead and reviewers */
    reviews: m.some((x) => x.role === "dr_lead" || x.role === "dr_reviewer"),
    dealRoomEvent: dr?.eventId ?? null,
  };
}

/** The first screen of the workspace for this person. */
export function homeOf(s: SessionView): string {
  const r = rolesOf(s);
  if (r.admin) return "/team/admin";
  if (r.owner) return "/team/organisation";
  if (r.dealRoom) return r.reviews || !r.desk ? "/team/applications" : "/team/desk";
  return "/team/none";
}
