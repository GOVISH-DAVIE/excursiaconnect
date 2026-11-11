/**
 * The Deal Room team's use cases. Deny by default: the signed-in person must be on this event's Deal Room team; the
 * rules then check their role. Every change goes through runCommand (dealroom.commands.ts).
 */
import type { ApplicationSummary, AssignReviewerInput, MessageRow, StaffMember, TeamView } from "@excursia/contracts/dealroom";
import type { DocumentLink, RequestInfoInput, ReviewView, RfiExpiryInput, ScoreInput } from "@excursia/contracts/review";
import type { Action } from "@excursia/domain/core/reducer";
import { nairobiNow, type Actor } from "@excursia/domain/ctx";
import { drCan } from "@excursia/domain/dealroom/logic";
import { dealRoomGaps } from "@excursia/domain/dealroom/defaults";
import type { DealRoomSettings, DealRoomSettingsInput } from "@excursia/contracts/onboarding";
import type { DrApplication, DrStaff } from "@excursia/domain/dealroom/types";
import type { AppState } from "@excursia/domain/types";
import type { Storage } from "../../storage/storage";
import type { DrConfigRecord } from "./dealroom.mapper";
import { HttpError } from "../../http/errors";
import type { Resolved } from "../auth/auth.service";
import type { Commands } from "./dealroom.commands";
import type { DealRoomRepo } from "./dealroom.repo";

const toStaff = (s: DrStaff): StaffMember => ({ id: s.id, name: s.name, role: s.role, canDecide: s.canDecide, canReview: s.active && s.role !== "Operations" });

type AppRow = Awaited<ReturnType<DealRoomRepo["listApplications"]>>[number];
const toSummary = (r: AppRow): ApplicationSummary => {
  const app = r.record as unknown as DrApplication;
  return {
    id: r.id,
    ref: r.ref,
    type: r.type as ApplicationSummary["type"],
    org: app.org?.name ?? "(no name yet)",
    country: app.org?.country || null,
    status: r.status as ApplicationSummary["status"],
    assigneeId: r.assigneeId,
    mission: r.mission,
    decision: r.decision,
    readiness: r.readiness,
    version: r.version,
    updatedAt: r.updatedAt.toISOString(),
  };
};

export type DealRoomDeps = {
  repo: DealRoomRepo;
  commands: Commands;
  storage: Storage;
  /** the rules' clock, for the due dates the reviewer's screen shows */
  now: () => Date;
  /** Local and staging only: open files still waiting for the virus scan (M1.2). Production refuses them. */
  allowUnscanned: boolean;
};

