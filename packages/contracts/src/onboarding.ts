/**
 * Organisers and their events, on the API (backend-plan.md, M2.3 brought forward): self sign-up, KYC, Algotech's
 * verification, events from draft to live, and the Deal Room's set-up. The rules are in
 * @excursia/domain/core/onboarding; these are the shapes on the wire.
 */
import { z } from "zod";
import { Email } from "./auth";

const SixDigits = z.string().trim().regex(/^\d{6}$/, "six digits");
const text = (max: number) => z.string().trim().max(max);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");

// ---------------------------------------------------------------------------------------------------------------
// Signing up
// ---------------------------------------------------------------------------------------------------------------

export const SignupCodeRequest = z.object({ email: Email });

export const OrganiserSignup = z.object({
  email: Email,
  code: SixDigits,
  /** the person signing up, who becomes the organiser's owner */
  name: text(120).min(2, "your full name"),
  organisation: text(160).min(2, "the organisation's registered name"),
  country: text(60).min(2, "the country it is registered in"),
  password: z.string().min(12, "at least 12 characters").max(128),
});
export type OrganiserSignup = z.infer<typeof OrganiserSignup>;

// ---------------------------------------------------------------------------------------------------------------
// The organiser and KYC
// ---------------------------------------------------------------------------------------------------------------

export const OrganiserParams = z.object({ organiserId: z.string().regex(/^org_[a-z0-9_]+$/) });
export const KycDocParams = OrganiserParams.extend({ fileId: z.string().regex(/^file_[a-z0-9]{8,40}$/) });

/** Mirrors KYC_DOCS in the domain (contracts don't import it). */
export const KYC_DOC_KINDS = ["Registration certificate", "Tax PIN certificate", "Signatory ID"] as const;

export const KycInput = z
  .object({
    name: text(160).min(2),
    registrationNo: text(60),
    kraPin: text(20),
    address: text(300),
    payoutAccount: text(120),
    signatory: z.object({ name: text(120), title: text(120) }),
  })
  .partial();
export type KycInput = z.infer<typeof KycInput>;

export const DpaSign = z.object({ by: text(120).min(2) });
export const KycDocUpload = z.object({ kind: z.enum(KYC_DOC_KINDS), name: z.string().min(1).max(200), contentType: z.string().max(120), size: z.number().int().min(1) });

const Doc = z.object({ id: z.string(), kind: z.string(), name: z.string(), size: z.number(), at: z.string() });
const History = z.array(z.object({ at: z.string(), what: z.string() }));

export const EventSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  state: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  city: z.string(),
  organiser: z.string(),
  dealRoom: z.object({ requested: z.boolean(), enabled: z.boolean() }),
});
export type EventSummary = z.infer<typeof EventSummary>;

export const OrganiserView = z.object({
  id: z.string(),
  name: z.string(),
  country: z.string(),
  kycStatus: z.enum(["Not submitted", "Pending", "Verified", "Returned"]),
  kycNote: z.string().nullable(),
  registrationNo: z.string(),
  kraPin: z.string(),
  address: z.string(),
  payoutAccount: z.string(),
  signatory: z.object({ name: z.string(), title: z.string() }),
  dpaSigned: z.object({ by: z.string(), at: z.string() }).nullable(),
  docs: z.array(Doc),
  /** what KYC still needs before it can be sent */
  gaps: z.array(z.string()),
  history: History,
  owner: z.object({ name: z.string(), email: z.string() }).nullable(),
  events: z.array(EventSummary),
  can: z.object({ edit: z.boolean(), submit: z.boolean() }),
});
export type OrganiserView = z.infer<typeof OrganiserView>;

// ---------------------------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------------------------

export const EventIdParams = z.object({ eventId: z.string().regex(/^ev_[a-z0-9_]+$/) });

