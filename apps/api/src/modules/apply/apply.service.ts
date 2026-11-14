/**
 * Applying to the Deal Room (backend-plan.md, M1.1). The applicant is a participant account signed in with an
 * emailed code; an application belongs to the email that started it, and that never changes, so signing in with
 * the same email on another device resumes the draft (the "resume link" is the sign-in itself).
 *
 * Every change runs through runCommand as `{ kind: "applicant", appId }`, with the prototype's own rules:
 * dr/saveDraft with a draft the server builds from the stored one plus only the fields an applicant may write
 * (patchDraft), dr/submit for the reference and the confirmation message, dr/addDoc once an upload has arrived.
 * The autosave, most of all writes, and attaching an upload run on their one application (`only`), so they don't
 * wait for the whole Deal Room; submitting takes it all, for the event's reference counter and the message.
 */
import { randomBytes } from "node:crypto";
import { KYC_DOC, KYC_ITEMS, type ApplyForm, type ApplyMode, type DraftChanges, type KycInput, type MyApplication, type MyApplications, type RespondInput, type ScanState, type SignNdaInput, type UploadTarget } from "@excursia/contracts/apply";
import type { Action } from "@excursia/domain/core/reducer";
import { blankApplication, modeOf, patchDraft, retentionDate } from "@excursia/domain/dealroom/apply";
import { CHALLENGE_KINDS, CHALLENGE_ROUTES, OWNER_KINDS, PATHWAYS, SEEKER_DOCS, decisionOf, formGaps, openRfi, rfiDue } from "@excursia/domain/dealroom/logic";
import type { DrApplication, DrConfig } from "@excursia/domain/dealroom/types";
import type { AppState } from "@excursia/domain/types";
import { dealRoomGaps } from "@excursia/domain/dealroom/defaults";
import { leadOf } from "@excursia/domain/dealroom/util";
import type { EventRecord } from "@excursia/domain/types";
import { HttpError } from "../../http/errors";
import { UPLOAD_TYPES, cleanFileName, type Storage } from "../../storage/storage";
import type { Resolved } from "../auth/auth.service";
import type { Commands } from "../dealroom/dealroom.commands";
import type { DrConfigRecord } from "../dealroom/dealroom.mapper";
import type { ApplyRepo } from "./apply.repo";

const STAGES = ["Bankable project", "Early revenue", "Growth", "Expansion"];
const OPEN = ["Lead", "Invited", "Draft"];
/** No one email starts more than this many applications to one Deal Room. */
const MAX_PER_EMAIL = 5;
/** Uploads started for one application in an hour. */
const MAX_UPLOADS_PER_HOUR = 30;

export type ApplyDeps = { repo: ApplyRepo; commands: Commands; storage: Storage; uploadMaxBytes: number };

type Scans = Map<string, ScanState>;
/** Documents that failed the virus scan, or were deleted, no longer count: the applicant uploads them again. */
const gone = (s: ScanState | undefined) => s === "failed" || s === "deleted";
const withoutGone = (app: DrApplication, scans: Scans): DrApplication =>
  app.documents.some((d) => gone(scans.get(d.id))) ? { ...app, documents: app.documents.filter((d) => !gone(scans.get(d.id))) } : app;

/** The application as its applicant sees it. */
function view(app: DrApplication, cfg: DrConfig, version: number, scans: Scans): MyApplication {
  const dm = app.decisionMaker;
  const decisionMaker = { name: dm.name, title: dm.title, email: dm.email, phone: dm.phone };
  return {
    id: app.id,
    mode: modeOf(app),
    status: app.status,
    ref: app.ref ?? null,
    submittedAt: app.submittedAt ?? null,
    draftSavedAt: app.draftSavedAt ?? null,
    version,
    form: {
      mission: app.mission,
      track: app.track,
      source: app.source,
      providerKind: app.providerKind,
      ownerKind: app.ownerKind,
      org: app.org,
      contact: app.contact,
      decisionMaker,
      ask: app.ask,
      traction: app.traction,
      mandate: app.mandate,
      challenge: app.challenge,
    },
    // a document with no file row is the demo's, which never went through a scan
    documents: app.documents.map((d) => ({ id: d.id, kind: d.kind, name: d.name, size: d.size, at: d.at, scan: scans.get(d.id) ?? "clean" })),
    // a request is answerable only while the review waits on it: a decision made meanwhile closes it for the applicant
    requests: app.rfis.map((r) => ({ id: r.id, questions: r.questions, docs: r.docs, at: r.at, due: rfiDue(r, cfg), answeredAt: r.response?.at ?? null, open: !r.response && !r.expiry && app.status === "Information requested" })),
    gaps: formGaps(withoutGone(app, scans), cfg),
    decision: decisionOfApplicant(app),
    readiness: app.readiness,
    fee: app.fee ? { amount: app.fee.amount, currency: app.fee.currency, paid: !!app.fee.paid, waived: !!app.fee.waived } : null,
    verification: app.type === "provider" && app.ref ? verificationOf(app, scans) : null,
  };
}

