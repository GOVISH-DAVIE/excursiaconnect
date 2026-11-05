import type { Capability, Role } from "./types";

/** The roles an organiser can give, in the order the matrix shows them. Owner holds everything and cannot be edited. */
export const ROLES: Role[] = ["Owner", "Staff", "Finance", "Accreditation", "Speaker"];

export const ROLE_NOTES: Record<Role, string> = {
  Owner: "Runs the organisation. Everything, always.",
  Staff: "The event team: delegates and sessions day to day, no money.",
  Finance: "The accountant: the ledger, payouts and refunds.",
  Accreditation: "Desk and door staff: the scanner only.",
  Speaker: "A delegate with a session: their own roster and feedback.",
};

/** Every capability the platform checks, grouped as the PRD groups its sections. */
export const CAPABILITIES: { group: string; items: { id: Capability; label: string }[] }[] = [
  {
    group: "Event setup",
    items: [
      { id: "event.edit", label: "Edit the event, tiers and form" },
      { id: "event.submit", label: "Submit for approval and go live" },
      { id: "event.programme", label: "Build and publish the programme" },
    ],
  },
  {
    group: "Delegates",
    items: [
      { id: "delegates.view", label: "See the delegate list" },
      { id: "delegates.edit", label: "Correct records and merge duplicates" },
      { id: "delegates.approve", label: "Approve or decline registrations" },
      { id: "delegates.badge", label: "Reissue badges" },
      { id: "delegates.export", label: "Export lists" },
      { id: "delegates.campaign", label: "Send email and SMS campaigns" },
    ],
  },
  {
    group: "Access control",
    items: [
      { id: "access.grant", label: "Grant or revoke zone access" },
      { id: "access.scan", label: "Scan at the desk and the doors" },
      { id: "access.override", label: "Override a deny with a PIN" },
    ],
  },
  {
    group: "Money",
    items: [
      { id: "money.view", label: "See revenue and the ledger" },
      { id: "money.markPaid", label: "Mark bank transfers paid" },
      { id: "money.refund", label: "Approve refunds" },
      { id: "money.payout", label: "Request payouts and statements" },
    ],
  },
  {
    group: "Sessions",
    items: [
      { id: "sessions.own", label: "Run own session: start, end, slides, roster" },
      { id: "sessions.all", label: "Manage every session" },
    ],
  },
  {
    group: "Team",
    items: [
      { id: "team.invite", label: "Invite and remove staff" },
      { id: "team.roles", label: "Change what a role may do" },
    ],
  },
];

export const ALL_CAPABILITIES: Capability[] = CAPABILITIES.flatMap((g) => g.items.map((i) => i.id));

/** What each role may do out of the box; the owner can change every role but their own. */
export const DEFAULT_GRANTS: Record<Role, Capability[]> = {
  Owner: ALL_CAPABILITIES,
  Staff: ["event.programme", "delegates.view", "delegates.edit", "delegates.approve", "delegates.badge", "delegates.export", "delegates.campaign", "access.grant", "access.scan", "sessions.all"],
  Finance: ["delegates.view", "money.view", "money.markPaid", "money.refund", "money.payout"],
  Accreditation: ["access.scan", "access.override"],
  Speaker: ["sessions.own"],
};

export function can(grants: Record<Role, Capability[]>, role: Role, cap: Capability) {
  return role === "Owner" || grants[role]?.includes(cap);
}
