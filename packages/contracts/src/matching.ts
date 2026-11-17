/**
 * Matching and introductions (backend-plan.md, M3.1). The Deal Room team searches the participants open to matching
 * and decides each pair, with what it meets and misses in view; an approved pair gets a brief, and an introduction
 * proposing some of the seeker's documents. Each side accepts or declines. The seeker consents per document and may
 * withdraw; the counterparty opens the profile, and each consented document as a copy stamped with its name, and
 * every opening is logged where the seeker sees it.
 */
import { z } from "zod";

const EventId = z.string().regex(/^ev_[a-z0-9_]+$/, "an event id");
const AppId = z.string().regex(/^dr_[a-z0-9_]{2,60}$/, "an application id");
const MatchId = z.string().regex(/^mx_[a-z0-9_]{2,60}$/, "a match id");
const DocId = z.string().regex(/^[a-z0-9_]{2,60}$/, "a document id");
const Slug = z.string().regex(/^[a-z0-9-]{2,80}$/, "an event's address");

export const MatchingParams = z.object({ eventId: EventId });
export const CandidateParams = MatchingParams.extend({ appId: AppId });
export const MatchParams = MatchingParams.extend({ matchId: MatchId });

export const MatchStage = z.enum(["Suggested", "Deferred", "Rejected", "Approved", "Introduced", "Accepted", "Declined", "Expired"]);
export type MatchStage = z.infer<typeof MatchStage>;

/** One matching field as judged for a pair: what the seeker has against what the counterparty wants. */
export const FitRow = z.object({ field: z.string(), label: z.string(), ok: z.boolean(), mandatory: z.boolean(), has: z.string(), wants: z.string() });
export type FitRow = z.infer<typeof FitRow>;

/** A participant open to matching, as the team's list shows them. */
export const PoolEntry = z.object({
  id: z.string(),
  ref: z.string().nullable(),
  side: z.enum(["seeker", "provider"]),
  org: z.string(),
  label: z.string(),
  summary: z.string(),
  mission: z.string().nullable(),
  approved: z.number().int(),
});
export type PoolEntry = z.infer<typeof PoolEntry>;

