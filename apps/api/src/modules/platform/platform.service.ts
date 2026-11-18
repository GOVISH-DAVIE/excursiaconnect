/**
 * Algotech's use cases on organisers and events (backend-plan.md, M2.3; DA-1, DA-2): verifying or returning an
 * organiser's KYC, approving a submitted event with its terms (and the Deal Room add-on), and giving the Deal Room
 * its staff accounts. Algotech admins only, and only with the authenticator confirmed in this session: a skipped
 * authenticator (D14) can read but not decide.
 */
import { randomBytes } from "node:crypto";
import type { AdminInvite as AdminInviteInput, AdminMember, OpenOrganiser as OpenOrganiserInput, RateCard as RateCardInput, AdminQueue, DealRoomStaffInput, EventDecisionInput, EventView, KycDecision, OrganiserView } from "@excursia/contracts/onboarding";
import { decideEvent, decideKyc, newOrganiser, setRateCard } from "@excursia/domain/core/onboarding";
import { nairobiNow } from "@excursia/domain/ctx";
import { starterConfig } from "@excursia/domain/dealroom/defaults";
import type { DrStaff } from "@excursia/domain/dealroom/types";
import type { EventRecord, Organiser } from "@excursia/domain/types";
import { HttpError } from "../../http/errors";
import type { Resolved } from "../auth/auth.service";
import type { Commands } from "../dealroom/dealroom.commands";
import type { StaffLink as StaffLinkRow } from "../dealroom/dealroom.repo";
import type { DrConfigRecord } from "../dealroom/dealroom.mapper";
import type { OrganisersRepo } from "../organisers/organisers.repo";
import { isAdmin, must, type OrganisersService } from "../organisers/organisers.service";
import { eventSummary } from "../organisers/organisers.views";
import type { PlatformRepo } from "./platform.repo";

/** The decide right: the lead always holds it, a reviewer where the lead marks them; no other role decides (PRD). */
const decides = (role: DrStaff["role"], marked: boolean) => role === "Lead" || (role === "Reviewer" && marked);

export type PlatformDeps = { repo: OrganisersRepo; platform: PlatformRepo; organisers: OrganisersService; commands: Commands; now: () => Date };

