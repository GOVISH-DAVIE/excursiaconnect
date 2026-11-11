/**
 * An organiser's own use cases (backend-plan.md, M2.3 brought forward): signing up, KYC, and its events from a
 * draft to live. Deny by default: every use case but signing up needs the signed-in person to own the organiser
 * (Algotech reads through the platform module). The rules are in @excursia/domain/core/onboarding; each change runs
 * under the organiser's or the event's row lock, with its audit row.
 */
import { randomBytes } from "node:crypto";
import type { DocumentLink } from "@excursia/contracts/review";
import type { EventInput, EventView, KycInput, OrganiserSignup, OrganiserView } from "@excursia/contracts/onboarding";
import type { UploadTarget } from "@excursia/contracts/apply";
import {
  addKycDoc,
  editEvent,
  editKyc,
  newEvent,
  newOrganiser,
  publishEvent,
  removeKycDoc,
  signDpa,
  slugFor,
  submitEvent,
  submitKyc,
  type EventDetails,
  type Result,
} from "@excursia/domain/core/onboarding";
import { nairobiNow } from "@excursia/domain/ctx";
import type { EventRecord, Organiser } from "@excursia/domain/types";
import { HttpError } from "../../http/errors";
import { hashPassword } from "../../security/passwords";
import { UPLOAD_TYPES, cleanFileName, type Storage } from "../../storage/storage";
import type { AuthService, ClientMeta, Issued, Resolved } from "../auth/auth.service";
import type { DrConfigRecord } from "../dealroom/dealroom.mapper";
import type { Note, OrganisersRepo } from "./organisers.repo";
import { eventView, organiserView } from "./organisers.views";

const MAX_KYC_UPLOADS_PER_HOUR = 20;

export type OrganisersDeps = {
  repo: OrganisersRepo;
  auth: AuthService;
  storage: Storage;
  /** the rules' clock: event dates are checked against it */
  now: () => Date;
  uploadMaxBytes: number;
  /** Local and staging only: open files still waiting for the virus scan (M1.2). */
  allowUnscanned: boolean;
};

/** A refusal from the rules is a 409 with their sentence; otherwise the next record. */
export function must<T>(r: Result<T>): T {
  if (r.refusal !== undefined) throw new HttpError("conflict", r.refusal);
  return r.value;
}

export const isAdmin = (s: Resolved) => s.user.kind === "admin";

