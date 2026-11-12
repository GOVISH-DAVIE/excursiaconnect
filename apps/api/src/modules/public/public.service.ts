/**
 * An event's public pages, on the API: anyone may read a published event (Live, Suspended or Closed) and its Deal
 * Room once the lead has set it up. Drafts and events under review don't exist here. Demo events keep the
 * prototype's pages until their tickets, programme and sponsors move onto the API (Phase 2), so they aren't served.
 */
import type { PublicEvent } from "@excursia/contracts/public";
import { nairobiNow } from "@excursia/domain/ctx";
import { dealRoomGaps } from "@excursia/domain/dealroom/defaults";
import { isChallenge } from "@excursia/domain/dealroom/logic";
import type { DrApplication } from "@excursia/domain/dealroom/types";
import type { EventRecord } from "@excursia/domain/types";
import { HttpError } from "../../http/errors";
import type { DrConfigRecord } from "../dealroom/dealroom.mapper";
import type { PublicRepo } from "./public.repo";

const PUBLISHED = ["Live", "Suspended", "Closed"] as const;

export function createPublicService({ repo, now }: { repo: PublicRepo; now: () => Date }) {
  return {
    async event(slug: string): Promise<PublicEvent> {
      const row = await repo.bySlug(slug);
      const state = row?.state as (typeof PUBLISHED)[number] | undefined;
      if (!row || !state || !PUBLISHED.includes(state)) throw new HttpError("not_found", "No such event.");
      const e = row.record as unknown as EventRecord;
      const today = nairobiNow(now()).slice(0, 10);
      const cfg = (row.drConfig?.record as unknown as DrConfigRecord | undefined)?.config;
      let dealRoom: PublicEvent["dealRoom"] = null;
      if (e.dealRoom?.enabled && cfg && !dealRoomGaps(cfg).length) {
        const challenges = (await repo.providers(e.id))
          .map((r) => r.record as unknown as DrApplication)
          .filter((a) => isChallenge(a) && a.verification?.state === "Verified")
          .map((a) => ({
            id: a.id,
            title: a.challenge!.title,
            owner: a.providerKind === "Corporate buyer" ? "A corporate buyer" : a.org.name,
            route: a.challenge!.route,
            budget: a.challenge!.budget ?? "",
          }));
        dealRoom = {
          open: state === "Live" && today >= cfg.rules.appOpen && today <= cfg.rules.appClose,
          missions: cfg.missions,
          tracks: cfg.tracks,
          eligibility: cfg.rubric.eligibility,
          seekerFee: { amount: cfg.seekerFee.amount, currency: cfg.seekerFee.currency },
          providerKinds: cfg.providerKinds,
          sectors: cfg.sectors,
          countries: cfg.countries,
          rules: {
            appOpen: cfg.rules.appOpen,
            appClose: cfg.rules.appClose,
            meetingMin: cfg.rules.meetingMin,
            bufferMin: cfg.rules.bufferMin,
            seekerCap: cfg.rules.seekerCap,
            profileDays: cfg.rules.profileDays,
            introDays: cfg.rules.introDays,
            conversionEnd: cfg.rules.conversionEnd,
          },
          challenges,
        };
      }
      return {
        id: e.id,
        slug: e.slug,
        kind: e.kind ?? "summit",
        name: e.name,
        tagline: e.tagline,
        venue: e.venue,
        city: e.city,
        startDate: e.startDate,
        endDate: e.endDate,
        state,
        brand: e.brand,
        links: e.links ?? {},
        hashtag: e.hashtag ?? null,
        organiser: { name: row.organiser.name },
        dealRoom,
        today,
      };
    },
  };
}
export type PublicService = ReturnType<typeof createPublicService>;