/** A seeker's decision in force, as its applicant is told it: one waiting for a second decider isn't one yet. */
function decisionOfApplicant(app: DrApplication): MyApplication["decision"] {
  const d = app.type === "seeker" ? decisionOf(app) : undefined;
  return d ? { decision: d.decision, reason: d.reason, at: d.second?.at ?? d.at, conditions: d.conditions.map((c) => ({ id: c.id, text: c.text, due: c.due, met: !!c.met })) } : null;
}

/** What a provider uploads and signs to be verified, and where each stands; the screening is the team's own. */
function verificationOf(app: DrApplication, scans: Scans): NonNullable<MyApplication["verification"]> {
  const v = app.verification;
  return {
    state: v?.state ?? "Verification pending",
    kyc: KYC_ITEMS.map((item) => {
      const it = v?.kyc[item];
      const doc = it && app.documents.find((d) => d.id === it.docId);
      return { item, doc: doc ? { id: doc.id, name: doc.name, at: doc.at, scan: scans.get(doc.id) ?? "clean" } : null, checked: !!it?.checked };
    }),
    nda: v?.nda ? { version: v.nda.version, name: v.nda.name, title: v.nda.title, at: v.nda.at } : null,
    decided: !!v?.decided,
  };
}

/** A submitted provider, not yet verified or declined: the one who uploads KYC documents and signs the NDA. */
function verifying(app: DrApplication) {
  if (app.type !== "provider") throw new HttpError("bad_request", "Verification is for capital providers, partners and challenge owners.");
  if (OPEN.includes(app.status)) throw new HttpError("conflict", "Submit the application first; verification follows.");
  if (app.verification?.decided) throw new HttpError("conflict", `This organisation is already ${app.verification.state.toLowerCase()}.`);
}
const KYC_KINDS = Object.values(KYC_DOC) as string[];

/** A file name as it may be stored and shown: no folders, no control characters, not too long. */
const cleanName = cleanFileName;

