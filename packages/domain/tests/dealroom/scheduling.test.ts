/**
 * Scheduling (M3.2): every refusal says why; a participant answers only for its own side; a lapsed proposal and
 * the reminders before a confirmed meeting are the server's jobs, each done once; auto-propose drafts a schedule
 * for 150 pairs inside the rules, quickly, with no room, table or person booked twice.
 */
import { describe, expect, test } from "vitest";
import { apply } from "@excursia/domain/core/reducer";
import { fixedCtx, type Actor } from "@excursia/domain/ctx";
import { bothAccepted, confirmBy, dueMeetingLapses, dueReminders, lapsed, matchable, occupies, readyToSchedule, validateDealRoom } from "@excursia/domain/dealroom/logic";
import type { DrMatch } from "@excursia/domain/dealroom/types";
import { seed } from "@excursia/domain/seed";
import { addMinutes } from "@excursia/domain/time";
import type { AppState } from "@excursia/domain/types";

const dr = seed.dealRoom;
const cfg = Object.values(dr.configs)[0];
const ops: Actor = { kind: "staff", id: "st_ops1" };
const reviewer: Actor = { kind: "staff", id: "st_rev1" };
const system: Actor = { kind: "system" };
const run = (action: unknown, actor: Actor | null, state: AppState = seed, now = state.dealRoom.clock) => apply({ ...state, dealRoom: { ...state.dealRoom, clock: now } }, action as never, fixedCtx(now, actor));
const pairOf = (meetingId: string, state = seed) => {
  const mt = state.dealRoom.meetings.find((m) => m.id === meetingId)!;
  return state.dealRoom.matches.find((m) => m.id === mt.matchId)!;
};
const as = (appId: string): Actor => ({ kind: "applicant", appId });

/** An open proposal the seeker confirmed and the counterparty hasn't. */
const open = dr.meetings.find((m) => m.status === "Proposed" && !lapsed(m, cfg, dr.clock) && m.confirm.seeker && !m.confirm.provider)!;
const confirmed = dr.meetings.find((m) => m.status === "Confirmed" && m.start > dr.clock)!;
const ready = readyToSchedule(dr, cfg)[0];

describe("scheduling refusals say why", () => {
  test("only operations, the lead and coordinators schedule", () => {
    expect(run({ type: "dr/propose", req: { matchId: ready.id, roomId: "r_dr1", table: 1, start: "2027-02-18 16:00" } }, reviewer).refusal).toBe("Your role doesn't schedule meetings");
  });

  test("a clash names what is in the way", () => {
    const r = run({ type: "dr/propose", req: { matchId: ready.id, roomId: confirmed.roomId, table: confirmed.table, start: confirmed.start } }, ops);
    expect(r.refusal).toMatch(/is booked \d\d:\d\d to \d\d:\d\d/);
  });

  test("a pair with a meeting isn't proposed again", () => {
    const r = run({ type: "dr/propose", req: { matchId: confirmed.matchId, roomId: "r_dr1", table: 1, start: "2027-02-18 16:00" } }, ops);
    expect(r.refusal).toBe("This pair already has a meeting");
  });

  test("a cancellation and a declined move need a reason", () => {
    expect(run({ type: "dr/cancelMeeting", meetingId: confirmed.id, reason: " " }, ops).refusal).toBe("Say why it is cancelled");
    const ch = dr.meetings.find((m) => m.status === "Change requested")!;
    expect(run({ type: "dr/declineChange", meetingId: ch.id, reason: "" }, ops).refusal).toBe("Say why, for both parties");
    // an older request names no time: the team moves the meeting itself
    expect(run({ type: "dr/acceptChange", meetingId: ch.id }, ops).refusal).toBe("This request names no time: move the meeting to a slot that suits, or decline the request");
    const m = pairOf(confirmed.id);
    const asked = run({ type: "dr/requestChange", meetingId: confirmed.id, side: "seeker", reason: "A flight change", start: "2027-02-18 16:00" }, as(m.seekerId));
    expect(run({ type: "dr/acceptChange", meetingId: confirmed.id }, ops, asked.state).refusal).toBe("The other party hasn't agreed to this move yet");
  });
});

