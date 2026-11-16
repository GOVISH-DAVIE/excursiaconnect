/**
 * Matching and introductions (backend-plan.md, M3.1).
 *
 * The team's side: deny by default, then the rules check the role. The lead, reviewers and coordinators search the
 * participants open to matching, see each candidate's fit, and decide the pair; an approved pair gets its brief and
 * an introduction proposing some of the seeker's documents.
 *
 * The participant's side: signed in with the email they applied with, they see the introductions of their own
 * applications only, and answer them. The seeker shares documents one by one and may withdraw. The counterparty
 * opens the seeker's profile, and each document it may open, through a two-minute link to a copy stamped with its
 * name (storage/stamp.ts). Every opening goes through the rules' dr/access, which checks and logs it, so the seeker
 * sees it.
 */
import { createHmac } from "node:crypto";
import type {
  BriefInput,
  Candidate,
  Candidates,
  DecideMatchInput,
  DecidedMatch,
  IntroduceInput,
  MatchingBoard,
  MatchStage,
  MatchView,
  MyIntroductions,
  PoolEntry,
  RespondIntroInput,
  SeekerProfile,
  SharedDoc,
  SharedLink,
} from "@excursia/contracts/matching";
import type { Action } from "@excursia/domain/core/reducer";
import { nairobiNow, type Actor } from "@excursia/domain/ctx";
import {
  blockedPair,
  canSee,
  candidates,
  compact,
  consentGranted,
  drCan,
  fitDetail,
  introExpiresAt,
  matchable,
  matchStage,
  notMatchable,
  pairTimeline,
  participantLabel,
  staffName,
} from "@excursia/domain/dealroom/logic";
import type { DealRoomState, DrApplication, DrMatch, DrStaff } from "@excursia/domain/dealroom/types";
import { fmtStamp } from "@excursia/domain/time";
import type { AppState } from "@excursia/domain/types";
import { HttpError } from "../../http/errors";
import { sameDigest } from "../../security/secrets";
import { checkStampable, stamp, stampable, StampRefused } from "../../storage/stamp";
import type { Storage } from "../../storage/storage";
import type { Resolved } from "../auth/auth.service";
import { stateOf, type Commands } from "../dealroom/dealroom.commands";
import type { DealRoomRepo } from "../dealroom/dealroom.repo";
import type { MatchingRepo } from "./matching.repo";

/** A link to a stamped copy lasts as long as a reviewer's link to a document does. */
const LINK_MS = 2 * 60_000;
/** A stamped copy made from a bigger file would hold the API too long; such a file is downloaded as it is. */
const STAMP_MAX_BYTES = 40 * 1_048_576;

/** What a shared link names: the file, how to serve it, and the words to stamp on it. Signed, so it can't be changed. */
type Grant = { f: string; o: string; n: string; d: "inline" | "attachment"; m: string; t: string; e: number };

export type MatchingDeps = {
  repo: MatchingRepo;
  drRepo: DealRoomRepo;
  commands: Commands;
  storage: Storage;
  /** signs the links to stamped copies */
  shareKey: Buffer;
  now: () => Date;
  /** Local and staging only: open files still waiting for the virus scan (M1.2). */
  allowUnscanned: boolean;
};

const PROFILE = new Set(["teaser", "profile"]);
const docsOf = (m: DrMatch) => (m.intro?.items ?? []).filter((i) => !PROFILE.has(i));
/** Whether a document opens as a stamped copy, by its name (the stored type decides when it is served). */
const stampedByName = (name: string) => /\.(pdf|png|jpe?g)$/i.test(name);

function summaryOf(a: DrApplication) {
  if (a.type === "seeker") return [a.org.sector, a.ask ? compact(a.ask.amount, a.ask.currency) : ""].filter(Boolean).join(", ");
  return a.mandate ? `${compact(a.mandate.ticketMin, a.mandate.currency)} to ${compact(a.mandate.ticketMax, a.mandate.currency)}` : "";
}

