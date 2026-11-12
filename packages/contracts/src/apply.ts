/**
 * Applying to the Deal Room (backend-plan.md, M1.1): the public form's settings, an applicant's own applications,
 * the field-by-field draft changes the form autosaves, and document uploads.
 */
import { z } from "zod";

/** The four registration pathways: capital seeker, capital provider, commercial or strategic partner, institutional challenge. */
export const ApplyMode = z.enum(["seeker", "capital", "partner", "challenge"]);
export type ApplyMode = z.infer<typeof ApplyMode>;

export const SlugParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,80}$/, "an event's address") });
export const AppParams = SlugParams.extend({ appId: z.string().regex(/^dr_[a-z0-9_]{2,60}$/, "an application id") });
export const FileParams = AppParams.extend({ fileId: z.string().regex(/^file_[a-z0-9]{8,40}$/, "a file id") });

const text = (max = 300) => z.string().max(max);
const long = z.string().max(4000);
const money = z.number().min(0).max(1e12);
const list = (max = 60) => z.array(z.string().max(120)).max(max);

/** What the form may change, by dotted path; the server applies only the paths an applicant may write. */
export const DraftChanges = z
  .object({
    mission: text(60), track: text(60), source: text(200),
    "contact.name": text(120), "contact.phone": text(40),
    "decisionMaker.name": text(120), "decisionMaker.title": text(120), "decisionMaker.email": text(254), "decisionMaker.phone": text(40),
    "org.name": text(200), "org.regNo": text(80), "org.country": text(80), "org.sector": text(120), "org.founded": text(10), "org.website": text(300),
    ownerKind: text(60),
    "ask.amount": money, "ask.currency": z.enum(["USD", "KES"]), "ask.instrument": text(80), "ask.useOfFunds": long, "ask.stage": text(60),
    "traction.revenueBand": text(80), "traction.customers": long, "traction.metrics": long,
    providerKind: text(60),
    "mandate.sectors": list(), "mandate.countries": list(), "mandate.stages": list(10), "mandate.ticketMin": money, "mandate.ticketMax": money,
    "mandate.currency": z.enum(["USD", "KES"]), "mandate.instruments": list(10), "mandate.exclusions": list(), "mandate.timeline": text(200),
    "challenge.title": text(200), "challenge.problem": long, "challenge.users": long, "challenge.constraints": long, "challenge.outcome": long,
    "challenge.budget": text(200), "challenge.route": text(80), "challenge.timeline": text(200), "challenge.decisionProcess": long,
  })
  .partial()
  .strict();
export type DraftChanges = z.infer<typeof DraftChanges>;

// "provider", from links made before the four pathways, starts a capital provider application
export const StartApplication = z.object({ mode: z.preprocess((v) => (v === "provider" ? "capital" : v), ApplyMode), invite: z.string().max(80).optional() });
export const SaveDraft = z.object({ changes: DraftChanges });
export const SubmitApplication = z.object({ changes: DraftChanges.optional() });

const Named = z.object({ id: z.string(), code: z.string(), name: z.string(), description: z.string().optional() });

/** The public form's settings for one event: no sign-in needed. */
export const ApplyForm = z.object({
  eventId: z.string(),
  eventName: z.string(),
  slug: z.string(),
  /** the organiser's colour and short mark, for the form's header */
  brand: z.object({ primary: z.string(), logoText: z.string() }),
  opens: z.string(),
  closes: z.string(),
  missions: z.array(Named),
  tracks: z.array(Named.extend({ missionId: z.string() })),
  sectors: z.array(z.string()),
  countries: z.array(z.string()),
  providerKinds: z.array(z.string()),
  challengeKinds: z.array(z.string()),
  ownerKinds: z.array(z.string()),
  pathways: z.array(z.string()),
  stages: z.array(z.string()),
  challengeRoutes: z.array(z.string()),
  sources: z.array(z.string()),
  /** each standard field: required or advisory */
  fields: z.record(z.string(), z.enum(["required", "advisory"])),
  seekerDocs: z.array(z.object({ kind: z.string(), required: z.boolean() })),
  upload: z.object({ maxBytes: z.number(), types: z.array(z.string()) }),
});
export type ApplyForm = z.infer<typeof ApplyForm>;

