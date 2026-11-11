/**
 * Algotech's use cases on organisers and events (backend-plan.md, M2.3; DA-1, DA-2): verifying or returning an
 * organiser's KYC, approving a submitted event with its terms (and the Deal Room add-on), and giving the Deal Room
 * its staff accounts. Algotech admins only, and only with the authenticator confirmed in this session: a skipped
 * authenticator (D14) can read but not decide.
 */
import { randomBytes } from "node:crypto";
import type { AdminQueue, DealRoomStaffInput, EventDecisionInput, EventView, KycDecision, OrganiserView } from "@excursia/contracts/onboarding";
import { decideEvent, decideKyc } from "@excursia/domain/core/onboarding";
import { nairobiNow } from "@excursia/domain/ctx";
import { starterConfig } from "@excursia/domain/dealroom/defaults";
import type { DrStaff } from "@excursia/domain/dealroom/types";
import type { EventRecord, Organiser } from "@excursia/domain/types";
import { HttpError } from "../../http/errors";
import type { Resolved } from "../auth/auth.service";
import type { Commands } from "../dealroom/dealroom.commands";
import type { DrConfigRecord } from "../dealroom/dealroom.mapper";
import type { OrganisersRepo } from "../organisers/organisers.repo";
import { isAdmin, must, type OrganisersService } from "../organisers/organisers.service";
import { eventSummary } from "../organisers/organisers.views";

export type PlatformDeps = { repo: OrganisersRepo; organisers: OrganisersService; commands: Commands; now: () => Date };

export function createPlatformService({ repo, organisers, commands, now }: PlatformDeps) {
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

  return {
    async queue(session: Resolved): Promise<AdminQueue> {
      admin(session);
      const [orgs, events] = await Promise.all([
        repo.organisersByStatus(["Not submitted", "Pending", "Returned", "Verified"]),
        repo.eventsByState(["Draft", "Submitted", "Under review", "Changes requested", "Approved", "Live", "Rejected", "Suspended", "Closed"]),
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

    async decideKyc(session: Resolved, organiserId: string, input: KycDecision, ip: string | null): Promise<OrganiserView> {
      deciding(session);
      const out = await repo.withOrganiser(organiserId, async (o) => ({
        record: must(decideKyc(o, input.verdict, input.note ?? "", by(session), at())),
        audit: { actorKind: "admin", actorId: session.user.id, action: `organiser/kyc${input.verdict}`, detail: { note: input.note }, ip },
      }));
      if (!out) throw new HttpError("not_found", "No such organiser.");
      return organisers.viewOf(organiserId);
    },

    /** Approving with the Deal Room add-on creates its Deal Room, on the standard settings, in the same transaction. */
    async decideEvent(session: Resolved, eventId: string, input: EventDecisionInput, ip: string | null): Promise<EventView> {
      deciding(session);
      const out = await repo.withEvent(eventId, async (e, o) => {
        const record = must(decideEvent(e, o, input, by(session), at()));
        const enable = input.to === "Approved" && input.terms.dealRoom.enabled;
        const dealRoom: DrConfigRecord | undefined = enable
          ? { config: starterConfig(record, at().slice(0, 10), at(), "admin"), grants: [], adminLog: [{ at: at(), by: "admin", what: `Deal Room enabled for ${record.name}` }] }
          : undefined;
        return { record, dealRoom, audit: { actorKind: "admin", actorId: session.user.id, action: `event/${input.to.toLowerCase().replace(/ /g, "_")}`, detail: input, ip } };
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
          const staff: DrStaff = { id, eventId, name: input.name, email, org: row.organiser.name, role: input.role, canDecide: input.role === "Lead" ? true : !!input.canDecide, mfa: true, active: true, addedAt: ctx.now };
          return [{ type: "dr/staffAdd", staff }];
        },
        accounts: () => [{ staffId: id, eventId, email, name: input.name, role: input.role, canDecide: input.role === "Lead" ? true : !!input.canDecide }],
      });
      return organisers.eventViewOf(eventId);
    },
  };
}
export type PlatformService = ReturnType<typeof createPlatformService>;