export function createOrganisersService({ repo, auth, storage, now, uploadMaxBytes, allowUnscanned }: OrganisersDeps) {
  const at = () => nairobiNow(now());

  /** The owner, or Algotech for reading; anyone else is told nothing exists. */
  async function canSee(session: Resolved, organiserId: string) {
    if (isAdmin(session)) return;
    if (!(await repo.isOwner(session.user.id, organiserId))) throw new HttpError("not_found", "No such organiser.");
  }
  async function mustOwn(session: Resolved, organiserId: string) {
    if (session.user.kind === "participant" || !(await repo.isOwner(session.user.id, organiserId))) throw new HttpError("not_found", "No such organiser.");
  }

  /** An organiser's view; Algotech's leaves out the drafts, which only the organiser sees (OR-2). */
  async function viewOf(organiserId: string, forAdmin = false): Promise<OrganiserView> {
    const [row, events, owner] = await Promise.all([repo.organiser(organiserId), repo.eventsOf(organiserId), repo.ownerOf(organiserId)]);
    if (!row) throw new HttpError("not_found", "No such organiser.");
    const records = events.map((e) => e.record as unknown as EventRecord).filter((e) => !forAdmin || e.state !== "Draft");
    return organiserView(row.record as unknown as Organiser, records, owner);
  }

  async function eventViewOf(eventId: string): Promise<EventView> {
    const row = await repo.event(eventId);
    if (!row) throw new HttpError("not_found", "No such event.");
    const staff = row.drConfig ? await repo.dealRoomStaff(eventId) : [];
    return eventView(row.record as unknown as EventRecord, row.organiser.record as unknown as Organiser, at().slice(0, 10), {
      config: (row.drConfig?.record as unknown as DrConfigRecord | undefined) ?? null,
      staff,
    });
  }

  /** The event, if this person may see it: its owner, or Algotech. Demo events aren't reached this way. */
  async function eventFor(session: Resolved, eventId: string) {
    const row = await repo.event(eventId);
    if (!row || row.demo) throw new HttpError("not_found", "No such event.");
    // a draft is the organiser's alone (OR-2); Algotech sees it once it is sent
    const seen = isAdmin(session) ? row.state !== "Draft" : await repo.isOwner(session.user.id, row.organiserId);
    if (!seen) throw new HttpError("not_found", "No such event.");
    return row;
  }

  async function changeOrganiser(session: Resolved, organiserId: string, action: string, ip: string | null, change: (o: Organiser) => Organiser, detail?: object, notify: (o: Organiser) => Promise<Note[]> = async () => []) {
    await mustOwn(session, organiserId);
    const out = await repo.withOrganiser(organiserId, async (o) => {
      const record = change(o);
      return { record, audit: { actorKind: "owner", actorId: session.user.id, action, detail, ip }, notify: await notify(record) };
    });
    if (!out) throw new HttpError("not_found", "No such organiser.");
    return viewOf(organiserId);
  }

  async function changeEvent(session: Resolved, eventId: string, action: string, ip: string | null, change: (e: EventRecord, o: Organiser) => EventRecord, detail?: object, notify: (e: EventRecord) => Promise<Note[]> = async () => []) {
    const row = await eventFor(session, eventId);
    if (isAdmin(session) || !(await repo.isOwner(session.user.id, row.organiserId))) throw new HttpError("forbidden", "Only the organiser's owner can change its events.");
    await repo.withEvent(eventId, async (e, o) => {
      const record = change(e, o);
      return { record, audit: { actorKind: "owner", actorId: session.user.id, action, detail, ip }, notify: await notify(record) };
    });
    return eventViewOf(eventId);
  }

  const details = (input: EventInput & { slug?: string }): EventDetails => ({
    name: input.name,
    tagline: input.tagline ?? "",
    venue: input.venue ?? "",
    city: input.city ?? "",
    startDate: input.startDate,
    endDate: input.endDate,
    expectedAttendance: input.expectedAttendance ?? 0,
    brand: { primary: input.brand.primary.toUpperCase(), logoText: input.brand.logoText.toUpperCase() },
    dealRoomRequest: input.dealRoomRequest ?? null,
  });

  return {
    eventViewOf,
    viewOf,
    canSee,

    requestSignupCode: (email: string, meta: ClientMeta) => auth.requestSignupCode(email, meta),

    /**
     * Self sign-up: the emailed code proves the address, then the owner's account, the organiser and the
     * membership are made together. The answer is the first half of a staff sign-in: the authenticator comes next.
     */
    async signUp(input: OrganiserSignup, meta: ClientMeta): Promise<Issued & { next: string; skipUntil?: string }> {
      await auth.spendSignupCode(input.email, input.code, meta);
      const existing = await repo.userByEmail(input.email);
      if (existing?.kind === "participant") throw new HttpError("conflict", "This email is already used to apply to a Deal Room. Sign up with a different work email.");
      if (existing) throw new HttpError("conflict", "This email already has an account. Sign in instead.");
      const organiser = newOrganiser({ id: `org_${randomBytes(6).toString("hex")}`, name: input.organisation, country: input.country, now: at() });
      let user;
      try {
        user = await repo.createOwner({
          user: { email: input.email, name: input.name, passwordHash: await hashPassword(input.password) },
          organiser,
          audit: { actorKind: "owner", action: "organiser/signUp", detail: { organisation: input.organisation, country: input.country }, ip: meta.ip },
        });
      } catch (e) {
        // the same email signing up twice at once: the database's unique email decides
        if ((e as { code?: string }).code === "P2002") throw new HttpError("conflict", "This email already has an account. Sign in instead.");
        throw e;
      }
      return auth.afterPassword({ ...user, kind: "staff" }, meta);
    },

    async mine(session: Resolved): Promise<OrganiserView[]> {
      const ids = await repo.ownedBy(session.user.id);
      return Promise.all(ids.map((id) => viewOf(id)));
    },

    async organiser(session: Resolved, organiserId: string) {
      await canSee(session, organiserId);
      return viewOf(organiserId, isAdmin(session));
    },

    saveKyc: (session: Resolved, organiserId: string, input: KycInput, ip: string | null) =>
      changeOrganiser(session, organiserId, "organiser/kyc", ip, (o) => must(editKyc(o, input)), { fields: Object.keys(input) }),

    signDpa: (session: Resolved, organiserId: string, by: string, ip: string | null) =>
      changeOrganiser(session, organiserId, "organiser/signDpa", ip, (o) => must(signDpa(o, by, at())), { by }),

    submitKyc: (session: Resolved, organiserId: string, ip: string | null) =>
      changeOrganiser(session, organiserId, "organiser/submitKyc", ip, (o) => must(submitKyc(o, at())), undefined, async (o) =>
        (await repo.adminIds()).map((to) => ({ to, subject: `KYC to check: ${o.name}`, link: `/team/admin/organisers/${o.id}` })),
      ),

    /** Where to upload one KYC document; it is attached once it has arrived (`completeKycDoc`). */
    async startKycDoc(session: Resolved, organiserId: string, req: { kind: string; name: string; contentType: string; size: number }): Promise<UploadTarget> {
      await mustOwn(session, organiserId);
      const row = await repo.organiser(organiserId);
      must(addKycDoc(row!.record as unknown as Organiser, { id: "file_check", kind: req.kind, name: "", size: 0, at: "" }));
      if (!UPLOAD_TYPES[req.contentType]) throw new HttpError("bad_request", "Upload a PDF, a Word, Excel or PowerPoint file, or a PNG or JPEG image.", ["contentType"]);
      if (req.size > uploadMaxBytes) throw new HttpError("payload_too_large", `Files can be up to ${Math.round(uploadMaxBytes / 1_048_576)} MB.`);
      if ((await repo.recentFiles(organiserId, new Date(Date.now() - 3_600_000))) >= MAX_KYC_UPLOADS_PER_HOUR)
        throw new HttpError("rate_limited", "Too many uploads in the last hour. Try again later.");
      const fileId = `file_${randomBytes(10).toString("hex")}`;
      const storageKey = `org/${organiserId}/${fileId}`;
      await repo.addFile({ id: fileId, organiserId, kind: req.kind, storageKey, name: cleanFileName(req.name), contentType: req.contentType, size: req.size });
      return { fileId, ...storage.uploadTarget(storageKey, { contentType: req.contentType, size: req.size }) };
    },

    async completeKycDoc(session: Resolved, organiserId: string, fileId: string, ip: string | null) {
      await mustOwn(session, organiserId);
      const file = await repo.fileOf(fileId, organiserId);
      if (!file?.kind) throw new HttpError("not_found", "No such upload.");
      const arrived = await storage.stat(file.storageKey);
      if (!arrived || arrived.size !== file.size) throw new HttpError("conflict", "The file hasn't arrived yet. Try uploading it again.");
      return changeOrganiser(session, organiserId, "organiser/addKycDoc", ip, (o) =>
        must(addKycDoc(o, { id: file.id, kind: file.kind!, name: file.name, size: file.size, at: at() })),
      { fileId, kind: file.kind });
    },

    removeKycDoc: (session: Resolved, organiserId: string, fileId: string, ip: string | null) =>
      changeOrganiser(session, organiserId, "organiser/removeKycDoc", ip, (o) => must(removeKycDoc(o, fileId)), { fileId }),

    /** A short link to one KYC document, for its owner or Algotech; each opening is audited. */
    async kycDocLink(session: Resolved, organiserId: string, fileId: string, ip: string | null): Promise<DocumentLink> {
      await canSee(session, organiserId);
      const row = await repo.organiser(organiserId);
      const o = row?.record as unknown as Organiser | undefined;
      if (!o?.kycDocs?.some((d) => d.id === fileId)) throw new HttpError("not_found", "No such document.");
      const file = await repo.fileOf(fileId, organiserId);
      if (!file) throw new HttpError("not_found", "No such document.");
      if (file.state === "rejected") throw new HttpError("conflict", "This file failed its virus scan and can't be opened.");
      if (file.state !== "clean" && !allowUnscanned) throw new HttpError("conflict", "This file is waiting for its virus scan. Try again in a few minutes.");
      const link = storage.downloadUrl(file.storageKey, { name: file.name, contentType: file.contentType });
      await repo.audit({ actorKind: isAdmin(session) ? "admin" : "owner", actorId: session.user.id, action: "file/open", detail: { kind: file.kind, scanned: file.state === "clean" }, ip }, "file", file.id, null);
      return { url: link.url, expiresAt: link.expiresAt.toISOString() };
    },

    // ----- events -----

    async createEvent(session: Resolved, organiserId: string, input: EventInput & { slug?: string }, ip: string | null): Promise<EventView> {
      await mustOwn(session, organiserId);
      const row = await repo.organiser(organiserId);
      const o = row!.record as unknown as Organiser;
      const slug = input.slug ?? slugFor(input.name);
      if (slug.length < 3) throw new HttpError("bad_request", "Give the event a longer name, or choose its web address.", ["slug"]);
      if (await repo.slugTaken(slug)) throw new HttpError("conflict", `The web address ${slug} is taken. Choose another.`, ["slug"]);
      const e = newEvent(o, details(input), { id: `ev_${randomBytes(6).toString("hex")}`, slug }, at());
      try {
        await repo.createEvent(e, { actorKind: "owner", actorId: session.user.id, action: "event/create", detail: { name: e.name, slug }, ip });
      } catch (err) {
        if ((err as { code?: string }).code === "P2002") throw new HttpError("conflict", `The web address ${slug} is taken. Choose another.`, ["slug"]);
        throw err;
      }
      return eventViewOf(e.id);
    },

    async event(session: Resolved, eventId: string) {
      await eventFor(session, eventId);
      return eventViewOf(eventId);
    },

    saveEvent: (session: Resolved, eventId: string, input: EventInput, ip: string | null) =>
      changeEvent(session, eventId, "event/edit", ip, (e) => must(editEvent(e, details(input)))),

    submitEvent: (session: Resolved, eventId: string, ip: string | null) =>
      changeEvent(session, eventId, "event/submit", ip, (e, o) => must(submitEvent(e, o, at().slice(0, 10), at())), undefined, async (e) =>
        (await repo.adminIds()).map((to) => ({ to, subject: `An event to approve: ${e.name}`, link: `/team/events/${e.id}`, eventId: e.id })),
      ),

    publishEvent: (session: Resolved, eventId: string, ip: string | null) => changeEvent(session, eventId, "event/publish", ip, (e) => must(publishEvent(e, at()))),
  };
}
export type OrganisersService = ReturnType<typeof createOrganisersService>;
