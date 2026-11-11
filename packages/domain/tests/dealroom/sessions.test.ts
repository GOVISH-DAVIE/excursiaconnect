import { expect, test } from "vitest";
import { seed } from "@excursia/domain/seed";
import { reducer } from "../helpers";
import { slotProblems, validateDealRoom, sessionOpenOutcomes } from "@excursia/domain/dealroom/logic";
import { acceptProblems, invitable, sessionProblems } from "@excursia/domain/dealroom/sessions";
import type { AppState } from "@excursia/domain/types";
const ok = (c: unknown, m: string) => test(m, () => expect(c).toBeTruthy());
const act = (s: AppState, a: unknown) => reducer(s, a as never);
let s: AppState = seed;
const dr0 = s.dealRoom;
ok(validateDealRoom(s).length === 0, "seed invariants");
ok(dr0.sessions.length === 16, "16 sessions seeded: " + dr0.sessions.length);
const formats = new Set(dr0.sessions.map((x) => x.format));
ok(formats.size === 11, "all eleven formats in the programme: " + formats.size);
ok(dr0.sessions.some((x) => x.start <= dr0.clock && dr0.clock < x.end), "one session in progress at the demo clock");
ok(dr0.sessions.some((x) => x.end <= dr0.clock && sessionOpenOutcomes(x).length > 0), "a held session still has outcomes to record");

// plan as the coordinator
s = act(s, { type: "dr/actAs", staffId: "st_coord1" });
const host = s.dealRoom.apps.find((a) => a.id === "dr_ch02")!;
const draft = { eventId: "ev_ca3", format: "Government challenge session", title: "Water metering: second round", start: "2027-02-18 15:30", end: "2027-02-18 16:30", roomId: "r_dr8", host: host.id };
ok(sessionProblems(s, draft as never).length === 0, "draft is clean: " + sessionProblems(s, draft as never));
ok(sessionProblems(s, { ...draft, roomId: "r_dr1" } as never).some((p) => p.includes("presentation area")), "a meeting room is refused for a session");
ok(sessionProblems(s, { ...draft, start: "2027-02-16 09:00", end: "2027-02-16 10:00" } as never).some((p) => p.includes("passed")), "a past time is refused");
ok(sessionProblems(s, { ...draft, start: "2027-02-17 14:00", end: "2027-02-17 15:00" } as never).some((p) => p.includes("holds") || p.includes("is in")), "room or host double-booking refused");
const before = s.dealRoom.sessions.length;
s = act(s, { type: "dr/sessionSave", draft });
const ses = s.dealRoom.sessions[s.dealRoom.sessions.length - 1];
ok(s.dealRoom.sessions.length === before + 1 && ses.owner === "st_coord1", "coordinator planned a session");
ok(s.dealRoom.outbox.some((m) => m.to === host.id && m.subject.startsWith("You are hosting")), "host told");

// invite: only qualified or verified; a seeker who has not paid cannot be invited
const owed = s.dealRoom.apps.find((a) => a.type === "seeker" && a.fee && !a.fee.paid && !a.fee.waived)!;
const ready = s.dealRoom.apps.filter((a) => a.type === "seeker" && invitable(a) && a.id !== host.id).slice(0, 3);
s = act(s, { type: "dr/sessionInvite", sessionId: ses.id, appIds: [owed.id, ...ready.map((a) => a.id)] });
const inv = s.dealRoom.sessions.find((x) => x.id === ses.id)!;
ok(!inv.invitees.includes(owed.id) && ready.every((a) => inv.invitees.includes(a.id)), "unpaid seeker skipped, ready ones invited");
ok(ready.every((a) => s.dealRoom.outbox.some((m) => m.to === a.id && m.subject.startsWith("Invitation"))), "invitations sent");

// a participant accepts, then a meeting cannot be booked over the session
const p1 = ready[0];
s = act(s, { type: "dr/sessionRespond", sessionId: ses.id, appId: p1.id, answer: "Accepted" });
ok(s.dealRoom.sessions.find((x) => x.id === ses.id)!.responses[p1.id]?.answer === "Accepted", "accepted");
const match = s.dealRoom.matches.find((m) => (m.seekerId === p1.id) && m.intro?.seeker?.response === "Accepted" && m.intro?.provider?.response === "Accepted");
if (match) {
  const sp = slotProblems(s, { matchId: match.id, roomId: "r_dr5", table: 1, start: "2027-02-18 15:50" });
  ok(sp.clashes.some((c) => c.includes("is in the session")), "meeting over an accepted session is refused: " + sp.clashes.join("; "));
} else ok(true, "no accepted match to test against");