export const MatchRow = z.object({
  id: z.string(),
  seeker: z.object({ id: z.string(), org: z.string() }),
  provider: z.object({ id: z.string(), org: z.string(), label: z.string() }),
  origin: z.enum(["search", "interest"]),
  stage: MatchStage,
  decidedAt: z.string(),
  sentAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
export type MatchRow = z.infer<typeof MatchRow>;

/** A counterparty's expression of interest in a teaser, waiting for the team's decision (DR-10). */
export const InterestRow = z.object({
  matchId: z.string(),
  at: z.string(),
  stage: z.enum(["Suggested", "Deferred"]),
  note: z.string(),
  seeker: z.object({ id: z.string(), org: z.string(), label: z.string(), summary: z.string() }),
  provider: z.object({ id: z.string(), org: z.string(), label: z.string(), summary: z.string() }),
  fit: z.array(FitRow),
  exclusionHit: z.string().nullable(),
  needsNote: z.boolean(),
  /** why the business can't be matched now, if it can't: approving would be refused */
  blocked: z.string().nullable(),
});
export type InterestRow = z.infer<typeof InterestRow>;

export const MatchingBoard = z.object({
  event: z.object({ id: z.string(), name: z.string() }),
  now: z.string(),
  ordering: z.enum(["criteria", "readiness"]),
  missions: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
  pool: z.array(PoolEntry),
  matches: z.array(MatchRow),
  interest: z.array(InterestRow),
  can: z.object({ match: z.boolean(), introduce: z.boolean(), lead: z.boolean() }),
});
export type MatchingBoard = z.infer<typeof MatchingBoard>;

export const Candidate = z.object({
  other: z.object({ id: z.string(), ref: z.string().nullable(), org: z.string(), label: z.string(), country: z.string() }),
  seekerId: z.string(),
  providerId: z.string(),
  fit: z.array(FitRow),
  exclusionHit: z.string().nullable(),
  /** a must-have field missed, or an exclusion hit: approving needs a note */
  needsNote: z.boolean(),
  readiness: z.number().nullable(),
  match: z.object({ id: z.string(), stage: MatchStage, note: z.string() }).nullable(),
  /** rejected, declined or expired before: only the lead proposes it again */
  blocked: z.string().nullable(),
});
export type Candidate = z.infer<typeof Candidate>;

export const Candidates = z.object({ who: PoolEntry, candidates: z.array(Candidate) });
export type Candidates = z.infer<typeof Candidates>;

export const DecideMatchInput = z.object({
  seekerId: AppId,
  providerId: AppId,
  decision: z.enum(["Approved", "Rejected", "Deferred"]),
  note: z.string().trim().max(1000).default(""),
  /** the lead's reason to propose again a pair rejected, declined or expired */
  override: z.string().trim().max(1000).optional(),
});
export type DecideMatchInput = z.input<typeof DecideMatchInput>;

export const DecidedMatch = z.object({ id: z.string(), stage: MatchStage });
export type DecidedMatch = z.infer<typeof DecidedMatch>;

export const BriefInput = z.object({ text: z.string().trim().min(1, "write the brief").max(6000), agenda: z.array(z.string().trim().max(200)).max(12) });
export type BriefInput = z.infer<typeof BriefInput>;

export const IntroduceInput = z.object({ items: z.array(DocId).max(20) });
export type IntroduceInput = z.infer<typeof IntroduceInput>;

const Answer = z.object({ response: z.enum(["Accepted", "Declined"]), reason: z.string().nullable(), at: z.string() });

/** A document of the seeker's, in an introduction as the team sees it: consent, and every opening. */
export const IntroItem = z.object({
  id: z.string(),
  label: z.string(),
  consent: z.enum(["with the introduction", "asked at acceptance", "granted", "not granted", "withdrawn"]),
  opened: z.array(z.object({ action: z.enum(["view", "download"]), at: z.string() })),
});

export const Party = z.object({ id: z.string(), ref: z.string().nullable(), label: z.string(), org: z.string(), rows: z.array(z.tuple([z.string(), z.string()])) });

export const MatchView = z.object({
  now: z.string(),
  introDays: z.number().int(),
  match: z.object({
    id: z.string(),
    origin: z.enum(["search", "interest"]),
    decision: z.string(),
    stage: MatchStage,
    note: z.string(),
    by: z.string(),
    at: z.string(),
    override: z.object({ by: z.string(), at: z.string(), reason: z.string() }).nullable(),
    exclusionHit: z.string().nullable(),
    brief: z.object({ text: z.string(), agenda: z.array(z.string()), editedAt: z.string() }).nullable(),
    intro: z
      .object({ sentAt: z.string(), by: z.string(), expiresAt: z.string(), seeker: Answer.nullable(), provider: Answer.nullable(), items: z.array(IntroItem) })
      .nullable(),
  }),
  seeker: Party,
  provider: Party,
  fit: z.array(FitRow),
  /** the seeker's documents, to choose from before the introduction goes */
  documents: z.array(z.object({ id: z.string(), kind: z.string(), name: z.string(), shareable: z.enum(["stamped", "download only"]) })),
  history: z.array(z.object({ at: z.string(), who: z.string(), what: z.string(), kind: z.string() })),
  can: z.object({ decide: z.boolean(), introduce: z.boolean() }),
});
export type MatchView = z.infer<typeof MatchView>;

/* ---------- the participant's introductions ---------- */

export const IntroParams = z.object({ slug: Slug, matchId: MatchId });
export const IntroDocParams = IntroParams.extend({ docId: DocId });

/** A document in an introduction, as a participant sees it. */
export const SharedDoc = z.object({
  id: z.string(),
  kind: z.string(),
  name: z.string(),
  /** PDFs and images are opened as a copy stamped with the viewer's name; other files are downloaded as they are */
  stamped: z.boolean(),
  download: z.boolean(),
  /** the seeker's side: shared with them now */
  shared: z.boolean(),
  /** the counterparty's side: whether it opens, and why not */
  opens: z.object({ ok: z.boolean(), reason: z.string().nullable() }),
  /** the seeker's side: the counterparty's openings, latest first */
  opened: z.array(z.object({ action: z.enum(["view", "download"]), at: z.string() })),
});
export type SharedDoc = z.infer<typeof SharedDoc>;

export const MyIntroduction = z.object({
  matchId: z.string(),
  appId: z.string(),
  side: z.enum(["seeker", "provider"]),
  stage: z.enum(["Introduced", "Accepted", "Declined", "Expired"]),
  sentAt: z.string(),
  expiresAt: z.string(),
  other: z.object({ org: z.string(), label: z.string() }),
  brief: z.object({ text: z.string(), agenda: z.array(z.string()) }),
  mine: Answer.nullable(),
  /** the other side's answer, without its reason */
  theirs: z.object({ response: z.enum(["Accepted", "Declined"]), at: z.string() }).nullable(),
  documents: z.array(SharedDoc),
});
export type MyIntroduction = z.infer<typeof MyIntroduction>;

export const MyIntroductions = z.object({
  event: z.object({ name: z.string(), slug: z.string() }),
  now: z.string(),
  introductions: z.array(MyIntroduction),
  /** for a seeker: who opened their file, latest first */
  access: z.array(z.object({ at: z.string(), who: z.string(), what: z.string(), action: z.enum(["view", "download"]) })),
});
export type MyIntroductions = z.infer<typeof MyIntroductions>;

export const RespondIntroInput = z.object({
  response: z.enum(["Accepted", "Declined"]),
  reason: z.string().trim().max(1000).optional(),
  /** the seeker's documents it shares with this counterparty, of those proposed */
  consent: z.array(DocId).max(20).default([]),
});
export type RespondIntroInput = z.input<typeof RespondIntroInput>;

export const ConsentInput = z.object({ granted: z.boolean() });
export type ConsentInput = z.infer<typeof ConsentInput>;

export const OpenDocInput = z.object({ action: z.enum(["view", "download"]) });
export type OpenDocInput = z.infer<typeof OpenDocInput>;

/** The seeker's full profile, opened by a counterparty: the opening is logged. */
export const SeekerProfile = z.object({
  org: z.string(),
  sector: z.string(),
  country: z.string(),
  website: z.string().nullable(),
  ask: z.string(),
  useOfFunds: z.string(),
  traction: z.string(),
  decisionMaker: z.string(),
  contact: z.string(),
  openedAt: z.string(),
});
export type SeekerProfile = z.infer<typeof SeekerProfile>;

/** A short-lived link to a stamped copy of a document. */
export const SharedLink = z.object({ url: z.string(), expiresAt: z.string() });
export type SharedLink = z.infer<typeof SharedLink>;

/* ---------- the business's teaser, and the directory of teasers (CS-7, FP-5, FP-6) ---------- */

export const ParticipantParams = z.object({ slug: Slug });
export const ProfileDocParams = ParticipantParams.extend({ docId: DocId });
export const TeaserParams = ParticipantParams.extend({ seekerId: AppId });

/** Tier 1 of a business's file: what verified counterparties see in the directory. */
export const TeaserCard = z.object({
  /** the organisation's name, or the anonymous title until an introduction */
  title: z.string(),
  named: z.boolean(),
  sector: z.string(),
  country: z.string(),
  askBand: z.string(),
  pathway: z.string(),
  mission: z.string(),
  summary: z.string(),
});
export type TeaserCard = z.infer<typeof TeaserCard>;

export const TeaserInput = z.object({
  title: z.string().trim().min(1, "give the teaser a title").max(120),
  summary: z.string().trim().min(1, "write the summary").max(1200),
  anonymous: z.boolean(),
});
export type TeaserInput = z.infer<typeof TeaserInput>;

export const DownloadInput = z.object({ download: z.boolean() });
export type DownloadInput = z.infer<typeof DownloadInput>;

/** The business's own page: its teaser, where it stands, and how each document may be shared. */
export const MyProfile = z.object({
  event: z.object({ name: z.string(), slug: z.string() }),
  /** null when the email has no approved business application here; the reason says why */
  app: z
    .object({
      id: z.string(),
      ref: z.string().nullable(),
      org: z.string(),
      teaser: z.object({ title: z.string(), summary: z.string(), anonymous: z.boolean() }).nullable(),
      state: z.enum(["none", "waiting", "approved"]),
      approvedAt: z.string().nullable(),
      /** the teaser shows in the directory only once the business is also Deal Room Ready */
      listed: z.boolean(),
      /** the card as the directory shows it; before a teaser is written, with its title and summary empty */
      preview: TeaserCard,
      deadline: z.string().nullable(),
      completedAt: z.string().nullable(),
      documents: z.array(z.object({ id: z.string(), kind: z.string(), name: z.string(), stamped: z.boolean(), download: z.boolean() })),
    })
    .nullable(),
  reason: z.string().nullable(),
});
export type MyProfile = z.infer<typeof MyProfile>;

/** A teaser in the directory, with where this counterparty stands with it. */
export const DirectoryEntry = TeaserCard.extend({
  seekerId: z.string(),
  /** none: may express interest; sent: waiting for the team; preparing: approved, introduction to come; introduced; closed: not taken forward */
  interest: z.enum(["none", "sent", "preparing", "introduced", "closed"]),
});
export type DirectoryEntry = z.infer<typeof DirectoryEntry>;

export const Directory = z.object({
  event: z.object({ name: z.string(), slug: z.string() }),
  /** null when the directory isn't open to this account; the reason says why */
  me: z.object({ org: z.string() }).nullable(),
  reason: z.string().nullable(),
  teasers: z.array(DirectoryEntry),
  filters: z.object({ sectors: z.array(z.string()), countries: z.array(z.string()), bands: z.array(z.string()), pathways: z.array(z.string()) }),
});
export type Directory = z.infer<typeof Directory>;
