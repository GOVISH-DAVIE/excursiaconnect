/**
 * Sessions say why they refuse (M3.3), as the meetings do: the role, a format with no host, an answer for someone
 * else or given twice, a cancellation with no reason, an outcome for someone not marked present. A move keeps
 * everyone who accepted: it is refused onto a meeting of theirs.
 */
import { describe, expect, test } from "vitest";
import { apply } from "@excursia/domain/core/reducer";
import { fixedCtx, type Actor } from "@excursia/domain/ctx";
import { acceptProblems } from "@excursia/domain/dealroom/sessions";
import { seed } from "@excursia/domain/seed";
import type { AppState } from "@excursia/domain/types";

const dr = seed.dealRoom;
const coord: Actor = { kind: "staff", id: "st_coord1" };
const reviewer: Actor = { kind: "staff", id: "st_rev1" };
const run = (action: unknown, actor: Actor | null, state: AppState = seed) => apply(state, action as never, fixedCtx(state.dealRoom.clock, actor));
const ahead = dr.sessions.find((s) => s.id === "ses_09")!;
const guest = ahead.invitees.find((id) => !ahead.responses[id] && !acceptProblems(dr, ahead, id).length)!;
const draft = { eventId: "ev_ca3", format: "Deal advisory and readiness clinic", title: "Data-room clinic", start: "2027-02-18 16:00", end: "2027-02-18 17:00", roomId: "r_dr9" };

describe("session refusals say why", () => {
  test("planning: the role, and a format that needs a host", () => {
    expect(run({ type: "dr/sessionSave", draft }, reviewer).refusal).toBe("Your role doesn't plan sessions");
    expect(run({ type: "dr/sessionSave", draft: { ...draft, format: "Investment opportunity presentation" } }, coord).refusal).toBe("This format needs a host");
    expect(run({ type: "dr/sessionSave", draft }, coord).refusal).toBeUndefined();
  });

  test("answers: only for oneself, and not the same one twice", () => {
    const other = ahead.invitees.find((id) => id !== guest)!;
    expect(run({ type: "dr/sessionRespond", sessionId: ahead.id, appId: other, answer: "Accepted" }, { kind: "applicant", appId: guest }).refusal).toBe("You can answer only for yourself");
    const yes = run({ type: "dr/sessionRespond", sessionId: ahead.id, appId: guest, answer: "Accepted" }, { kind: "applicant", appId: guest });
    expect(yes.refusal).toBeUndefined();
    expect(run({ type: "dr/sessionRespond", sessionId: ahead.id, appId: guest, answer: "Accepted" }, { kind: "applicant", appId: guest }, yes.state).refusal).toBe("You've already accepted");
    expect(run({ type: "dr/sessionRespond", sessionId: "ses_nope", appId: guest, answer: "Accepted" }, { kind: "applicant", appId: guest }).refusal).toBe("No such session");
  });

  test("a move onto a meeting of someone who accepted is refused, naming them", () => {
    const yes = run({ type: "dr/sessionRespond", sessionId: ahead.id, appId: guest, answer: "Accepted" }, { kind: "applicant", appId: guest }).state;
    const people = new Set(Object.entries(yes.dealRoom.sessions.find((s) => s.id === ahead.id)!.responses).filter(([, r]) => r.answer === "Accepted").map(([id]) => id));
    const meeting = dr.meetings.find((m) => m.status === "Confirmed" && m.start > dr.clock && m.start.slice(0, 10) !== ahead.start.slice(0, 10) && dr.matches.some((x) => x.id === m.matchId && (people.has(x.seekerId) || people.has(x.providerId))))!;
    expect(meeting).toBeDefined();
    const r = run({ type: "dr/sessionSave", draft: { id: ahead.id, eventId: "ev_ca3", format: ahead.format, title: ahead.title, start: meeting.start, end: meeting.end, roomId: ahead.roomId, host: ahead.host } }, coord, yes);
    expect(r.refusal).toMatch(/accepted it and has a meeting \d\d:\d\d to \d\d:\d\d/);
  });

  test("a cancellation needs its reason; an outcome needs the person present", () => {
    expect(run({ type: "dr/sessionCancel", sessionId: ahead.id, reason: " " }, coord).refusal).toBe("Say why, for everyone attending");
    const live = dr.sessions.find((s) => s.start <= dr.clock && dr.clock < s.end)!;
    const absent = live.invitees.find((id) => !live.attended.includes(id))!;
    expect(run({ type: "dr/sessionOutcome", sessionId: live.id, appId: absent, category: "No fit", note: "" }, coord).refusal).toBe("Mark them present first");
    expect(run({ type: "dr/sessionAttend", sessionId: ahead.id, appId: guest, present: true }, coord).refusal).toBe("Attendance opens half an hour before the start, on the day");
  });
});
