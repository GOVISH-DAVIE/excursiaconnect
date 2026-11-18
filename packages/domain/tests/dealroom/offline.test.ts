/**
 * Offline on the day (M3.5): outcomes recorded on phones without a connection sync when they come back. Each record
 * is recorded once; a record sent again is a duplicate; a different record for a meeting already on file is kept as
 * a conflict for the lead, never decided by which phone came back first; the lead's choice is applied and logged;
 * the outage is logged with what its sync did, and the lead is told.
 */
import { describe, expect, test } from "vitest";
import { apply } from "@excursia/domain/core/reducer";
import { fixedCtx, type Actor } from "@excursia/domain/ctx";
import { syncVerdict } from "@excursia/domain/dealroom/meetings";
import { seed } from "@excursia/domain/seed";
import { addMinutes } from "@excursia/domain/time";
import type { AppState } from "@excursia/domain/types";

const dr = seed.dealRoom;
const ops: Actor = { kind: "staff", id: "st_ops1" };
const coord: Actor = { kind: "staff", id: "st_coord1" };
const lead: Actor = { kind: "staff", id: "st_lead" };
const run = (action: unknown, actor: Actor | null, state: AppState = seed, now = state.dealRoom.clock) => apply({ ...state, dealRoom: { ...state.dealRoom, clock: now } }, action as never, fixedCtx(now, actor));
const live = dr.meetings.find((m) => m.status === "In progress")!;
const after = addMinutes(live.end, 5);
const record = (clientId: string, category = "Follow-up meeting") => ({ attendance: "Held", outcome: { category }, clientId, at: addMinutes(live.end, -2) });

describe("syncing outcomes recorded offline", () => {
  test("recorded once, at the phone's time; the same record again is a duplicate", () => {
    expect(syncVerdict(dr, live.id, "phone-a-1")).toBe("record");
    const r = run({ type: "dr/syncOutcome", meetingId: live.id, device: "Joy's phone", record: record("phone-a-1") }, ops, seed, after);
    expect(r.refusal).toBeUndefined();
    const m = r.state.dealRoom.meetings.find((x) => x.id === live.id)!;
    expect(m).toMatchObject({ status: "Held", outcome: { category: "Follow-up meeting", clientId: "phone-a-1", at: addMinutes(live.end, -2) } });
    expect(m.history.some((h) => h.what.startsWith("Recorded on Joy's phone"))).toBe(true);
    expect(syncVerdict(r.state.dealRoom, live.id, "phone-a-1")).toBe("duplicate");
    expect(run({ type: "dr/syncOutcome", meetingId: live.id, device: "Joy's phone", record: record("phone-a-1") }, ops, r.state, after).refusal).toBe("Already recorded");
  });

  test("a different record for a meeting on file is a conflict for the lead, who chooses", () => {
    const first = run({ type: "dr/syncOutcome", meetingId: live.id, device: "Joy's phone", record: record("phone-a-1") }, ops, seed, after).state;
    const second = run({ type: "dr/syncOutcome", meetingId: live.id, device: "Achieng's phone", record: { attendance: "No-show", noShow: "provider", clientId: "phone-b-1", at: addMinutes(live.end, -1) } }, coord, first, after);
    expect(second.refusal).toBeUndefined();
    const c = second.state.dealRoom.conflicts.at(-1)!;
    expect(c).toMatchObject({ meetingId: live.id, kept: { clientId: "phone-a-1" }, incoming: { clientId: "phone-b-1", device: "Achieng's phone", attendance: "No-show", noShow: "provider" } });
    // the record on file stands until the lead chooses
    expect(second.state.dealRoom.meetings.find((x) => x.id === live.id)!.status).toBe("Held");
    expect(syncVerdict(second.state.dealRoom, live.id, "phone-b-1")).toBe("duplicate");
    expect(run({ type: "dr/resolveConflict", conflictId: c.id, chose: "incoming" }, ops, second.state, after).refusal).toBe("Only the lead resolves a conflict");
    const chosen = run({ type: "dr/resolveConflict", conflictId: c.id, chose: "incoming" }, lead, second.state, after);
    expect(chosen.refusal).toBeUndefined();
    expect(chosen.state.dealRoom.meetings.find((x) => x.id === live.id)).toMatchObject({ status: "No-show", noShow: "provider", outcome: undefined });
    expect(chosen.state.dealRoom.exceptions[0]).toMatchObject({ kind: "Paper entry over an outcome" });
    expect(run({ type: "dr/resolveConflict", conflictId: c.id, chose: "kept" }, lead, chosen.state, after).refusal).toBe("This conflict is already resolved");
  });

  test("the outage is logged with what its sync did, and the lead is told", () => {
    const r = run({ type: "dr/logIncident", device: "Joy's phone", startedAt: addMinutes(after, -10), synced: 3, duplicates: 1, conflicts: 1 }, ops, seed, after);
    expect(r.refusal).toBeUndefined();
    expect(r.state.dealRoom.incidents[0]).toMatchObject({ startedAt: addMinutes(after, -10), endedAt: after, synced: 3, duplicates: 1, conflicts: 1, cause: "Joy's phone lost the connection" });
    expect(r.state.dealRoom.outbox[0]).toMatchObject({ to: "st_lead", link: "/dealroom/live" });
    expect(r.state.dealRoom.outbox[0].subject).toMatch(/^Incident report: Joy's phone offline .* 3 records synced, 1 duplicate dropped, 1 conflict to resolve$/);
  });
});
