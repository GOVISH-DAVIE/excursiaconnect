/**
 * Applying to the Deal Room (backend-plan.md, M1.1). The applicant is a participant account signed in with an
 * emailed code; an application belongs to the email that started it, and that never changes, so signing in with
 * the same email on another device resumes the draft (the "resume link" is the sign-in itself).
 *
 * Every change runs through runCommand as `{ kind: "applicant", appId }`, with the prototype's own rules:
 * dr/saveDraft with a draft the server builds from the stored one plus only the fields an applicant may write
 * (patchDraft), dr/submit for the reference and the confirmation message, dr/addDoc once an upload has arrived.
 */
import { randomBytes } from "node:crypto";
import type { ApplyForm, ApplyMode, DraftChanges, MyApplication, MyApplications, UploadTarget } from "@excursia/contracts/apply";
import type { Action } from "@excursia/domain/core/reducer";
import { blankApplication, modeOf, patchDraft } from "@excursia/domain/dealroom/apply";
import { CHALLENGE_KINDS, CHALLENGE_ROUTES, OWNER_KINDS, PATHWAYS, SEEKER_DOCS, formGaps } from "@excursia/domain/dealroom/logic";
import type { DrApplication, DrConfig } from "@excursia/domain/dealroom/types";
import type { AppState } from "@excursia/domain/types";
import { HttpError } from "../../http/errors";
import { UPLOAD_TYPES, type Storage } from "../../storage/storage";
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

/** The application as its applicant sees it. */
function view(app: DrApplication, cfg: DrConfig, version: number): MyApplication {
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
    documents: app.documents.map((d) => ({ id: d.id, kind: d.kind, name: d.name, size: d.size, at: d.at })),
    gaps: formGaps(app, cfg),
  };
}

/** A file name as it may be stored and shown: no folders, no control characters, not too long. */
const cleanName = (name: string) =>
  (name.split(/[\\/]/).pop() ?? "file")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 200) || "file";

export function createApplyService({ repo, commands, storage, uploadMaxBytes }: ApplyDeps) {
  async function event(slug: string) {
    const e = await repo.eventBySlug(slug);
    if (!e) throw new HttpError("not_found", "This event doesn't take Deal Room applications.");
    return { ...e, cfg: (e.config as unknown as DrConfigRecord).config };
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
    return view(appIn(state, appId), cfg, await repo.versionOf(appId));
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
      return (await repo.mine(e.id, email)).map((r) => {
        const v = view(r.record as unknown as DrApplication, e.cfg, r.version);
        return { id: v.id, mode: v.mode, status: v.status, ref: v.ref, submittedAt: v.submittedAt, draftSavedAt: v.draftSavedAt, org: v.form.org.name };
      });
    },

    async get(session: Resolved, slug: string, appId: string): Promise<MyApplication> {
      const email = applicant(session);
      const e = await event(slug);
      const { app, version } = await ownRow(e.id, appId, email);
      return view(app, e.cfg, version);
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
          return [{ type: "dr/saveDraft", app: blankApplication({ id: appId, eventId: e.id, mode: input.mode, email, now: ctx.now }) }];
        },
      });
      return after(state, appId, e.cfg);
    },

    /** Autosave: the changed fields only, merged into the draft on record. */
    async save(session: Resolved, slug: string, appId: string, changes: DraftChanges, ip: string | null): Promise<MyApplication> {
      const email = applicant(session);
      const e = await event(slug);
      const state = await commands.run({
        eventId: e.id,
        actor: { kind: "applicant", appId },
        userId: session.user.id,
        ip,
        owned: owns(appId, email),
        actions: (s) => [{ type: "dr/saveDraft", app: patched(appIn(s, appId), changes) }],
      });
      return after(state, appId, e.cfg);
    },

    /** One command: the last changes and the submission together, or neither. */
    async submit(session: Resolved, slug: string, appId: string, changes: DraftChanges | undefined, ip: string | null): Promise<MyApplication> {
      const email = applicant(session);
      const e = await event(slug);
      const state = await commands.run({
        eventId: e.id,
        actor: { kind: "applicant", appId },
        userId: session.user.id,
        ip,
        owned: owns(appId, email),
        actions: (s) => [
          ...(changes && Object.keys(changes).length ? [{ type: "dr/saveDraft" as const, app: patched(appIn(s, appId), changes) }] : []),
          { type: "dr/submit", appId },
        ],
      });
      return after(state, appId, e.cfg);
    },

    /** Where to upload one document; nothing is attached until `completeUpload` finds it arrived. */
    async startUpload(session: Resolved, slug: string, appId: string, req: { kind: string; name: string; contentType: string; size: number }): Promise<UploadTarget> {
      const email = applicant(session);
      const e = await event(slug);
      const { app } = await ownRow(e.id, appId, email);
      if (!OPEN.includes(app.status)) throw new HttpError("conflict", "Documents can be added only before the application is submitted.");
      if (app.type !== "seeker" || !SEEKER_DOCS.some((d) => d.kind === req.kind))
        throw new HttpError("bad_request", "That isn't a document this application asks for.", ["kind"]);
      if (!UPLOAD_TYPES[req.contentType]) throw new HttpError("bad_request", "Upload a PDF, a Word, Excel or PowerPoint file, or a PNG or JPEG image.", ["contentType"]);
      if (req.size > uploadMaxBytes) throw new HttpError("payload_too_large", `Files can be up to ${Math.round(uploadMaxBytes / 1_048_576)} MB.`);
      if ((await repo.pendingFiles(appId, new Date(Date.now() - 3_600_000))) >= MAX_UPLOADS_PER_HOUR)
        throw new HttpError("rate_limited", "Too many uploads for this application in the last hour. Try again later.");

      const fileId = `file_${randomBytes(10).toString("hex")}`;
      const storageKey = `dr/${e.id}/${appId}/${fileId}`;
      await repo.addFile({ id: fileId, eventId: e.id, appId, kind: req.kind, storageKey, name: cleanName(req.name), contentType: req.contentType, size: req.size });
      return { fileId, ...storage.uploadTarget(storageKey, { contentType: req.contentType, size: req.size }) };
    },

    /** The upload arrived: attach it to the application, through the rules. Safe to call twice. */
    async completeUpload(session: Resolved, slug: string, appId: string, fileId: string, ip: string | null): Promise<MyApplication> {
      const email = applicant(session);
      const e = await event(slug);
      const file = await repo.fileOf(fileId, appId);
      if (!file) throw new HttpError("not_found", "No such upload.");
      const arrived = await storage.stat(file.storageKey);
      if (!arrived || arrived.size !== file.size) throw new HttpError("conflict", "The file hasn't arrived yet. Try uploading it again.");
      const state = await commands.run({
        eventId: e.id,
        actor: { kind: "applicant", appId },
        userId: session.user.id,
        ip,
        owned: owns(appId, email),
        actions: (s, ctx): Action[] => {
          const app = appIn(s, appId);
          if (app.documents.some((d) => d.id === fileId)) return [];
          if (!OPEN.includes(app.status)) throw new HttpError("conflict", "Documents can be added only before the application is submitted.");
          return [{ type: "dr/addDoc", appId, doc: { id: fileId, name: file.name, kind: file.kind as DrApplication["documents"][number]["kind"], size: file.size, at: ctx.now, download: true } }];
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