describe("a participant confirms and moves its own meetings", () => {
  test("confirming for the other side is refused; the second confirmation books it and both are told", () => {
    const m = pairOf(open.id);
    expect(run({ type: "dr/confirm", meetingId: open.id, side: "provider" }, as(m.seekerId)).refusal).toBe("You can answer only for your own side of a meeting");
    expect(run({ type: "dr/confirm", meetingId: open.id, side: "seeker" }, as(m.seekerId)).refusal).toBe("You've already confirmed this slot");
    const r = run({ type: "dr/confirm", meetingId: open.id, side: "provider" }, as(m.providerId));
    expect(r.refusal).toBeUndefined();
    const after = r.state.dealRoom.meetings.find((x) => x.id === open.id)!;
    expect(after.status).toBe("Confirmed");
    const told = r.state.dealRoom.outbox.slice(0, 2);
    expect(told.map((x) => x.to).sort()).toEqual([m.seekerId, m.providerId].sort());
    expect(told.every((x) => x.subject.startsWith("Deal Room meeting confirmed") && x.link.endsWith("?meetings=1"))).toBe(true);
    expect(run({ type: "dr/confirm", meetingId: open.id, side: "provider" }, as(m.providerId), r.state).refusal).toBe("This meeting is already confirmed");
  });

  test("a lapsed proposal can't be confirmed", () => {
    const m = pairOf(open.id);
    const late = addMinutes(confirmBy(open, cfg), 1);
    expect(run({ type: "dr/confirm", meetingId: open.id, side: "provider" }, as(m.providerId), seed, late).refusal).toMatch(/^This proposal lapsed unconfirmed/);
  });

  test("a move: asked with a free time and a reason, agreed by the other side, accepted by operations", () => {
    const m = pairOf(confirmed.id);
    const ask = { type: "dr/requestChange", meetingId: confirmed.id, side: "seeker", reason: "Our CEO lands at noon" };
    expect(run({ ...ask, reason: " ", start: "2027-02-18 16:00" }, as(m.seekerId)).refusal).toBe("Say why, for the other party");
    expect(run({ ...ask, start: confirmed.start }, as(m.seekerId)).refusal).toBe("Choose a different time");
    expect(run({ ...ask, start: "2027-02-18 23:00" }, as(m.seekerId)).refusal).toBe("That time isn't free for both of you, or no table is open then");
    const asked = run({ ...ask, start: "2027-02-18 16:00" }, as(m.seekerId));
    expect(asked.refusal).toBeUndefined();
    expect(run({ type: "dr/answerChange", meetingId: confirmed.id, side: "seeker", agree: true }, as(m.seekerId), asked.state).refusal).toBe("You asked for this move; the other party answers it");
    const agreed = run({ type: "dr/answerChange", meetingId: confirmed.id, side: "provider", agree: true }, as(m.providerId), asked.state);
    expect(agreed.refusal).toBeUndefined();
    const done = run({ type: "dr/acceptChange", meetingId: confirmed.id }, ops, agreed.state);
    expect(done.refusal).toBeUndefined();
    expect(done.state.dealRoom.meetings.find((x) => x.id === confirmed.id)).toMatchObject({ start: "2027-02-18 16:00", status: "Confirmed" });
  });
});