export function createMatchingService({ repo, drRepo, commands, storage, shareKey, now, allowUnscanned }: MatchingDeps) {
  const sign = (payload: string) => createHmac("sha256", shareKey).update(payload).digest("hex");

  async function load(eventId: string): Promise<{ state: AppState; dr: DealRoomState; at: string }> {
    const stored = await drRepo.load(eventId);
    if (!stored) throw new HttpError("not_found", "This event has no Deal Room.");
    const at = nairobiNow(now());
    const state = stateOf(eventId, stored, at);
    return { state, dr: state.dealRoom, at };
  }

  /* ----- the team ----- */

  async function staffActor(session: Resolved, eventId: string): Promise<{ actor: Actor; staff: DrStaff }> {
    const row = await drRepo.staffForUser(session.user.id, eventId);
    if (!row) throw new HttpError("forbidden", "You're not on this event's Deal Room team.");
    return { actor: { kind: "staff", id: row.id }, staff: row.record as unknown as DrStaff };
  }

  /** The lead, reviewers and coordinators match; operations schedule what they match (M3.2). */
  async function matcher(session: Resolved, eventId: string) {
    const s = await staffActor(session, eventId);
    if (!drCan(s.staff, "match")) throw new HttpError("forbidden", `Your role, ${s.staff.role}, doesn't match participants.`);
    return s;
  }

  const entry = (dr: DealRoomState, a: DrApplication): PoolEntry => ({
    id: a.id,
    ref: a.ref ?? null,
    side: a.type,
    org: a.org.name,
    label: participantLabel(a),
    summary: summaryOf(a),
    mission: a.mission || null,
    approved: dr.matches.filter((m) => (m.seekerId === a.id || m.providerId === a.id) && m.decision === "Approved").length,
  });

  function matchView(dr: DealRoomState, m: DrMatch, at: string, staff: DrStaff): MatchView {
    const cfg = dr.configs[m.eventId];
    const s = dr.apps.find((a) => a.id === m.seekerId)!;
    const p = dr.apps.find((a) => a.id === m.providerId)!;
    const opened = (item: string) =>
      dr.access
        .filter((x) => x.seekerId === s.id && x.viewer === p.id && x.item === item)
        .sort((a, b) => b.at.localeCompare(a.at))
        .map((x) => ({ action: x.action, at: x.at }));
    const consentOf = (docId: string) => {
      if (!m.intro?.seeker) return "asked at acceptance" as const;
      if (consentGranted(dr, s.id, p.id, docId)) return "granted" as const;
      return dr.consents.some((c) => c.seekerId === s.id && c.providerId === p.id && c.docId === docId && c.granted) ? ("withdrawn" as const) : ("not granted" as const);
    };
    const answer = (x?: { response: "Accepted" | "Declined"; reason?: string; at: string }) => (x ? { response: x.response, reason: x.reason ?? null, at: x.at } : null);
    const party = (a: DrApplication) => ({
      id: a.id,
      ref: a.ref ?? null,
      label: participantLabel(a),
      org: a.org.name,
      rows: (a.type === "seeker"
        ? [
            ["Ask", a.ask ? `${compact(a.ask.amount, a.ask.currency)} ${a.ask.instrument.toLowerCase()}` : "–"],
            ["Sector, country", `${a.org.sector}, ${a.org.country}`],
            ["Decision-maker", `${a.decisionMaker.name}, ${a.decisionMaker.title}`],
          ]
        : [
            [participantLabel(a).startsWith("Partner") || a.challenge ? "Contract size" : "Ticket", summaryOf(a) || "–"],
            ["Pathways", a.mandate?.instruments.join(", ") || "–"],
            ["Decision-maker", `${a.decisionMaker.name}, ${a.decisionMaker.title}`],
          ]) as [string, string][],
    });
    return {
      now: at,
      introDays: cfg.rules.introDays,
      match: {
        id: m.id,
        origin: m.origin,
        decision: m.decision,
        stage: matchStage(m, cfg, at),
        note: m.note,
        by: m.by === "applicant" ? p.org.name : staffName(dr, m.by),
        at: m.at,
        override: m.override ? { by: staffName(dr, m.override.by), at: m.override.at, reason: m.override.reason } : null,
        exclusionHit: m.exclusionHit ?? null,
        brief: m.brief ?? null,
        intro: m.intro
          ? {
              sentAt: m.intro.sentAt,
              by: staffName(dr, m.intro.by),
              expiresAt: introExpiresAt(m, cfg)!,
              seeker: answer(m.intro.seeker),
              provider: answer(m.intro.provider),
              items: m.intro.items.map((it) => ({
                id: it,
                label: it === "teaser" ? "Teaser" : it === "profile" ? "Full profile" : (s.documents.find((d) => d.id === it)?.kind ?? "A removed document"),
                consent: PROFILE.has(it) ? ("with the introduction" as const) : consentOf(it),
                opened: opened(it),
              })),
            }
          : null,
      },
      seeker: party(s),
      provider: party(p),
      fit: fitDetail(s, p, cfg),
      documents: s.documents.map((d) => ({ id: d.id, kind: d.kind, name: d.name, shareable: stampedByName(d.name) ? ("stamped" as const) : ("download only" as const) })),
      history: pairTimeline(dr, m).map((e) => ({ at: e.at, who: e.who, what: e.what, kind: e.kind })),
      can: { decide: drCan(staff, "match"), introduce: drCan(staff, "introduce") },
    };
  }

  async function view(session: Resolved, eventId: string, matchId: string): Promise<MatchView> {
    const { staff } = await matcher(session, eventId);
    const { dr, at } = await load(eventId);
    const m = dr.matches.find((x) => x.id === matchId);
    if (!m) throw new HttpError("not_found", "No such match in this Deal Room.");
    return matchView(dr, m, at, staff);
  }

  /** A change to one match, through the rules; then the match as it is now. */
  async function onMatch(session: Resolved, eventId: string, matchId: string, ip: string | null, action: Action): Promise<MatchView> {
    const { actor, staff } = await matcher(session, eventId);
    const state = await commands.run({
      eventId,
      actor,
      userId: session.user.id,
      ip,
      owned: (s) => {
        if (!s.dealRoom.matches.some((m) => m.id === matchId)) throw new HttpError("not_found", "No such match in this Deal Room.");
      },
      actions: () => [action],
    });
    return matchView(state.dealRoom, state.dealRoom.matches.find((m) => m.id === matchId)!, nairobiNow(now()), staff);
  }

  /* ----- the participant ----- */

  function participant(session: Resolved): string {
    if (session.user.kind !== "participant" || !session.user.email) throw new HttpError("forbidden", "Introductions open from a participant's account. Sign in with the email you applied with.");
    return session.user.email.toLowerCase();
  }

  async function eventOf(slug: string) {
    const e = await repo.eventBySlug(slug);
    if (!e) throw new HttpError("not_found", "This event has no Deal Room.");
    return e;
  }

  /** The participant's side of one introduction: which of their applications it is, and its two parties. */
  async function mySide(session: Resolved, slug: string, matchId: string, prefer?: (side: "seeker" | "provider") => boolean) {
    const email = participant(session);
    const e = await eventOf(slug);
    const [ids, pair] = await Promise.all([repo.appIdsOf(e.id, email), repo.pairOf(e.id, matchId)]);
    const sides = pair ? (["seeker", "provider"] as const).filter((x) => ids.includes(x === "seeker" ? pair.seekerId : pair.providerId)) : [];
    if (!pair || !sides.length) throw new HttpError("not_found", "No such introduction.");
    // one email on both sides of a pair is rare: the side the caller means, else the first
    const side = sides.find((x) => prefer?.(x)) ?? sides[0];
    return { e, pair, side, appId: side === "seeker" ? pair.seekerId : pair.providerId };
  }

  /** The introduction must be one the team sent: an approved pair not yet introduced is the team's business. */
  const introduced = (s: AppState, matchId: string) => {
    if (!s.dealRoom.matches.find((m) => m.id === matchId)?.intro) throw new HttpError("not_found", "No such introduction.");
  };

  async function introductions(session: Resolved, slug: string): Promise<MyIntroductions> {
    const email = participant(session);
    const e = await eventOf(slug);
    const ids = new Set(await repo.appIdsOf(e.id, email));
    const { dr, at } = await load(e.id);
    const cfg = dr.configs[e.id];
    const app = (id: string) => dr.apps.find((a) => a.id === id)!;
    const list = dr.matches
      .filter((m) => m.intro && m.decision === "Approved")
      .flatMap((m) => (["seeker", "provider"] as const).filter((side) => ids.has(side === "seeker" ? m.seekerId : m.providerId)).map((side) => ({ m, side })))
      .sort((a, b) => b.m.intro!.sentAt.localeCompare(a.m.intro!.sentAt));
    return {
      event: { name: e.name, slug: e.slug },
      now: at,
      introductions: list.map(({ m, side }) => {
        const s = app(m.seekerId);
        const p = app(m.providerId);
        const intro = m.intro!;
        const theirs = intro[side === "seeker" ? "provider" : "seeker"];
        const mine = intro[side];
        const documents: SharedDoc[] = docsOf(m).flatMap((id) => {
          const d = s.documents.find((x) => x.id === id);
          if (!d) return [];
          const stamped = stampedByName(d.name);
          const seen = side === "provider" ? canSee(dr, p, { kind: "doc", seekerId: s.id, docId: d.id }) : { ok: false, reason: undefined };
          const opens = side === "provider" && seen.ok && !stamped && !d.download ? { ok: false, reason: "This file can't be shown online, and the business allows viewing only." } : { ok: seen.ok, reason: seen.reason ?? null };
          return [
            {
              id: d.id,
              kind: d.kind,
              name: d.name,
              stamped,
              download: d.download,
              shared: consentGranted(dr, s.id, p.id, d.id),
              opens,
              opened:
                side === "seeker"
                  ? dr.access
                      .filter((x) => x.seekerId === s.id && x.viewer === p.id && x.item === d.id)
                      .sort((a, b) => b.at.localeCompare(a.at))
                      .map((x) => ({ action: x.action, at: x.at }))
                  : [],
            },
          ];
        });
        return {
          matchId: m.id,
          appId: side === "seeker" ? s.id : p.id,
          side,
          stage: matchStage(m, cfg, at) as "Introduced" | "Accepted" | "Declined" | "Expired",
          sentAt: intro.sentAt,
          expiresAt: introExpiresAt(m, cfg)!,
          other: side === "seeker" ? { org: p.org.name, label: participantLabel(p) } : { org: s.org.name, label: `${s.org.sector}, ${s.org.country}` },
          brief: { text: m.brief?.text ?? "", agenda: m.brief?.agenda ?? [] },
          mine: mine ? { response: mine.response, reason: mine.reason ?? null, at: mine.at } : null,
          theirs: theirs ? { response: theirs.response, at: theirs.at } : null,
          documents,
        };
      }),
      access: dr.access
        .filter((x) => ids.has(x.seekerId))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 200)
        .map((x) => {
          const s = app(x.seekerId);
          return {
            at: x.at,
            who: x.viewer === "admin" ? "Algotech support, under a grant" : (dr.apps.find((a) => a.id === x.viewer)?.org.name ?? "A counterparty"),
            what: x.item === "profile" ? "Full profile" : x.item === "teaser" ? "Teaser" : (s.documents.find((d) => d.id === x.item)?.kind ?? "A document"),
            action: x.action,
          };
        }),
    };
  }

  return {
    /* ----- the team ----- */

    async board(session: Resolved, eventId: string): Promise<MatchingBoard> {
      const { staff } = await matcher(session, eventId);
      const [{ dr, at }, name] = await Promise.all([load(eventId), repo.eventName(eventId)]);
      const cfg = dr.configs[eventId];
      const app = (id: string) => dr.apps.find((a) => a.id === id)!;
      const last = (m: DrMatch) => [m.at, m.intro?.sentAt, m.intro?.seeker?.at, m.intro?.provider?.at].filter(Boolean).sort().pop()!;
      return {
        event: { id: eventId, name },
        now: at,
        ordering: cfg.ordering,
        missions: cfg.missions.map((m) => ({ id: m.id, code: m.code, name: m.name })),
        pool: dr.apps.filter((a) => a.eventId === eventId && matchable(a)).map((a) => entry(dr, a)),
        matches: [...dr.matches]
          .sort((a, b) => last(b).localeCompare(last(a)))
          .map((m) => ({
            id: m.id,
            seeker: { id: m.seekerId, org: app(m.seekerId).org.name },
            provider: { id: m.providerId, org: app(m.providerId).org.name, label: participantLabel(app(m.providerId)) },
            origin: m.origin,
            stage: matchStage(m, cfg, at),
            decidedAt: m.at,
            sentAt: m.intro?.sentAt ?? null,
            expiresAt: m.intro ? introExpiresAt(m, cfg)! : null,
          })),
        can: { match: true, introduce: drCan(staff, "introduce"), lead: staff.role === "Lead" && staff.active },
      };
    },

    /** One participant's candidates on the other side, in the lead's order, each with its fit. */
    async candidates(session: Resolved, eventId: string, appId: string): Promise<Candidates> {
      await matcher(session, eventId);
      const { dr, at } = await load(eventId);
      const cfg = dr.configs[eventId];
      const who = dr.apps.find((a) => a.id === appId && a.eventId === eventId);
      if (!who) throw new HttpError("not_found", "No such application in this Deal Room.");
      const why = notMatchable(who);
      if (why) throw new HttpError("conflict", `${why}, so it isn't matched yet.`);
      const list: Candidate[] = candidates(dr, cfg, who).map((c) => ({
        other: { id: c.other.id, ref: c.other.ref ?? null, org: c.other.org.name, label: participantLabel(c.other), country: c.other.org.country },
        seekerId: c.seeker.id,
        providerId: c.provider.id,
        fit: fitDetail(c.seeker, c.provider, cfg),
        exclusionHit: c.exclusionHit ?? null,
        needsNote: c.mandatoryMiss.length > 0 || !!c.exclusionHit,
        readiness: c.readiness || null,
        match: c.existing ? { id: c.existing.id, stage: matchStage(c.existing, cfg, at) as MatchStage, note: c.existing.note } : null,
        blocked: blockedPair(dr, c.seeker.id, c.provider.id, cfg) ?? null,
      }));
      return { who: entry(dr, who), candidates: list };
    },

    /** A decision on a pair: approved (with its brief drafted), deferred or rejected, with the reason. */
    async decide(session: Resolved, eventId: string, input: DecideMatchInput, ip: string | null): Promise<DecidedMatch> {
      const { actor } = await matcher(session, eventId);
      const state = await commands.run({
        eventId,
        actor,
        userId: session.user.id,
        ip,
        owned: (s) => {
          for (const id of [input.seekerId, input.providerId]) if (!s.dealRoom.apps.some((a) => a.id === id)) throw new HttpError("not_found", "No such application in this Deal Room.");
        },
        actions: () => [{ type: "dr/matchDecide", seekerId: input.seekerId, providerId: input.providerId, decision: input.decision, note: input.note ?? "", override: input.override || undefined }],
      });
      const m = state.dealRoom.matches.find((x) => x.seekerId === input.seekerId && x.providerId === input.providerId)!;
      return { id: m.id, stage: matchStage(m, state.dealRoom.configs[eventId], nairobiNow(now())) };
    },

    view,

    brief: (session: Resolved, eventId: string, matchId: string, input: BriefInput, ip: string | null) => onMatch(session, eventId, matchId, ip, { type: "dr/brief", matchId, text: input.text, agenda: input.agenda }),

    introduce: (session: Resolved, eventId: string, matchId: string, input: IntroduceInput, ip: string | null) => onMatch(session, eventId, matchId, ip, { type: "dr/introduce", matchId, items: input.items }),

    /* ----- the participant ----- */

    introductions,

    /** Accept or decline; the seeker's acceptance carries the documents it shares. */
    async respond(session: Resolved, slug: string, matchId: string, input: RespondIntroInput, ip: string | null): Promise<MyIntroductions> {
      const { e, side, appId } = await mySide(session, slug, matchId);
      await commands.run({
        eventId: e.id,
        actor: { kind: "applicant", appId },
        userId: session.user.id,
        ip,
        owned: (s) => introduced(s, matchId),
        actions: () => [{ type: "dr/respondIntro", matchId, side, response: input.response, reason: input.reason, consent: side === "seeker" ? (input.consent ?? []) : undefined }],
      });
      return introductions(session, slug);
    },

    /** The seeker shares one document with this counterparty, or withdraws it. */
    async consent(session: Resolved, slug: string, matchId: string, docId: string, granted: boolean, ip: string | null): Promise<MyIntroductions> {
      const { e, pair, side, appId } = await mySide(session, slug, matchId, (x) => x === "seeker");
      if (side !== "seeker") throw new HttpError("forbidden", "Only the business whose document it is decides who sees it.");
      await commands.run({
        eventId: e.id,
        actor: { kind: "applicant", appId },
        userId: session.user.id,
        ip,
        owned: (s) => introduced(s, matchId),
        actions: () => [{ type: "dr/consent", seekerId: pair.seekerId, providerId: pair.providerId, docId, granted }],
      });
      return introductions(session, slug);
    },

    /** The counterparty opens the seeker's full profile: the rules check it may, and log it. */
    async profile(session: Resolved, slug: string, matchId: string, ip: string | null): Promise<SeekerProfile> {
      const { e, pair, side, appId } = await mySide(session, slug, matchId, (x) => x === "provider");
      if (side !== "provider") throw new HttpError("forbidden", "This is your own profile.");
      const state = await commands.run({
        eventId: e.id,
        actor: { kind: "applicant", appId },
        userId: session.user.id,
        ip,
        owned: (s) => introduced(s, matchId),
        actions: () => [{ type: "dr/access", seekerId: pair.seekerId, item: "profile", viewer: pair.providerId, action: "view" }],
      });
      const s = state.dealRoom.apps.find((a) => a.id === pair.seekerId)!;
      return {
        org: s.org.name,
        sector: s.org.sector,
        country: s.org.country,
        website: s.org.website || null,
        ask: s.ask ? `${compact(s.ask.amount, s.ask.currency)} ${s.ask.instrument.toLowerCase()}, ${s.ask.stage.toLowerCase()}` : "–",
        useOfFunds: s.ask?.useOfFunds ?? "–",
        traction: [s.traction?.revenueBand, s.traction?.customers, s.traction?.metrics].filter(Boolean).join("; ") || "–",
        decisionMaker: `${s.decisionMaker.name}, ${s.decisionMaker.title}`,
        contact: [s.decisionMaker.email, s.decisionMaker.phone].filter(Boolean).join(", "),
        openedAt: state.dealRoom.access[0].at,
      };
    },

    /**
     * The counterparty opens one document: the rules check both accepted and the seeker consents (and, to download,
     * that the seeker allows it), and log the opening; then a two-minute link to a stamped copy.
     */
    async openDocument(session: Resolved, slug: string, matchId: string, docId: string, action: "view" | "download", ip: string | null): Promise<SharedLink> {
      const { e, pair, side, appId } = await mySide(session, slug, matchId, (x) => x === "provider");
      if (side !== "provider") throw new HttpError("forbidden", "This is your own document: it's on your application.");
      const file = await repo.fileOf(docId, pair.seekerId);
      if (!file) throw new HttpError("conflict", "This document has no file to open: it is demo data.");
      if (file.state === "rejected") throw new HttpError("conflict", "This file failed its virus scan and can't be opened.");
      if (file.deletedAt) throw new HttpError("conflict", "This file was deleted at its retention date.");
      if (file.state !== "clean" && !allowUnscanned) throw new HttpError("conflict", "This file is waiting for its virus scan. Try again in a few minutes.");
      const stamps = stampable(file.contentType) && file.size <= STAMP_MAX_BYTES;
      // a file that can't be stamped can't be shown in a browser either: it is downloaded, if the seeker allows that
      const as = stamps ? action : "download";
      if (stamps) {
        // a damaged or password-protected file is refused here, with the reason, before the opening is logged
        const bytes = await storage.read(file.storageKey);
        if (!bytes) throw new HttpError("conflict", "This document's file is missing. Ask the Deal Room team.");
        try {
          await checkStampable(bytes, file.contentType);
        } catch (err) {
          if (err instanceof StampRefused) throw new HttpError("conflict", err.message);
          throw err;
        }
      }
      const state = await commands.run({
        eventId: e.id,
        actor: { kind: "applicant", appId },
        userId: session.user.id,
        ip,
        owned: (s) => introduced(s, matchId),
        actions: () => [{ type: "dr/access", seekerId: pair.seekerId, item: docId, viewer: pair.providerId, action: as }],
      });
      const viewer = state.dealRoom.apps.find((a) => a.id === pair.providerId)!;
      const at = state.dealRoom.access[0].at;
      const base = file.name.replace(/\.[a-z0-9]{2,5}$/i, "");
      const grant: Grant = {
        f: file.id,
        o: pair.seekerId,
        n: stamps ? `${base} (for ${viewer.org.name}).pdf` : file.name,
        d: as === "view" ? "inline" : "attachment",
        m: stamps ? `Confidential: shared with ${viewer.decisionMaker.name}, ${viewer.org.name}, ${fmtStamp(at)}` : "",
        t: stamps ? `${e.name} Deal Room. Shared with ${viewer.org.name} under the Deal Room's NDA on ${fmtStamp(at)}; not to be forwarded.` : "",
        e: now().getTime() + LINK_MS,
      };
      const payload = Buffer.from(JSON.stringify(grant)).toString("base64url");
      return { url: `/v1/introductions/files/${payload}.${sign(payload)}`, expiresAt: new Date(grant.e).toISOString() };
    },

    /** The copy behind a shared link: checked, read, stamped when it can be, and answered. The link is the permission. */
    async shared(token: string): Promise<{ bytes: Uint8Array; name: string; contentType: string; disposition: "inline" | "attachment" }> {
      const [payload, mac] = token.split(".");
      if (!payload || !mac || !/^[0-9a-f]{64}$/.test(mac) || !sameDigest(mac, sign(payload))) throw new HttpError("not_found", "This link isn't valid.");
      const g = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Grant;
      if (g.e < now().getTime()) throw new HttpError("not_found", "This link has expired. Open the document again from the introduction.");
      const file = await repo.fileOf(g.f, g.o);
      if (!file || file.deletedAt || file.state === "rejected") throw new HttpError("not_found", "This document is no longer available.");
      const bytes = await storage.read(file.storageKey);
      if (!bytes) throw new HttpError("not_found", "This document is no longer available.");
      if (!g.m) return { bytes, name: g.n, contentType: file.contentType, disposition: g.d };
      try {
        return { bytes: await stamp(bytes, file.contentType, { mark: g.m, footer: g.t }), name: g.n, contentType: "application/pdf", disposition: g.d };
      } catch (err) {
        if (err instanceof StampRefused) throw new HttpError("conflict", err.message);
        throw err;
      }
    },
  };
}
export type MatchingService = ReturnType<typeof createMatchingService>;