export const EventInput = z
  .object({
    name: text(120).min(3, "the event's name"),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens")
      .min(3)
      .max(60)
      .optional(),
    tagline: text(200).default(""),
    venue: text(160).default(""),
    city: text(80).default(""),
    startDate: day,
    endDate: day,
    expectedAttendance: z.number().int().min(0).max(1_000_000).default(0),
    brand: z.object({ primary: z.string().regex(/^#[0-9a-fA-F]{6}$/, "a colour like #0F4C81"), logoText: text(6) }),
    dealRoomRequest: z.object({ lead: z.object({ name: text(120), email: Email }) }).nullable().default(null),
  })
  .refine((e) => e.endDate >= e.startDate, { path: ["endDate"], message: "is before the start date" });
export type EventInput = z.input<typeof EventInput>;

const Terms = z.object({
  commissionPct: z.number().min(0).max(100),
  oneOffFee: z.number().int().min(0),
  licenceFee: z.number().int().min(0),
  gatewayFeesBorneBy: z.enum(["Algotech", "Organiser"]),
  dealRoom: z.object({ enabled: z.boolean(), addOnPrice: z.number().int().min(0), deskStaff: z.number().int().min(0).max(20) }),
});

export const EventView = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  tagline: z.string(),
  venue: z.string(),
  city: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  expectedAttendance: z.number(),
  brand: z.object({ primary: z.string(), logoText: z.string() }),
  state: z.string(),
  reviewNote: z.string().nullable(),
  dealRoomRequest: z.object({ lead: z.object({ name: z.string(), email: z.string() }) }).nullable(),
  terms: Terms.nullable(),
  history: History,
  organiser: z.object({ id: z.string(), name: z.string(), kycStatus: z.string() }),
  /** what the event still needs before it can be submitted */
  gaps: z.array(z.string()),
  can: z.object({ edit: z.boolean(), submit: z.boolean(), publish: z.boolean() }),
  dealRoom: z
    .object({
      gaps: z.array(z.string()),
      staff: z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), role: z.string(), canDecide: z.boolean(), active: z.boolean(), signedUp: z.boolean() })),
    })
    .nullable(),
});
export type EventView = z.infer<typeof EventView>;

// ---------------------------------------------------------------------------------------------------------------
// Algotech
// ---------------------------------------------------------------------------------------------------------------

export const KycDecision = z.object({ verdict: z.enum(["Verified", "Returned"]), note: text(1000).default("") });
export type KycDecision = z.input<typeof KycDecision>;

export const EventDecisionInput = z.discriminatedUnion("to", [
  z.object({ to: z.literal("Under review") }),
  z.object({ to: z.literal("Approved"), terms: Terms, note: text(1000).optional() }),
  z.object({ to: z.literal("Changes requested"), note: text(1000) }),
  z.object({ to: z.literal("Rejected"), note: text(1000) }),
]);
export type EventDecisionInput = z.infer<typeof EventDecisionInput>;

export const DR_ROLES = ["Lead", "Reviewer", "Operations", "Coordinator", "Oversight"] as const;
export const DealRoomStaffInput = z.object({ name: text(120).min(2), email: Email, role: z.enum(DR_ROLES), canDecide: z.boolean().default(false) });
export type DealRoomStaffInput = z.input<typeof DealRoomStaffInput>;

export const AdminQueue = z.object({
  organisers: z.array(z.object({ id: z.string(), name: z.string(), country: z.string(), kycStatus: z.string(), owner: z.string(), updated: z.string() })),
  events: z.array(EventSummary),
});
export type AdminQueue = z.infer<typeof AdminQueue>;

// ---------------------------------------------------------------------------------------------------------------
// The Deal Room's settings, for its lead
// ---------------------------------------------------------------------------------------------------------------

const Mission = z.object({ id: z.string().regex(/^m[a-z0-9_]{0,20}$/), code: text(10).min(1), name: text(160).min(2), description: text(600).default("") });
const Track = z.object({ id: z.string().regex(/^t[a-z0-9_]{0,20}$/), code: text(10).min(1), name: text(160).min(2), missionId: z.string(), description: text(600).default("") });

export const DealRoomSettings = z.object({
  event: z.object({ id: z.string(), name: z.string(), slug: z.string(), startDate: z.string(), state: z.string() }),
  missions: z.array(Mission),
  tracks: z.array(Track),
  appOpen: z.string(),
  appClose: z.string(),
  rfiDays: z.number(),
  rubric: z.object({
    eligibility: z.array(z.object({ id: z.string(), text: z.string() })),
    assessment: z.array(z.object({ id: z.string(), text: z.string(), weight: z.number() })),
    readiness: z.array(z.object({ id: z.string(), text: z.string() })),
  }),
  gaps: z.array(z.string()),
  canEdit: z.boolean(),
  log: z.array(z.object({ at: z.string(), by: z.string(), what: z.string() })),
});
export type DealRoomSettings = z.infer<typeof DealRoomSettings>;

export const DealRoomSettingsInput = z
  .object({ missions: z.array(Mission).max(10), tracks: z.array(Track).max(30), appOpen: day, appClose: day, rfiDays: z.number().int().min(1).max(30) })
  .refine((s) => s.appClose >= s.appOpen, { path: ["appClose"], message: "is before applications open" })
  .refine((s) => s.tracks.every((t) => s.missions.some((m) => m.id === t.missionId)), { path: ["tracks"], message: "every track belongs to one of the missions" });
export type DealRoomSettingsInput = z.input<typeof DealRoomSettingsInput>;
