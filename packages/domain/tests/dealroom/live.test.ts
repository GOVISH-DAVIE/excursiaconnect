/**
 * The summit day (M3.4): starting a meeting, its outcome and refilling a no-show say why they refuse; an outcome
 * on record is replaced only from the paper sheet with a reason; the 19:00 report goes to the lead once a day.
 */
import { describe, expect, test } from "vitest";
import { apply } from "@excursia/domain/core/reducer";
import { fixedCtx, type Actor } from "@excursia/domain/ctx";
import { seed } from "@excursia/domain/seed";
import { addMinutes } from "@excursia/domain/time";
import type { AppState } from "@excursia/domain/types";

const dr = seed.dealRoom;
const ops: Actor = { kind: "staff", id: "st_ops1" };
const oversight: Actor = { kind: "staff", id: "st_mom1" };
const system: Actor = { kind: "system" };
const run = (action: unknown, actor: Actor | null, state: AppState = seed, now = state.dealRoom.clock) => apply({ ...state, dealRoom: { ...state.dealRoom, clock: now } }, action as never, fixedCtx(now, actor));
const today = dr.clock.slice(0, 10);
/** A confirmed meeting later today, and one held already. */
const later = dr.meetings.find((m) => m.status === "Confirmed" && m.start.startsWith(today) && m.start > addMinutes(dr.clock, 60))!;
const held = dr.meetings.find((m) => m.status === "Held" && m.outcome)!;

describe("the summit day's rules say why", () => {
  test("starting a meeting: the role, and not long before its time", () => {
    expect(run({ type: "dr/startMeeting", meetingId: later.id }, oversight).refusal).toBe("Your role doesn't run the live board");
    expect(run({ type: "dr/startMeeting", meetingId: later.id }, ops).refusal).toMatch(/a meeting is marked under way from 15 minutes before$/);
    const started = run({ type: "dr/startMeeting", meetingId: later.id }, ops, seed, addMinutes(later.start, -10));
    expect(started.refusal).toBeUndefined();
    expect(run({ type: "dr/startMeeting", meetingId: later.id }, ops, started.state, addMinutes(later.start, -5)).refusal).toBe("This meeting is already under way");
  });

  test("an outcome: the role, its time, its category, a next action's owner", () => {
    const at = addMinutes(later.start, 25);
    expect(run({ type: "dr/outcome", meetingId: later.id, attendance: "Held", outcome: { category: "No fit", clientId: "c1" } }, oversight, seed, at).refusal).toBe("Your role doesn't record outcomes");
    expect(run({ type: "dr/outcome", meetingId: later.id, attendance: "Held", outcome: { category: "No fit", clientId: "c1" } }, ops).refusal).toMatch(/its outcome is recorded from half an hour before$/);
    expect(run({ type: "dr/outcome", meetingId: later.id, attendance: "Held" }, ops, seed, at).refusal).toBe("Choose the outcome");
    expect(run({ type: "dr/outcome", meetingId: later.id, attendance: "Held", outcome: { category: "Follow-up meeting", nextAction: "Send the deck", clientId: "c1" } }, ops, seed, at).refusal).toBe("A next action needs its owner");
    const r = run({ type: "dr/outcome", meetingId: later.id, attendance: "Held", outcome: { category: "Follow-up meeting", nextAction: "Send the deck", owner: "st_lead", due: "2027-02-23", clientId: "c1" } }, ops, seed, at);
    expect(r.refusal).toBeUndefined();
    expect(r.state.dealRoom.meetings.find((m) => m.id === later.id)!.status).toBe("Held");
    expect(r.state.dealRoom.opportunities.some((o) => o.meetingId === later.id)).toBe(true);
  });

  test("an outcome on record is replaced only from the paper sheet, with a reason, logged", () => {
    const again = { type: "dr/outcome", meetingId: held.id, attendance: "Held", outcome: { category: "No fit", clientId: "c2" } };
    expect(run(again, ops).refusal).toBe("This meeting already has an outcome: give the reason the paper sheet replaces it");
    const r = run({ ...again, paper: "The tablet was lost in the outage" }, ops);
    expect(r.refusal).toBeUndefined();
    expect(r.state.dealRoom.exceptions[0]).toMatchObject({ kind: "Paper entry over an outcome" });
  });

  test("a refill: only a no-show's slot, for a pair waiting for one", () => {
    expect(run({ type: "dr/refill", meetingId: later.id, matchId: later.matchId }, ops).refusal).toBe("Only a no-show's slot is offered again");
    const noShow = dr.meetings.find((m) => m.status === "No-show")!;
    expect(run({ type: "dr/refill", meetingId: noShow.id, matchId: later.matchId }, ops).refusal).toBe("That pair isn't waiting for a slot");
  });

  test("the 19:00 report: the system's, at 19:00, once a day", () => {
    const report = { type: "dr/dailyReport", eventId: "ev_ca3", day: today };
    expect(run(report, ops, seed, `${today} 19:05`).refusal).toBe("The daily report is sent by the system");
    expect(run(report, system, seed, `${today} 18:59`).refusal).toBe("The daily report goes at 19:00");
    expect(run({ ...report, day: "2027-03-01" }, system, seed, "2027-03-01 19:30").refusal).toBe("That day isn't in summit week");
    const sent = run(report, system, seed, `${today} 19:00`);
    expect(sent.refusal).toBeUndefined();
    expect(sent.state.dealRoom.outbox[0]).toMatchObject({ to: "st_lead", link: `/dealroom/reports?day=${today}` });
    expect(sent.state.dealRoom.outbox[0].subject).toMatch(/^Daily Deal Room report, /);
    expect(run(report, system, sent.state, `${today} 19:01`).refusal).toBe("That day's report was already sent");
  });
});