/** A document's virus scan: still checking, clean, failed (deleted at once), or deleted at its retention date. */
export const ScanState = z.enum(["checking", "clean", "failed", "deleted"]);
export type ScanState = z.infer<typeof ScanState>;

const Org = z.object({ name: z.string(), regNo: z.string(), country: z.string(), sector: z.string(), founded: z.string().optional(), website: z.string().optional() });
const Person = z.object({ name: z.string(), title: z.string().optional(), email: z.string(), phone: z.string() });

/** The application as its applicant sees and edits it. */
export const MyApplication = z.object({
  id: z.string(),
  mode: ApplyMode,
  status: z.string(),
  ref: z.string().nullable(),
  submittedAt: z.string().nullable(),
  draftSavedAt: z.string().nullable(),
  /** bumped on every save */
  version: z.number().int(),
  form: z.object({
    mission: z.string(),
    track: z.string().optional(),
    source: z.string(),
    providerKind: z.string().optional(),
    ownerKind: z.string().optional(),
    org: Org,
    contact: Person,
    decisionMaker: Person,
    ask: z.object({ amount: z.number(), currency: z.string(), instrument: z.string(), useOfFunds: z.string(), stage: z.string() }).optional(),
    traction: z.object({ revenueBand: z.string(), customers: z.string(), metrics: z.string() }).optional(),
    mandate: z
      .object({
        sectors: z.array(z.string()), countries: z.array(z.string()), stages: z.array(z.string()), ticketMin: z.number(), ticketMax: z.number(),
        currency: z.string(), instruments: z.array(z.string()), exclusions: z.array(z.string()), timeline: z.string(),
      })
      .optional(),
    challenge: z
      .object({ title: z.string(), problem: z.string(), users: z.string(), constraints: z.string(), outcome: z.string(), budget: z.string(), route: z.string(), timeline: z.string(), decisionProcess: z.string() })
      .optional(),
  }),
  /** each with where its virus scan stands: a failed one doesn't count, and should be uploaded again */
  documents: z.array(z.object({ id: z.string(), kind: z.string(), name: z.string(), size: z.number(), at: z.string(), scan: ScanState })),
  /** information the review team asked for: the open one can be answered from the status page */
  requests: z.array(
    z.object({ id: z.string(), questions: z.array(z.string()), docs: z.array(z.string()), at: z.string(), due: z.string(), answeredAt: z.string().nullable(), open: z.boolean() }),
  ),
  /** what still stands between this draft and submitting, by the rules */
  gaps: z.object({ missing: z.array(z.string()), advisory: z.array(z.string()) }),
});
export type MyApplication = z.infer<typeof MyApplication>;

export const MyApplications = z.array(MyApplication.pick({ id: true, mode: true, status: true, ref: true, submittedAt: true, draftSavedAt: true }).extend({ org: z.string() }));
export type MyApplications = z.infer<typeof MyApplications>;

/** Answering an open information request: the text, and the files uploaded for it. */
export const RespondInput = z.object({ text: z.string().trim().min(1, "write a response").max(4000), fileIds: z.array(z.string().regex(/^file_[a-z0-9]{8,40}$/)).max(10).default([]) });
export type RespondInput = z.infer<typeof RespondInput>;

/** Asking to upload one document. */
export const UploadRequest = z.object({
  kind: z.string().max(60),
  name: z.string().min(1).max(200),
  contentType: z.string().max(120),
  size: z.number().int().min(1),
});
/** Where to send the bytes: PUT them there with these headers, then say so with `complete`. */
export const UploadTarget = z.object({ fileId: z.string(), url: z.string(), method: z.literal("PUT"), headers: z.record(z.string(), z.string()) });
export type UploadTarget = z.infer<typeof UploadTarget>;
