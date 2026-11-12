/**
 * What the organiser's and Algotech's screens see of an organiser and an event, built from the rules' records.
 * Shared by the owner's service and Algotech's (platform module), so both read the same thing.
 */
import type { EventSummary, EventView, OrganiserView } from "@excursia/contracts/onboarding";
import { KYC_ITEMS, eventEditable, eventGaps, kycEditable, kycGaps, rateCardOf, termsFrom } from "@excursia/domain/core/onboarding";
import { dealRoomGaps } from "@excursia/domain/dealroom/defaults";
import type { DrStaff } from "@excursia/domain/dealroom/types";
import type { EventRecord, Organiser } from "@excursia/domain/types";
import type { DrConfigRecord } from "../dealroom/dealroom.mapper";

export function eventSummary(e: EventRecord, organiser: string): EventSummary {
  return {
    id: e.id,
    slug: e.slug,
    kind: e.kind ?? "summit",
    name: e.name,
    state: e.state,
    startDate: e.startDate,
    endDate: e.endDate,
    city: e.city,
    organiser,
    dealRoom: { requested: !!e.dealRoomRequest, enabled: !!e.dealRoom?.enabled },
  };
}

export function organiserView(o: Organiser, events: EventRecord[], owner: { name: string; email: string } | null): OrganiserView {
  const gaps = kycGaps(o);
  return {
    id: o.id,
    name: o.name,
    country: o.country ?? "",
    kycStatus: o.kycStatus,
    kycNote: o.kycNote ?? null,
    kycItems: KYC_ITEMS.map((i) => {
      const r = o.kycReturns?.[i.key];
      return { key: i.key, label: i.label, returned: r?.note ?? null, fixed: !!r && i.value(o) !== r.was, lastReturned: o.kycLastReturns?.[i.key] ?? null };
    }),
    registrationNo: o.registrationNo,
    kraPin: o.kraPin,
    address: o.address ?? "",
    payoutAccount: o.payoutAccount,
    signatory: o.signatory ?? { name: "", title: "" },
    dpaSigned: o.dpaSigned ?? null,
    docs: o.kycDocs ?? [],
    gaps,
    history: o.history ?? [],
    owner,
    rateCard: { ...rateCardOf(o), custom: !!o.rateCard },
    events: events.map((e) => eventSummary(e, o.name)),
    can: { edit: kycEditable(o), submit: kycEditable(o) && gaps.length === 0 },
  };
}

type StaffRow = { record: unknown; signedUp: boolean };

export function eventView(e: EventRecord, o: Organiser, today: string, dr: { config: DrConfigRecord | null; staff: StaffRow[] }): EventView {
  const gaps = eventGaps(e, today);
  const editable = eventEditable(e);
  return {
    id: e.id,
    slug: e.slug,
    kind: e.kind ?? "summit",
    timezone: e.timezone ?? "Africa/Nairobi",
    currency: e.currency ?? "KES",
    name: e.name,
    tagline: e.tagline,
    venue: e.venue,
    city: e.city,
    startDate: e.startDate,
    endDate: e.endDate,
    expectedAttendance: e.expectedAttendance,
    brand: e.brand,
    state: e.state,
    reviewNote: e.reviewNote ?? null,
    dealRoomRequest: e.dealRoomRequest ?? null,
    terms:
      e.state === "Approved" || e.state === "Live" || e.state === "Closed" || e.state === "Suspended"
        ? {
            commissionPct: e.commissionPct,
            oneOffFee: e.oneOffFee,
            licenceFee: e.licenceFee,
            gatewayFeesBorneBy: e.gatewayFeesBorneBy,
            staffCount: e.staffCount,
            stations: e.stations,
            dealRoom: e.dealRoom ?? { enabled: false, addOnPrice: 0, deskStaff: 0 },
          }
        : null,
    startTerms: termsFrom(rateCardOf(o), e),
    history: e.history ?? [],
    organiser: { id: o.id, name: o.name, kycStatus: o.kycStatus },
    gaps,
    can: { edit: editable, submit: editable && gaps.length === 0 && o.kycStatus === "Verified", publish: e.state === "Approved" },
    dealRoom: dr.config
      ? {
          gaps: dealRoomGaps(dr.config.config),
          staff: dr.staff.map(({ record, signedUp }) => {
            const s = record as DrStaff;
            return { id: s.id, name: s.name, email: s.email, role: s.role, canDecide: s.canDecide, active: s.active, signedUp };
          }),
        }
      : null,
  };
}