export function createDealRoomService({ repo, commands, storage, now, allowUnscanned }: DealRoomDeps) {
  /** Deny by default: the signed-in person must be on this event's Deal Room team. */
  async function staffActor(session: Resolved, eventId: string): Promise<{ actor: Actor; staff: DrStaff }> {
    const row = await repo.staffForUser(session.user.id, eventId);
    if (!row) throw new HttpError("forbidden", "You're not on this event's Deal Room team.");
    return { actor: { kind: "staff", id: row.id }, staff: row.record as unknown as DrStaff };
  }

  /** Reviewers and the people who assign them: the roles that open applications. */
  async function reviewer(session: Resolved, eventId: string) {
    const s = await staffActor(session, eventId);
    if (!drCan(s.staff, "review") && !drCan(s.staff, "assign")) throw new HttpError("forbidden", `Your role, ${s.staff.role}, doesn't open applications.`);
    return s;
  }

  async function review(session: Resolved, eventId: string, appId: string): Promise<ReviewView> {
    const { staff } = await reviewer(session, eventId);
    const [found, all] = await Promise.all([repo.forReview(eventId, appId), repo.listStaff(eventId)]);
    if (!found) throw new HttpError("not_found", "No such application in this Deal Room.");
    const cfg = (found.config as unknown as DrConfigRecord).config;
    return {
      application: found.record as unknown as ReviewView["application"],
      config: { rubric: cfg.rubric, rfiDays: cfg.rules.rfiDays, missions: cfg.missions, tracks: cfg.tracks },
      now: nairobiNow(now()),
      me: toStaff(staff),
      staff: all.map((s) => toStaff(s.record as unknown as DrStaff)),
      can: { review: drCan(staff, "review"), assign: drCan(staff, "assign"), decideExpiry: staff.role === "Lead" && staff.active },
    };
  }

  /** A reviewer's change to one application: in this event, through the rules, then the screen's new view. */
  async function act(session: Resolved, eventId: string, appId: string, ip: string | null, build: (app: DrApplication, state: AppState) => Action[]) {
    const { actor } = await reviewer(session, eventId);
    await commands.run({
      eventId,
      actor,
      userId: session.user.id,
      ip,
      owned: (s) => {
        if (!s.dealRoom.apps.some((a) => a.id === appId)) throw new HttpError("not_found", "No such application in this Deal Room.");
      },
      actions: (s) => build(s.dealRoom.apps.find((a) => a.id === appId)!, s),
    });
    return review(session, eventId, appId);
  }

  return {
    review,

    startReview: (session: Resolved, eventId: string, appId: string, ip: string | null) => act(session, eventId, appId, ip, () => [{ type: "dr/startReview", appId }]),

    /** One score against one criterion of the rubric, resting on one of this application's documents or a note. */
    score: (session: Resolved, eventId: string, appId: string, input: ScoreInput, ip: string | null) =>
      act(session, eventId, appId, ip, (app, s) => {
        const rubric = s.dealRoom.configs[eventId].rubric[input.layer];
        if (!rubric.some((c) => c.id === input.criterion)) throw new HttpError("bad_request", "That isn't a criterion of this rubric.", ["criterion"]);
        if (input.docId && !app.documents.some((d) => d.id === input.docId)) throw new HttpError("bad_request", "That document isn't part of this application.", ["docId"]);
        if (input.layer === "eligibility" ? input.pass === undefined : input.score === undefined)
          throw new HttpError("bad_request", input.layer === "eligibility" ? "Choose pass or fail." : "Give a score from 0 to 100.", [input.layer === "eligibility" ? "pass" : "score"]);
        return [
          {
            type: "dr/score",
            appId,
            layer: input.layer,
            criterion: input.criterion,
            pass: input.layer === "eligibility" ? input.pass : undefined,
            score: input.layer === "eligibility" ? undefined : input.score,
            docId: input.docId,
            note: input.note?.trim() || undefined,
          },
        ];
      }),

    requestInfo: (session: Resolved, eventId: string, appId: string, input: RequestInfoInput, ip: string | null) =>
      act(session, eventId, appId, ip, () => [{ type: "dr/requestInfo", appId, questions: input.questions, docs: input.docs }]),

    /** The lead's call on a request that expired unanswered. */
    rfiExpiry: (session: Resolved, eventId: string, appId: string, input: RfiExpiryInput, ip: string | null) =>
      act(session, eventId, appId, ip, () => [{ type: "dr/rfiExpiry", appId, how: input.how, note: input.note }]),

    /** A two-minute link to one of the application's documents; every opening is in the audit log. */
    async documentLink(session: Resolved, eventId: string, appId: string, docId: string, ip: string | null): Promise<DocumentLink> {
      const { actor } = await reviewer(session, eventId);
      const found = await repo.forReview(eventId, appId);
      const app = found?.record as unknown as DrApplication | undefined;
      if (!app?.documents.some((d) => d.id === docId)) throw new HttpError("not_found", "No such document on this application.");
      const file = await repo.fileOf(docId, appId);
      if (!file) throw new HttpError("not_found", "This document has no file to open: it is demo data.");
      if (file.state === "rejected") throw new HttpError("conflict", "This file failed its virus scan and can't be opened.");
      if (file.state !== "clean" && !allowUnscanned) throw new HttpError("conflict", "This file is waiting for its virus scan. Try again in a few minutes.");
      const link = storage.downloadUrl(file.storageKey, { name: file.name, contentType: file.contentType });
      await repo.audit({ actorKind: actor.kind, actorId: session.user.id, eventId, entity: "file", entityId: file.id, action: "file/open", detail: { appId, kind: file.kind, scanned: file.state === "clean" }, ip });
      return { url: link.url, expiresAt: link.expiresAt.toISOString() };
    },

    /** The Deal Room's settings: everyone on the team reads them; the lead changes them. */
    async settings(session: Resolved, eventId: string): Promise<DealRoomSettings> {
      const { staff } = await staffActor(session, eventId);
      const row = await repo.settings(eventId);
      if (!row) throw new HttpError("not_found", "This event has no Deal Room.");
      const cfg = (row.record as unknown as DrConfigRecord).config;
      return {
        event: { id: row.event.id, name: row.event.name, slug: row.event.slug, startDate: row.event.startDate.toISOString().slice(0, 10), state: row.event.state },
        missions: cfg.missions,
        tracks: cfg.tracks,
        appOpen: cfg.rules.appOpen,
        appClose: cfg.rules.appClose,
        rfiDays: cfg.rules.rfiDays,
        rubric: cfg.rubric,
        gaps: dealRoomGaps(cfg),
        canEdit: drCan(staff, "configure"),
        log: [...cfg.log].reverse(),
      };
    },

    /** The lead sets the missions, tracks and dates, through the rules' own dr/config (lead only, logged). */
    async saveSettings(session: Resolved, eventId: string, input: DealRoomSettingsInput, ip: string | null): Promise<DealRoomSettings> {
      const { actor } = await staffActor(session, eventId);
      await commands.run({
        eventId,
        actor,
        userId: session.user.id,
        ip,
        actions: (s) => {
          const cfg = s.dealRoom.configs[eventId];
          const what = [`${input.missions.length} mission${input.missions.length === 1 ? "" : "s"}`, `${input.tracks.length} track${input.tracks.length === 1 ? "" : "s"}`, `applications ${input.appOpen} to ${input.appClose}`, `${input.rfiDays} days to answer a request`];
          return [
            {
              type: "dr/config",
              eventId,
              patch: {
                missions: input.missions.map((m) => ({ ...m, description: m.description ?? "" })),
                tracks: input.tracks.map((t) => ({ ...t, description: t.description ?? "" })),
                rules: { ...cfg.rules, appOpen: input.appOpen, appClose: input.appClose, rfiDays: input.rfiDays },
              },
              note: `Settings: ${what.join(", ")}`,
            },
          ];
        },
      });
      return this.settings(session, eventId);
    },

    /** What the Deal Room has sent, and whether it went (M1.4). Everyone on the team reads it. */
    async messages(session: Resolved, eventId: string): Promise<MessageRow[]> {
      await staffActor(session, eventId);
      return (await repo.messages(eventId)).map((m) => ({
        id: m.id,
        to: m.toName,
        kind: m.recipient.startsWith("st_") ? "staff" : m.recipient.startsWith("user:") ? "organiser" : "applicant",
        subject: m.subject,
        status: m.status,
        attempts: m.attempts,
        at: m.createdAt.toISOString(),
        sentAt: m.sentAt?.toISOString() ?? null,
      }));
    },

    async team(session: Resolved, eventId: string): Promise<TeamView> {
      const { staff } = await staffActor(session, eventId);
      const [all, name] = await Promise.all([repo.listStaff(eventId), repo.eventName(eventId)]);
      return { event: { id: eventId, name }, me: toStaff(staff), canAssign: drCan(staff, "assign"), staff: all.map((s) => toStaff(s.record as unknown as DrStaff)) };
    },

    async applications(session: Resolved, eventId: string, query: { status?: string; assignee?: string }): Promise<ApplicationSummary[]> {
      const { staff } = await staffActor(session, eventId);
      const assigneeId = query.assignee === "me" ? staff.id : query.assignee === "none" ? null : query.assignee;
      return (await repo.listApplications(eventId, { status: query.status, assigneeId })).map(toSummary);
    },

    /** The worked example (docs/architecture.md): assign applications to a reviewer. */
    async assignReviewer(session: Resolved, eventId: string, input: AssignReviewerInput, ip: string | null): Promise<ApplicationSummary[]> {
      const ids = [...new Set(input.appIds)];
      const { actor } = await staffActor(session, eventId);
      await commands.run({
        eventId,
        actor,
        userId: session.user.id,
        ip,
        owned: (state) => {
          const here = new Set(state.dealRoom.apps.map((a) => a.id));
          const missing = ids.filter((id) => !here.has(id));
          if (missing.length) throw new HttpError("not_found", `Not an application in this Deal Room: ${missing.join(", ")}`);
        },
        actions: () => [{ type: "dr/assign", appIds: ids, staffId: input.staffId }],
      });
      return (await repo.listApplications(eventId, { ids })).map(toSummary);
    },
  };
}
export type DealRoomService = ReturnType<typeof createDealRoomService>;
