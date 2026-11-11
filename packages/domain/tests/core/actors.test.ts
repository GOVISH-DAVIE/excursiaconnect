import { expect, test } from "vitest";
import { reducer } from "@excursia/domain/core/reducer";
import { fixedCtx, type Actor } from "@excursia/domain/ctx";
import { seed } from "@excursia/domain/seed";
import { feeOwed } from "@excursia/domain/dealroom/logic";
const ok = (c: unknown, m: string) => test(m, () => expect(c).toBeTruthy());
const run = (s: typeof seed, a: unknown, actor: Actor | null, now = s.dealRoom.clock) => reducer(s, a as never, fixedCtx(now, actor));
const dr = seed.dealRoom;

// staff accounts: Algotech only
const newStaff = { id: "st_x", eventId: "ev_ca3", name: "Mallory", email: "m@x.example", role: "Lead", canDecide: true, mfa: false, active: true, addedAt: dr.clock };
ok(run(seed, { type: "dr/staffAdd", staff: newStaff }, { kind: "staff", id: "st_lead" }).dealRoom.staff.length === dr.staff.length, "the lead cannot create staff accounts");
ok(run(seed, { type: "dr/staffAdd", staff: newStaff }, { kind: "applicant", appId: "dr_cs50" }).dealRoom.staff.length === dr.staff.length, "an applicant cannot create staff accounts");
ok(run(seed, { type: "dr/staffAdd", staff: newStaff }, { kind: "admin", id: "admin" }).dealRoom.staff.length === dr.staff.length + 1, "Algotech can");

// the fee: only the payment provider's confirmation settles it
const owing = dr.apps.find(feeOwed)!;
const pay = { type: "dr/payFee", appId: owing.id, method: "M-Pesa", reference: "RKTEST" };
ok(feeOwed(run(seed, pay, { kind: "applicant", appId: owing.id }).dealRoom.apps.find((a) => a.id === owing.id)!), "the applicant's browser cannot mark its fee paid");
ok(feeOwed(run(seed, pay, { kind: "staff", id: "st_lead" }).dealRoom.apps.find((a) => a.id === owing.id)!), "staff cannot mark a fee paid either");
ok(!feeOwed(run(seed, pay, { kind: "system" }).dealRoom.apps.find((a) => a.id === owing.id)!), "the payment webhook (system) settles it");

// staff actions need a staff actor, not just any caller
const lead = { kind: "staff", id: "st_lead" } as const;
const unassigned = dr.apps.find((a) => a.status === "Submitted" && !a.assignee)!;
ok(!run(seed, { type: "dr/assign", appIds: [unassigned.id], staffId: "st_rev1" }, { kind: "applicant", appId: unassigned.id }).dealRoom.apps.find((a) => a.id === unassigned.id)!.assignee, "an applicant cannot assign a reviewer");
ok(run(seed, { type: "dr/assign", appIds: [unassigned.id], staffId: "st_rev1" }, lead).dealRoom.apps.find((a) => a.id === unassigned.id)!.assignee === "st_rev1", "the lead can");

// exhibition: an exhibitor acts only for their own company
const expo = seed.expo;
const [mine, theirs] = expo.exhibitors.filter((e) => e.status === "Approved");
const before = expo.exhibitors.find((e) => e.id === theirs.id)!.name;
const profile = (id: string) => ({ type: "expo/profile", exhibitorId: id, patch: { name: "Hijacked Ltd" } });
const s1 = run(seed, profile(theirs.id), { kind: "exhibitor", exhibitorId: mine.id }, expo.clock);
ok(s1.expo.exhibitors.find((e) => e.id === theirs.id)!.name === before, "an exhibitor cannot edit another company's profile (the old `as` bypass)");
const s2 = run(seed, profile(mine.id), { kind: "exhibitor", exhibitorId: mine.id }, expo.clock);
ok(s2.expo.exhibitors.find((e) => e.id === mine.id)!.name === "Hijacked Ltd", "it can edit its own");

// scanning: only someone signed in on a scanner for that event
const d = seed.delegates.find((x) => x.accredited && x.status === "Confirmed")!;
const scan = { type: "scan", delegateId: d.id, zoneId: "z_main", direction: "in", verdict: "allow", day: 1 };
ok(run(seed, scan, null, "2026-11-25 10:00").delegates.find((x) => x.id === d.id)!.zoneLog.length === d.zoneLog.length, "a scan with nobody signed in is refused");