describe("the server's jobs", () => {
  test("a lapsed proposal is told to both sides and operations, once; only the system notes it", () => {
    const late = addMinutes(confirmBy(open, cfg), 1);
    const at = { ...seed, dealRoom: { ...dr, clock: late } };
    expect(dueMeetingLapses(at.dealRoom, cfg, late).map((m) => m.id)).toContain(open.id);
    expect(run({ type: "dr/meetingLapse", meetingId: open.id }, ops, at).refusal).toBe("Lapses are noted by the system");
    expect(run({ type: "dr/meetingLapse", meetingId: confirmed.id }, system, at).refusal).toBe("This proposal hasn't lapsed");
    const r = run({ type: "dr/meetingLapse", meetingId: open.id }, system, at);
    expect(r.refusal).toBeUndefined();
    const m = pairOf(open.id);
    const told = r.state.dealRoom.outbox.slice(0, 3);
    expect(told.find((x) => x.to === m.seekerId)!.subject).toMatch(/lapsed: the other party didn't confirm in time/);
    expect(told.find((x) => x.to === m.providerId)!.subject).toMatch(/lapsed before you confirmed it/);
    expect(told.some((x) => x.link === "/dealroom/meetings")).toBe(true);
    expect(run({ type: "dr/meetingLapse", meetingId: open.id }, system, r.state).refusal).toBe("This lapse was already noted");
    expect(dueMeetingLapses(r.state.dealRoom, cfg, late).map((x) => x.id)).not.toContain(open.id);
    // the released slot holds nothing now
    expect(occupies(r.state.dealRoom.meetings.find((x) => x.id === open.id)!, cfg, late)).toBe(false);
  });

  test("reminders go a day before and half an hour before, once each", () => {
    const dayBefore = addMinutes(confirmed.start, -23 * 60);
    expect(dueReminders(dr, cfg, dayBefore)).toContainEqual({ meetingId: confirmed.id, kind: "day" });
    expect(run({ type: "dr/remindMeeting", meetingId: confirmed.id, kind: "soon" }, system, seed, dayBefore).refusal).toBe("This reminder isn't due");
    const day = run({ type: "dr/remindMeeting", meetingId: confirmed.id, kind: "day" }, system, seed, dayBefore);
    expect(day.refusal).toBeUndefined();
    expect(day.state.dealRoom.outbox[0].subject).toMatch(/^Reminder: your Deal Room meeting with /);
    expect(run({ type: "dr/remindMeeting", meetingId: confirmed.id, kind: "day" }, system, day.state, dayBefore).refusal).toBe("This reminder isn't due");
    const soonAt = addMinutes(confirmed.start, -20);
    expect(dueReminders(day.state.dealRoom, cfg, soonAt)).toContainEqual({ meetingId: confirmed.id, kind: "soon" });
    const soon = run({ type: "dr/remindMeeting", meetingId: confirmed.id, kind: "soon" }, system, day.state, soonAt);
    expect(soon.state.dealRoom.outbox[0]).toMatchObject({ channel: "Email and SMS" });
    expect(soon.state.dealRoom.outbox[0].subject).toMatch(/check in with your badge at the Deal Room desk$/);
    expect(dueReminders(soon.state.dealRoom, cfg, soonAt).some((x) => x.meetingId === confirmed.id)).toBe(false);
  });
});

describe("auto-propose", () => {
  test("drafts a slot for each of 150 ready pairs within the rules, quickly, with no clash", () => {
    // before the summit, with no meetings yet: 150 accepted pairs among the seekers and verified counterparties
    const seekers = dr.apps.filter((a) => a.type === "seeker" && matchable(a));
    const providers = dr.apps.filter((a) => a.type === "provider" && a.verification?.state === "Verified" && matchable(a));
    const template = dr.matches.find(bothAccepted)!;
    const taken = new Set(dr.matches.map((m) => `${m.seekerId}|${m.providerId}`));
    const extra: DrMatch[] = [];
    for (let i = 0; extra.length < 150 && i < seekers.length * providers.length; i++) {
      const s = seekers[i % seekers.length];
      const p = providers[(i + Math.floor(i / seekers.length)) % providers.length];
      if (taken.has(`${s.id}|${p.id}`) || extra.filter((x) => x.seekerId === s.id).length >= 4) continue;
      taken.add(`${s.id}|${p.id}`);
      extra.push({ ...template, id: `mx_auto_${extra.length}`, seekerId: s.id, providerId: p.id });
    }
    expect(extra.length).toBe(150);
    const clock = "2027-02-10 09:00";
    const base: AppState = { ...seed, dealRoom: { ...dr, clock, meetings: [], sessions: [], matches: [...dr.matches.filter((m) => !bothAccepted(m)), ...extra] } };
    expect(readyToSchedule(base.dealRoom, cfg).length).toBe(150);
    const t0 = performance.now();
    const r = run({ type: "dr/autoPropose", limit: 500 }, ops, base, clock);
    const ms = performance.now() - t0;
    expect(r.refusal).toBeUndefined();
    expect(r.state.dealRoom.meetings.length).toBe(150);
    expect(ms).toBeLessThan(10_000);
    expect(validateDealRoom(r.state).filter((p) => /share|two meetings/i.test(p))).toEqual([]);
    // nothing left to draft, and saying so
    expect(run({ type: "dr/autoPropose", limit: 500 }, ops, r.state, clock).refusal).toBe("Every pair both parties accepted already has a meeting");
  });
});
