/**
 * The participant's badge (backend-plan.md, M2.1). A Deal Room participant signs in with their email, as they did
 * to apply, and sees the badge of each application of theirs that holds one: the QR the desk and the doors scan,
 * where it gets them, and whether the desk has accredited them yet. They correct the name and title printed on it
 * until the organiser locks them for printing, through the rules (dr/badgeDetails), as `{ kind: "applicant" }`.
 */
import type { BadgeDetailsInput, BadgeView, MyBadges } from "@excursia/contracts/badge";
import type { AppState, Delegate, EventRecord } from "@excursia/domain/types";
import { HttpError } from "../../http/errors";
import type { Resolved } from "../auth/auth.service";
import type { Commands } from "../dealroom/dealroom.commands";
import type { BadgesRepo } from "./badges.repo";

export type BadgesDeps = { repo: BadgesRepo; commands: Commands };

function view(row: { appId: string; ref: string | null; delegate: unknown; tier: string }, ev: EventRecord): BadgeView {
  const d = row.delegate as Delegate;
  return {
    appId: row.appId,
    ref: row.ref,
    code: d.badgeCode,
    status: d.cancelled ? "revoked" : "valid",
    name: d.name,
    organisation: d.organisation,
    jobTitle: d.jobTitle,
    category: d.category,
    tier: row.tier,
    accredited: d.accredited,
    locked: !!ev.profileLocked,
    event: { name: ev.name, venue: ev.venue, city: ev.city, startDate: ev.startDate, endDate: ev.endDate, brand: { primary: ev.brand?.primary ?? "#1c1c1e", logoText: ev.brand?.logoText ?? "" } },
  };
}

export function createBadgesService({ repo, commands }: BadgesDeps) {
  /** Participants only, by the verified email their account was made with. */
  function holder(session: Resolved): string {
    if (session.user.kind !== "participant" || !session.user.email) throw new HttpError("forbidden", "Badges are opened from a participant's account. Sign in with the email you applied with.");
    return session.user.email.toLowerCase();
  }

  async function event(slug: string) {
    const e = await repo.eventBySlug(slug);
    if (!e) throw new HttpError("not_found", "This event has no Deal Room.");
    return { id: e.id, record: e.record as unknown as EventRecord };
  }

  async function mine(session: Resolved, slug: string): Promise<MyBadges> {
    const email = holder(session);
    const e = await event(slug);
    // a valid badge first: a revoked one stays listed so its holder knows why it no longer opens doors
    return (await repo.mine(e.id, email)).map((r) => view(r, e.record)).sort((a, b) => (a.status === b.status ? 0 : a.status === "valid" ? -1 : 1));
  }

  return {
    mine,

    /** The name and title printed on the badge, corrected by its holder. */
    async details(session: Resolved, slug: string, appId: string, input: BadgeDetailsInput, ip: string | null): Promise<BadgeView> {
      const email = holder(session);
      const e = await event(slug);
      await commands.run({
        eventId: e.id,
        actor: { kind: "applicant", appId },
        userId: session.user.id,
        ip,
        owned: (s: AppState) => {
          const app = s.dealRoom.apps.find((a) => a.id === appId);
          if (!app || app.contact.email.toLowerCase() !== email) throw new HttpError("not_found", "No such badge.");
        },
        actions: () => [{ type: "dr/badgeDetails", appId, name: input.name, jobTitle: input.jobTitle }],
      });
      const badge = (await mine(session, slug)).find((b) => b.appId === appId);
      if (!badge) throw new HttpError("not_found", "No such badge.");
      return badge;
    },
  };
}
export type BadgesService = ReturnType<typeof createBadgesService>;