export function createPlatformService({ repo, platform, organisers, commands, now }: PlatformDeps) {
  const at = () => nairobiNow(now());

  function admin(session: Resolved) {
    if (!isAdmin(session)) throw new HttpError("forbidden", "This is for Algotech admins.");
  }
  /** Decisions need the authenticator, not "set up later". */
  function deciding(session: Resolved) {
    admin(session);
    if (session.session.mfaSkipped) throw new HttpError("forbidden", "Set up your authenticator before deciding: Algotech's decisions need it.");
  }
  const by = (session: Resolved) => session.user.name;
  /** Managing Algotech's own team: super admins, with the authenticator confirmed. */
  async function superDeciding(session: Resolved) {
    deciding(session);
    if (!(await platform.isSuper(session.user.id))) throw new HttpError("forbidden", "Only a super admin manages Algotech's team.");
  }
  const actor = (session: Resolved, ip: string | null) => ({ userId: session.user.id, ip });

  /** One Deal Room staff member, on a real event, in the rules' state. */
  async function realDealRoom(eventId: string) {
    const row = await repo.event(eventId);
    if (!row || row.demo) throw new HttpError("not_found", "No such event.");
    if (!row.drConfig) throw new HttpError("conflict", "This event has no Deal Room.");
    return row;
  }

  return {
    /** DA-3: a staff member's role, or whether they may decide, changed at once; their sign-in follows. */
    async changeStaff(session: Resolved, eventId: string, staffId: string, input: { role: DrStaff["role"]; canDecide: boolean }, ip: string | null): Promise<EventView> {
      deciding(session);
      await realDealRoom(eventId);
      let link: StaffLinkRow | null = null;
      await commands.run({
        eventId,
        actor: { kind: "admin", id: session.user.id },
        userId: session.user.id,
        ip,
        actions: (s) => {
          const st = s.dealRoom.staff.find((x) => x.id === staffId && x.active);
          if (!st) throw new HttpError("not_found", "No such active staff member.");
          if (input.role === "Lead" && s.dealRoom.staff.some((x) => x.active && x.role === "Lead" && x.id !== staffId)) throw new HttpError("conflict", "This Deal Room already has a lead.");
          if (st.role === "Lead" && input.role !== "Lead") throw new HttpError("conflict", "Make someone else the lead first: a Deal Room always has one.");
          const canDecide = decides(input.role, input.canDecide);
          link = { staffId, eventId, email: st.email, name: st.name, role: input.role, canDecide };
          return [{ type: "dr/staffSet", staffId, role: input.role, canDecide, mfa: st.mfa }];
        },
        accounts: () => (link ? [link] : []),
      });
      return organisers.eventViewOf(eventId);
    },

    /** DA-3: a staff member removed: the rules mark them inactive, and their sign-in loses this Deal Room at once. */
    async removeStaff(session: Resolved, eventId: string, staffId: string, ip: string | null): Promise<EventView> {
      deciding(session);
      await realDealRoom(eventId);
      await commands.run({
        eventId,
        actor: { kind: "admin", id: session.user.id },
        userId: session.user.id,
        ip,
        actions: (s) => {
          const st = s.dealRoom.staff.find((x) => x.id === staffId && x.active);
          if (!st) throw new HttpError("not_found", "No such active staff member.");
          if (st.role === "Lead") throw new HttpError("conflict", "Make someone else the lead first: a Deal Room always has one.");
          return [{ type: "dr/staffRevoke", staffId }];
        },
        revoke: [staffId],
      });
      return organisers.eventViewOf(eventId);
    },

    async team(session: Resolved): Promise<AdminMember[]> {
      admin(session);
      if (!(await platform.isSuper(session.user.id))) throw new HttpError("forbidden", "Only a super admin manages Algotech's team.");
      return (await platform.team()).map((m) => ({ ...m, me: m.id === session.user.id }));
    },

    async inviteAdmin(session: Resolved, input: AdminInviteInput, ip: string | null) {
      await superDeciding(session);
      const r = await platform.invite({ email: input.email, name: input.name, superAdmin: !!input.superAdmin }, actor(session, ip));
      if ("refused" in r) throw new HttpError("conflict", `${input.email} already has ${r.refused === "participant" ? "an applicant's" : "an organiser's or Deal Room"} account; an admin needs an email of its own.`);
      return this.team(session);
    },

    async setAdminLevel(session: Resolved, userId: string, superAdmin: boolean, ip: string | null) {
      await superDeciding(session);
      if (userId === session.user.id) throw new HttpError("conflict", "Another super admin changes your own level.");
      const r = await platform.setLevel(userId, superAdmin, actor(session, ip));
      if (r === "not_found") throw new HttpError("not_found", "No such admin.");
      if (r === "last_super") throw new HttpError("conflict", "Algotech must keep at least one super admin.");
      return this.team(session);
    },

    async removeAdmin(session: Resolved, userId: string, ip: string | null) {
      await superDeciding(session);
      if (userId === session.user.id) throw new HttpError("conflict", "Another super admin removes your account.");
      const r = await platform.remove(userId, actor(session, ip));
      if (r === "not_found") throw new HttpError("not_found", "No such admin.");
      if (r === "last_super") throw new HttpError("conflict", "Algotech must keep at least one super admin.");
      return this.team(session);
    },

    async queue(session: Resolved): Promise<AdminQueue> {
      admin(session);
      const [orgs, events] = await Promise.all([
        repo.organisersByStatus(["Not submitted", "Pending", "Returned", "Verified"]),
        // not drafts: those are the organiser's alone until sent (OR-2)
        repo.eventsByState(["Submitted", "Under review", "Changes requested", "Approved", "Live", "Rejected", "Suspended", "Closed"]),
      ]);
      const owners = await Promise.all(orgs.map((o) => repo.ownerOf(o.id)));
      return {
        organisers: orgs.map((row, i) => {
          const o = row.record as unknown as Organiser;
          return { id: o.id, name: o.name, country: o.country ?? "", kycStatus: o.kycStatus, owner: owners[i]?.email ?? "", updated: o.history?.at(-1)?.at ?? "" };
        }),
        events: events.map((e) => eventSummary(e.record as unknown as EventRecord, e.organiser.name)),
      };
    },

    /** PA-1: an organiser opened by Algotech for a client; its owner gets an invitation and does KYC as anyone does. */
    async openOrganiser(session: Resolved, input: OpenOrganiserInput, ip: string | null): Promise<OrganiserView> {
      deciding(session);
      const organiser = newOrganiser({ id: `org_${randomBytes(6).toString("hex")}`, name: input.organisation, country: input.country, now: at() });
      organiser.history = [{ at: at(), what: `Opened by ${by(session)} for ${input.owner.name}` }];
      const r = await repo.openForClient(
        { organiser, owner: input.owner },
        { actorKind: "admin", actorId: session.user.id, action: "organiser/open", detail: { organisation: input.organisation, owner: input.owner.email }, ip },
      );
      if ("refused" in r) throw new HttpError("conflict", `${input.owner.email} is ${r.refused === "participant" ? "used to apply to a Deal Room" : "an Algotech admin's"}; the owner needs a work email of their own.`);
      return organisers.viewOf(r.id, true);
    },

    /** PA-4: an organiser's rate card, set by a super admin; every approval for it starts from these terms. */
    async setRateCard(session: Resolved, organiserId: string, card: RateCardInput, ip: string | null): Promise<OrganiserView> {
      await superDeciding(session);
      const out = await repo.withOrganiser(organiserId, async (o) => ({
        record: must(setRateCard(o, card, by(session), at())),
        audit: { actorKind: "admin", actorId: session.user.id, action: "organiser/rateCard", detail: card, ip },
      }));
      if (!out) throw new HttpError("not_found", "No such organiser.");
      return organisers.viewOf(organiserId, true);
    },

    async decideKyc(session: Resolved, organiserId: string, input: KycDecision, ip: string | null): Promise<OrganiserView> {
      deciding(session);
      const owners = await repo.ownerIds(organiserId);
      const out = await repo.withOrganiser(organiserId, async (o) => ({
        record: must(decideKyc(o, input.verdict, input.note ?? "", by(session), at(), input.items ?? {})),
        audit: { actorKind: "admin", actorId: session.user.id, action: `organiser/kyc${input.verdict}`, detail: { note: input.note }, ip },
        notify: owners.map((to) => ({
          to,
          subject: input.verdict === "Verified" ? "Your KYC is verified: you can send events for approval" : "Algotech returned your KYC: see what to fix",
          link: "/team/organisation",
        })),
      }));
      if (!out) throw new HttpError("not_found", "No such organiser.");
      return organisers.viewOf(organiserId, true);
    },

    /** Approving with the Deal Room add-on creates its Deal Room, on the standard settings, in the same transaction. */
    async decideEvent(session: Resolved, eventId: string, input: EventDecisionInput, ip: string | null): Promise<EventView> {
      deciding(session);
      const out = await repo.withEvent(eventId, async (e, o) => {
        const record = must(decideEvent(e, o, input, by(session), at()));
        const owners = await repo.ownerIds(o.id);
        const said = { Approved: `${record.name} is approved: publish it when you are ready`, "Changes requested": `Algotech asked for changes to ${record.name}`, Rejected: `${record.name} was not approved` } as const;
        const notify = input.to === "Under review" ? [] : owners.map((to) => ({ to, subject: said[input.to], link: `/team/events/${record.id}`, eventId: record.id }));
        const enable = input.to === "Approved" && input.terms.dealRoom.enabled;
        const dealRoom: DrConfigRecord | undefined = enable
          ? { config: starterConfig(record, at().slice(0, 10), at(), "admin"), grants: [], adminLog: [{ at: at(), by: "admin", what: `Deal Room enabled for ${record.name}` }] }
          : undefined;
        return { record, dealRoom, notify, audit: { actorKind: "admin", actorId: session.user.id, action: `event/${input.to.toLowerCase().replace(/ /g, "_")}`, detail: input, ip } };
      });
      if (!out) throw new HttpError("not_found", "No such event.");
      return organisers.eventViewOf(eventId);
    },

    /**
     * A Deal Room staff account (DA-2: Algotech provisions them): the staff record, through the rules, and the
     * sign-in behind it, in one transaction. The person then sets their password with "Set or reset your password".
     */
    async addStaff(session: Resolved, eventId: string, input: DealRoomStaffInput, ip: string | null): Promise<EventView> {
      deciding(session);
      const row = await repo.event(eventId);
      if (!row || row.demo) throw new HttpError("not_found", "No such event.");
      if (!row.drConfig) throw new HttpError("conflict", "This event has no Deal Room: approve it with the add-on first.");
      const email = input.email;
      const id = `st_${randomBytes(5).toString("hex")}`;
      await commands.run({
        eventId,
        actor: { kind: "admin", id: session.user.id },
        userId: session.user.id,
        ip,
        actions: (s, ctx) => {
          if (s.dealRoom.staff.some((x) => x.active && x.email.toLowerCase() === email)) throw new HttpError("conflict", `${email} is already on this Deal Room's team.`);
          if (input.role === "Lead" && s.dealRoom.staff.some((x) => x.active && x.role === "Lead")) throw new HttpError("conflict", "This Deal Room already has a lead.");
          const staff: DrStaff = { id, eventId, name: input.name, email, org: row.organiser.name, role: input.role, canDecide: decides(input.role, !!input.canDecide), mfa: true, active: true, addedAt: ctx.now };
          return [{ type: "dr/staffAdd", staff }];
        },
        accounts: () => [{ staffId: id, eventId, email, name: input.name, role: input.role, canDecide: decides(input.role, !!input.canDecide) }],
        // their invitation: sign in on the site, setting a password first (the link opens the sign-in page)
        notify: () => [{ to: id, subject: `You are on the Deal Room team as ${input.role}: set your password to sign in`, link: "/signin" }],
      });
      return organisers.eventViewOf(eventId);
    },
  };
}
export type PlatformService = ReturnType<typeof createPlatformService>;