export function createApplyService({ repo, commands, storage, uploadMaxBytes }: ApplyDeps) {
  async function event(slug: string) {
    const e = await repo.eventBySlug(slug);
    if (!e) throw new HttpError("not_found", "This event doesn't take Deal Room applications.");
    const cfg = (e.config as unknown as DrConfigRecord).config;
    // a Deal Room takes applications once its event is live and its lead has set it up (missions, dates, rubric)
    if ((e.event as unknown as EventRecord).state !== "Live" || dealRoomGaps(cfg).length)
      throw new HttpError("not_found", "This event's Deal Room isn't taking applications yet.");
    return { ...e, cfg };
  }

  /** Applicants only, and only with the verified email their account was made with. */
  function applicant(session: Resolved): string {
    if (session.user.kind !== "participant" || !session.user.email)
      throw new HttpError("forbidden", "Applications are made from an applicant's account. Sign in with your email to apply.");
    return session.user.email.toLowerCase();
  }

  /** Ownership inside the lock: this application, in this event, started by this email. */
  const owns = (appId: string, email: string) => (state: AppState) => {
    const app = state.dealRoom.apps.find((a) => a.id === appId);
    if (!app || app.contact.email.toLowerCase() !== email) throw new HttpError("not_found", "No such application.");
  };
  const appIn = (state: AppState, appId: string) => state.dealRoom.apps.find((a) => a.id === appId)!;

  /** The application as it now is, after a command. */
  async function after(state: AppState, appId: string, cfg: DrConfig) {
    return view(appIn(state, appId), cfg, await repo.versionOf(appId), await repo.fileStates([appId]));
  }

  /** Reads go to the summary row, not the whole aggregate: only the owner's own record. */
  async function ownRow(eventId: string, appId: string, email: string) {
    const row = (await repo.mine(eventId, email)).find((r) => r.id === appId);
    if (!row) throw new HttpError("not_found", "No such application.");
    return { app: row.record as unknown as DrApplication, version: row.version };
  }

  return {
    async form(slug: string, maxBytes = uploadMaxBytes): Promise<ApplyForm> {
      const e = await event(slug);
      const c = e.cfg;
      return {
        eventId: e.id,
        eventName: e.name,
        slug: e.slug,
        brand: (e.event as { brand?: { primary: string; logoText: string } }).brand ?? { primary: "#1c1c1e", logoText: "" },
        opens: c.rules.appOpen,
        closes: c.rules.appClose,
        missions: c.missions,
        tracks: c.tracks,
        sectors: c.sectors,
        countries: c.countries,
        providerKinds: c.providerKinds,
        challengeKinds: CHALLENGE_KINDS,
        ownerKinds: OWNER_KINDS,
        pathways: PATHWAYS,
        stages: STAGES,
        challengeRoutes: CHALLENGE_ROUTES,
        sources: c.sources,
        fields: c.fields,
        seekerDocs: SEEKER_DOCS.map((d) => ({ kind: d.kind, required: c.fields[d.key] === "required" })),
        upload: { maxBytes, types: Object.keys(UPLOAD_TYPES) },
      };
    },

    async mine(session: Resolved, slug: string): Promise<MyApplications> {
      const email = applicant(session);
      const e = await event(slug);
      const rows = await repo.mine(e.id, email);
      const scans = await repo.fileStates(rows.map((r) => r.id));
      return rows.map((r) => {
        const v = view(r.record as unknown as DrApplication, e.cfg, r.version, scans);
        return { id: v.id, mode: v.mode, status: v.status, ref: v.ref, submittedAt: v.submittedAt, draftSavedAt: v.draftSavedAt, org: v.form.org.name };
      });
    },

    async get(session: Resolved, slug: string, appId: string): Promise<MyApplication> {
      const email = applicant(session);
      const e = await event(slug);
      const { app, version } = await ownRow(e.id, appId, email);
      return view(app, e.cfg, version, await repo.fileStates([appId]));
    },

    /** A new draft of one kind; or, with an invitation sent to this email, the invited application. */
    async start(session: Resolved, slug: string, input: { mode: ApplyMode; invite?: string }, ip: string | null): Promise<MyApplication> {
      const email = applicant(session);
      const e = await event(slug);
      let appId = commands.newId(input.mode === "seeker" ? "dr_cs" : "dr_fp");
      const state = await commands.run({
        eventId: e.id,
        actor: { kind: "applicant", appId },
        userId: session.user.id,
        ip,
        actions: (s, ctx): Action[] => {
          if (input.invite) {
            const invited = s.dealRoom.apps.find((a) => a.invite?.token === input.invite && OPEN.includes(a.status));
            if (!invited) throw new HttpError("not_found", "This invitation has already been used or doesn't exist.");
            if (invited.contact.email.toLowerCase() !== email)
              throw new HttpError("forbidden", "This invitation was sent to another email address. Sign in with that address to accept it.");
            appId = invited.id;
            return invited.status === "Draft" ? [] : [{ type: "dr/saveDraft", app: invited }];
          }
          const already = s.dealRoom.apps.filter((a) => a.contact.email.toLowerCase() === email).length;
          if (already >= MAX_PER_EMAIL) throw new HttpError("conflict", `You already have ${already} applications here. Continue one of those instead.`);
          // the application's owner on the team is this event's lead (the demo's is st_lead)
          return [{ type: "dr/saveDraft", app: { ...blankApplication({ id: appId, eventId: e.id, mode: input.mode, email, now: ctx.now }), owner: leadOf(s.dealRoom, e.id) } }];
        },
      });
      return after(state, appId, e.cfg);
    },

    /** Autosave: the changed fields only, merged into the draft on record. */
    async save(session: Resolved, slug: string, appId: string, changes: DraftChanges, ip: string | null): Promise<MyApplication> {
      const email = applicant(session);
      const e = await event(slug);
      const scans = await repo.fileStates([appId]);
      const state = await commands.run({
        eventId: e.id,
        actor: { kind: "applicant", appId },
        userId: session.user.id,
        ip,
        owned: owns(appId, email),
        only: appId,
        actions: (s) => [{ type: "dr/saveDraft", app: patched(withoutGone(appIn(s, appId), scans), changes) }],
      });
      return after(state, appId, e.cfg);
    },

    /** One command: the last changes and the submission together, or neither. */
    async submit(session: Resolved, slug: string, appId: string, changes: DraftChanges | undefined, ip: string | null): Promise<MyApplication> {
      const email = applicant(session);
      const e = await event(slug);
      const scans = await repo.fileStates([appId]);
      const state = await commands.run({
        eventId: e.id,
        actor: { kind: "applicant", appId },
        userId: session.user.id,
        ip,
        owned: owns(appId, email),
        actions: (s) => {
          // a document that failed its scan goes before the rules count what is there
          const stored = appIn(s, appId);
          const kept = withoutGone(stored, scans);
          const draft = changes && Object.keys(changes).length ? patched(kept, changes) : kept;
          return [...(draft !== stored ? [{ type: "dr/saveDraft" as const, app: draft }] : []), { type: "dr/submit" as const, appId }];
        },
      });
      return after(state, appId, e.cfg);
    },

    /** Where to upload one document; nothing is attached until `completeUpload` finds it arrived. */
    async startUpload(session: Resolved, slug: string, appId: string, req: { kind: string; name: string; contentType: string; size: number }): Promise<UploadTarget> {
      const email = applicant(session);
      const e = await event(slug);
      const { app } = await ownRow(e.id, appId, email);
      // while a request is open, the documents it asks for; before submitting, the seeker's own; once a provider has
      // submitted, its KYC documents (attached with `kyc`)
      const rfi = app.status === "Information requested" ? openRfi(app) : undefined;
      const kyc = app.type === "provider" && !OPEN.includes(app.status) && KYC_KINDS.includes(req.kind) && !(rfi?.docs as string[] | undefined)?.includes(req.kind);
      if (kyc) verifying(app);
      else if (rfi) {
        if (!(rfi.docs as string[]).includes(req.kind)) throw new HttpError("bad_request", "The review team didn't ask for that document.", ["kind"]);
      } else {
        if (!OPEN.includes(app.status)) throw new HttpError("conflict", "Documents can be added only before the application is submitted, or when the review team asks for them.");
        if (app.type !== "seeker" || !SEEKER_DOCS.some((d) => d.kind === req.kind))
          throw new HttpError("bad_request", "That isn't a document this application asks for.", ["kind"]);
      }
      if (!UPLOAD_TYPES[req.contentType]) throw new HttpError("bad_request", "Upload a PDF, a Word, Excel or PowerPoint file, or a PNG or JPEG image.", ["contentType"]);
      if (req.size > uploadMaxBytes) throw new HttpError("payload_too_large", `Files can be up to ${Math.round(uploadMaxBytes / 1_048_576)} MB.`);
      if ((await repo.pendingFiles(appId, new Date(Date.now() - 3_600_000))) >= MAX_UPLOADS_PER_HOUR)
        throw new HttpError("rate_limited", "Too many uploads for this application in the last hour. Try again later.");

      const fileId = `file_${randomBytes(10).toString("hex")}`;
      const storageKey = `dr/${e.id}/${appId}/${fileId}`;
      // kept until the Deal Room's retention date: 12 months after the conversion end, by default
      const retentionUntil = new Date(`${retentionDate(e.cfg.rules)}T23:59:59+03:00`);
      await repo.addFile({ id: fileId, eventId: e.id, appId, kind: req.kind, storageKey, name: cleanName(req.name), contentType: req.contentType, size: req.size, retentionUntil });
      return { fileId, ...storage.uploadTarget(storageKey, { contentType: req.contentType, size: req.size }) };
    },

    /** The upload arrived: attach it to the application, through the rules. Safe to call twice. */
    async completeUpload(session: Resolved, slug: string, appId: string, fileId: string, ip: string | null): Promise<MyApplication> {
      const email = applicant(session);
      const e = await event(slug);
      const file = await repo.fileOf(fileId, appId);
      if (!file) throw new HttpError("not_found", "No such upload.");
      if (file.state === "rejected") throw new HttpError("conflict", `${file.name} failed the virus check. Upload a clean copy.`);
      const arrived = await storage.stat(file.storageKey);
      if (!arrived || arrived.size !== file.size) throw new HttpError("conflict", "The file hasn't arrived yet. Try uploading it again.");
      const state = await commands.run({
        eventId: e.id,
        actor: { kind: "applicant", appId },
        userId: session.user.id,
        ip,
        owned: owns(appId, email),
        only: appId,
        actions: (s, ctx): Action[] => {
          const app = appIn(s, appId);
          if (app.documents.some((d) => d.id === fileId)) return [];
          // a file for an open request waits, and goes with the answer (respond), not on its own
          if (app.status === "Information requested") return [];
          if (!OPEN.includes(app.status)) throw new HttpError("conflict", "Documents can be added only before the application is submitted.");
          return [{ type: "dr/addDoc", appId, doc: { id: fileId, name: file.name, kind: file.kind as DrApplication["documents"][number]["kind"], size: file.size, at: ctx.now, download: true } }];
        },
      });
      return after(state, appId, e.cfg);
    },

    /** A KYC document that has arrived goes onto the application as that item; one already checked stays. */
    async kyc(session: Resolved, slug: string, appId: string, input: KycInput, ip: string | null): Promise<MyApplication> {
      const email = applicant(session);
      const e = await event(slug);
      const file = await repo.fileOf(input.fileId, appId);
      if (!file) throw new HttpError("not_found", "No such upload.");
      if (file.kind !== KYC_DOC[input.item]) throw new HttpError("bad_request", `That upload isn't a ${KYC_DOC[input.item].toLowerCase()}.`, ["fileId"]);
      if (file.state === "rejected") throw new HttpError("conflict", `${file.name} failed the virus check. Upload a clean copy.`);
      const arrived = await storage.stat(file.storageKey);
      if (!arrived || arrived.size !== file.size) throw new HttpError("conflict", "The file hasn't arrived yet. Try uploading it again.");
      const state = await commands.run({
        eventId: e.id,
        actor: { kind: "applicant", appId },
        userId: session.user.id,
        ip,
        owned: owns(appId, email),
        only: appId,
        actions: (s, ctx): Action[] => {
          const app = appIn(s, appId);
          verifying(app);
          const now = app.verification?.kyc[input.item];
          if (now?.docId === file.id) return [];
          if (now?.checked) throw new HttpError("conflict", `The ${input.item.toLowerCase()} document is already checked.`);
          return [{ type: "dr/kyc", appId, item: input.item, doc: { id: file.id, name: file.name, kind: file.kind as DrApplication["documents"][number]["kind"], size: file.size, at: ctx.now, download: true } }];
        },
      });
      return after(state, appId, e.cfg);
    },

    /** The Deal Room's NDA, signed online by a person for the organisation; once is enough. */
    async signNda(session: Resolved, slug: string, appId: string, input: SignNdaInput, ip: string | null): Promise<MyApplication> {
      const email = applicant(session);
      const e = await event(slug);
      const state = await commands.run({
        eventId: e.id,
        actor: { kind: "applicant", appId },
        userId: session.user.id,
        ip,
        owned: owns(appId, email),
        only: appId,
        actions: (s): Action[] => {
          const app = appIn(s, appId);
          verifying(app);
          if (app.verification?.nda) throw new HttpError("conflict", "The NDA is already signed.");
          return [{ type: "dr/signNda", appId, name: input.name, title: input.title }];
        },
      });
      return after(state, appId, e.cfg);
    },

    /** Answers the open information request: the text, and the files uploaded for it, in one command. */
    async respond(session: Resolved, slug: string, appId: string, input: RespondInput, ip: string | null): Promise<MyApplication> {
      const email = applicant(session);
      const e = await event(slug);
      const files = await Promise.all(
        [...new Set(input.fileIds)].map(async (id) => {
          const f = await repo.fileOf(id, appId);
          const arrived = f && (await storage.stat(f.storageKey));
          if (f?.state === "rejected") throw new HttpError("conflict", `${f.name} failed the virus check. Upload a clean copy.`);
          if (!f || !arrived || arrived.size !== f.size) throw new HttpError("conflict", "A file for this answer hasn't arrived. Upload it again.");
          return f;
        }),
      );
      const state = await commands.run({
        eventId: e.id,
        actor: { kind: "applicant", appId },
        userId: session.user.id,
        ip,
        owned: owns(appId, email),
        actions: (s, ctx): Action[] => {
          const have = new Set(appIn(s, appId).documents.map((d) => d.id));
          const docs = files
            .filter((f) => !have.has(f.id))
            .map((f) => ({ id: f.id, name: f.name, kind: f.kind as DrApplication["documents"][number]["kind"], size: f.size, at: ctx.now, download: true }));
          return [{ type: "dr/respondRfi", appId, text: input.text, docs }];
        },
      });
      return after(state, appId, e.cfg);
    },
  };

  /** The stored draft with only the writable changes; any other path is refused, by name. */
  function patched(app: DrApplication, changes: DraftChanges): DrApplication {
    const { app: next, refused } = patchDraft(app, changes);
    if (refused.length) throw new HttpError("bad_request", "Some of these fields can't be changed on this application.", refused);
    return next;
  }
}
export type ApplyService = ReturnType<typeof createApplyService>;