// a participant with a meeting at the time cannot accept
const busyMeeting = s.dealRoom.meetings.find((m) => m.start.startsWith("2027-02-17") && m.status === "Confirmed")!;
const busyMatch = s.dealRoom.matches.find((m) => m.id === busyMeeting.matchId)!;
const busy = s.dealRoom.apps.find((a) => a.id === busyMatch.seekerId)!;
const clashDraft = { eventId: "ev_ca3", format: "Deal advisory and readiness clinic", title: "Clash test", start: busyMeeting.start, end: busyMeeting.end, roomId: s.dealRoom.sessions.some((x) => x.roomId === "r_dr8" && x.start <= busyMeeting.start && busyMeeting.start < x.end) ? "r_dr9" : "r_dr8" };
s = act(s, { type: "dr/sessionSave", draft: clashDraft });
const cs = s.dealRoom.sessions.find((x) => x.title === "Clash test");
if (cs) {
  s = act(s, { type: "dr/sessionInvite", sessionId: cs.id, appIds: [busy.id] });
  ok(acceptProblems(s.dealRoom, s.dealRoom.sessions.find((x) => x.id === cs.id)!, busy.id).some((p) => p.includes("meeting")), "accept refused over a meeting");
  const s2 = act(s, { type: "dr/sessionRespond", sessionId: cs.id, appId: busy.id, answer: "Accepted" });
  ok(!s2.dealRoom.sessions.find((x) => x.id === cs.id)!.responses[busy.id], "reducer refuses the clashing accept");
} else ok(false, "clash session not planned: " + sessionProblems(s, clashDraft as never));

// oversight cannot plan; attendance and outcomes on the session in progress
let o = act(s, { type: "dr/actAs", staffId: "st_mom1" });
o = act(o, { type: "dr/sessionSave", draft: { ...draft, title: "Oversight try", start: "2027-02-18 16:30", end: "2027-02-18 17:00" } });
ok(!o.dealRoom.sessions.some((x) => x.title === "Oversight try"), "oversight cannot plan");
const live = s.dealRoom.sessions.find((x) => x.start <= s.dealRoom.clock && s.dealRoom.clock < x.end)!;
const coming = Object.entries(live.responses).find(([id, r]) => r.answer === "Accepted" && !live.attended.includes(id))?.[0];
if (coming) {
  s = act(s, { type: "dr/sessionAttend", sessionId: live.id, appId: coming, present: true });
  ok(s.dealRoom.sessions.find((x) => x.id === live.id)!.attended.includes(coming), "attendance taken in progress");
  const s3 = act(s, { type: "dr/sessionOutcome", sessionId: live.id, appId: coming, category: "Follow-up meeting", note: "" });
  ok(!s3.dealRoom.sessions.find((x) => x.id === live.id)!.outcomes.some((x) => x.appId === coming), "outcome needs a next step");
  s = act(s, { type: "dr/sessionOutcome", sessionId: live.id, appId: coming, category: "Follow-up meeting", note: "Second meeting day 4" });
  ok(s.dealRoom.sessions.find((x) => x.id === live.id)!.outcomes.some((x) => x.appId === coming && x.category === "Follow-up meeting"), "outcome recorded");
} else ok(true, "nobody waiting at the live session");
// a planned session cannot take attendance yet
const later = s.dealRoom.sessions.find((x) => x.start.startsWith("2027-02-18") && x.invitees.length)!;
const s4 = act(s, { type: "dr/sessionAttend", sessionId: later.id, appId: later.invitees[0], present: true });
ok(!s4.dealRoom.sessions.find((x) => x.id === later.id)!.attended.length, "no attendance before the day");
// cancel: needs a reason, tells those who accepted
s = act(s, { type: "dr/sessionCancel", sessionId: ses.id, reason: "" });
ok(!s.dealRoom.sessions.find((x) => x.id === ses.id)!.cancelled, "cancel needs a reason");
s = act(s, { type: "dr/sessionCancel", sessionId: ses.id, reason: "The utility's board meets that afternoon." });
ok(!!s.dealRoom.sessions.find((x) => x.id === ses.id)!.cancelled && s.dealRoom.outbox.some((m) => m.to === p1.id && m.subject.startsWith("Cancelled")), "cancelled and told");
ok(validateDealRoom(s).length === 0, "invariants hold after: " + validateDealRoom(s).slice(0, 2));
