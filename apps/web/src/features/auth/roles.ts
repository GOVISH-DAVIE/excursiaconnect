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
    /** schedules meetings (M3.2): the lead, operations and coordinators */
    meetings: m.some((x) => x.role === "dr_lead" || x.role === "dr_operations" || x.role === "dr_coordinator"),
    /** works with sessions (M3.3): the lead, operations and coordinators plan them; reviewers record outcomes */
    sessions: m.some((x) => x.role === "dr_lead" || x.role === "dr_operations" || x.role === "dr_coordinator" || x.role === "dr_reviewer"),
    /** runs the live board on the summit days (M3.4): the lead, operations, coordinators; reviewers record outcomes */
    live: m.some((x) => x.role === "dr_lead" || x.role === "dr_operations" || x.role === "dr_coordinator" || x.role === "dr_reviewer"),
    /** opens applications: the lead and reviewers */
    reviews: m.some((x) => x.role === "dr_lead" || x.role === "dr_reviewer"),
    dealRoomEvent: dr?.eventId ?? null,
  };
}

/**
 * The workspace's menu, by what the person is: Algotech, an organiser's owner, the Deal Room's team (its lead sets
 * it up). Every item opens a screen the API lets this person read; apps/api/tests/roles.test.ts holds it to that.
 */
export function menuOf(r: ReturnType<typeof rolesOf>): { href: string; label: string }[] {
  const nav: { href: string; label: string }[] = [];
  if (r.admin) nav.push({ href: "/team/admin", label: "Organisers and events" });
  if (r.superAdmin) nav.push({ href: "/team/admin/team", label: "Algotech team" });
  if (r.owner) nav.push({ href: "/team/organisation", label: "Organisation and KYC" }, { href: "/team/events", label: "Events" });
  if (r.dealRoom) nav.push({ href: "/team/overview", label: "Overview" });
  if (r.reviews) nav.push({ href: "/team/applications", label: "Review queue" });
  if (r.matching) nav.push({ href: "/team/matching", label: "Matching" });
  if (r.meetings) nav.push({ href: "/team/meetings", label: "Meetings" });
  if (r.sessions) nav.push({ href: "/team/sessions", label: "Sessions" });
  if (r.live) nav.push({ href: "/team/live", label: "Live board" });
  if (r.dealRoom) nav.push({ href: "/team/messages", label: "Messages" });
  if (r.desk) nav.push({ href: "/team/desk", label: "Desk scanners" });
  // the lead sets it up; reviewers read it, as the rubric and windows they work to
  if (r.reviews) nav.push({ href: "/team/dealroom/settings", label: "Deal Room settings" });
  return nav;
}

/** The first screen of the workspace for this person. */
export function homeOf(s: SessionView): string {
  const r = rolesOf(s);
  if (r.admin) return "/team/admin";
  if (r.owner) return "/team/organisation";
  // each Deal Room role lands on its main work; oversight reads the overview until its reports arrive (M4.3)
  if (r.reviews) return "/team/applications";
  if (r.matching) return "/team/matching";
  if (r.meetings) return "/team/meetings";
  if (r.dealRoom) return "/team/overview";
  return "/team/none";
}
