import { expect, test } from "vitest";
import { seed } from "@excursia/domain/seed";
import { reducer as storeReducer, scanVerdict, roomVerdict, scanRefusal } from "../helpers";
import { deskRefusal } from "@excursia/domain/expo/ops";
import type { AppState } from "@excursia/domain/types";
const r = storeReducer as unknown as (s: AppState, a: unknown) => AppState;
const ok = (label: string, cond: boolean) => test(label, () => expect(cond).toBe(true));
const EV = "ev_nairobi_summit";
const pin = (id: string) => seed.team.find(m => m.id === id)!.pin!;
const byCode = (s: AppState, c: string) => s.delegates.find(d => d.badgeCode === c)!;
let s: AppState = seed;
const amina = byCode(s, "EXC-DEMO-4821");

// 3. sign-in, and who did what
let before = s;
s = r(s, { type: "accredit", delegateId: amina.id, day: 1, at: "10:31" });
ok("nobody signed in: the desk cannot accredit", s === before);
s = r(s, { type: "scanSignIn", memberId: "u_desk1", eventId: EV, pin: "0000" });
ok("a wrong PIN does not sign in", !s.scanSession);
s = r(s, { type: "scanSignIn", memberId: "u_desk5", eventId: EV, pin: "" });
ok("an invited member cannot sign in", !s.scanSession && !!scanRefusal(s, s.team.find(m => m.id === "u_desk5")!, EV));
ok("Finance cannot scan", !!scanRefusal(s, s.team.find(m => m.id === "u_fin")!, EV));
ok("Bouer's desk cannot sign in at Epic's summit", !!scanRefusal(s, s.team.find(m => m.id === "u_bdesk1")!, EV) && !scanRefusal(s, s.team.find(m => m.id === "u_bdesk1")!, "ev_ca3"));
s = r(s, { type: "scanSignIn", memberId: "u_desk1", eventId: EV, pin: pin("u_desk1") });
ok("Agnes signs in with her PIN", s.scanSession?.memberId === "u_desk1");
s = r(s, { type: "accredit", delegateId: amina.id, day: 1, at: "10:31" });
ok("the accreditation names Agnes", byCode(s, "EXC-DEMO-4821").accredited && byCode(s, "EXC-DEMO-4821").checkIns[0]?.by === "u_desk1");

// 2. desk overrides: unpaid stands only, with an approver's PIN
const owes = byCode(s, "EXC-VC-1465"), unapproved = byCode(s, "EXC-SD-9648");
ok("unpaid stand is waivable, an unapproved company is not", deskRefusal(s, owes)?.waivable === true && deskRefusal(s, unapproved)?.waivable === false);
before = s;
s = r(s, { type: "accredit", delegateId: owes.id, day: 1, at: "10:32", override: "Payment confirmed by Finance" });
ok("a desk override with no PIN is refused", s === before);
s = r(s, { type: "accredit", delegateId: owes.id, day: 1, at: "10:32", override: "Payment confirmed by Finance", pin: pin("u_staff1") });
ok("a Staff PIN cannot approve an override", s === before);
s = r(s, { type: "accredit", delegateId: unapproved.id, day: 1, at: "10:32", override: "Organiser instruction", pin: pin("u_desk1") });
ok("an unapproved company's staff cannot be overridden in", s === before);
s = r(s, { type: "accredit", delegateId: owes.id, day: 1, at: "10:32", override: "Payment confirmed by Finance", pin: pin("u_owner") });
const ov = s.expo.overrides.at(-1)!;
ok("the owner's PIN approves it; the override names approver and desk", byCode(s, "EXC-VC-1465").accredited && ov.by === "u_owner" && ov.operator === "u_desk1");

// 1. door overrides never waive a bad, unpaid or unaccredited badge
const faith = byCode(s, "EXC-RV-4889"); // confirmed, not accredited
const v1 = scanVerdict(s, faith.badgeCode, "z_main", "in", "2026-11-25 10:33", true);
ok("not accredited at a door: refused, not waivable", v1.verdict === "deny" && v1.waivable === false);
before = s;
s = r(s, { type: "scan", delegateId: faith.id, zoneId: "z_main", direction: "in", verdict: "override", reason: "Organiser instruction", day: 1, at: "10:33", pin: pin("u_desk1") });
ok("the store refuses that override even with a PIN", s === before && byCode(s, "EXC-RV-4889").status === "Confirmed");
const cancelled = byCode(s, "EXC-CANC-0007");
ok("a cancelled badge is not waivable", scanVerdict(s, cancelled.badgeCode, "z_main", "in", "2026-11-25 10:00").waivable === false);
s = r(s, { type: "scan", delegateId: cancelled.id, zoneId: "z_main", direction: "in", verdict: "override", reason: "Organiser instruction", day: 1, at: "10:33", pin: pin("u_desk1") });
ok("the store refuses a cancelled badge's override", s === before);
const unpaid = byCode(s, "EXC-S9-4279");
ok("an unpaid badge is not waivable at a room door", roomVerdict(s, unpaid.badgeCode, "r_a", 1).waivable === false);
const vip = byCode(s, "EXC-DEMO-4821");
const v2 = scanVerdict(s, vip.badgeCode, "z_vip", "in", "2026-11-25 10:34", true);
ok("not entitled to the VIP lounge: waivable", v2.verdict === "deny" && v2.waivable === true);
s = r(s, { type: "scan", delegateId: vip.id, zoneId: "z_vip", direction: "in", verdict: "override", reason: "Organiser instruction", day: 1, at: "10:34" });
ok("a door override without a PIN is refused", s === before);
s = r(s, { type: "scan", delegateId: vip.id, zoneId: "z_vip", direction: "in", verdict: "override", reason: "Organiser instruction", day: 1, at: "10:34", pin: pin("u_desk2") });
const last = byCode(s, "EXC-DEMO-4821").zoneLog[0];
ok("with Collins's PIN it goes through, by Agnes, approved by Collins", last.verdict === "override" && last.by === "u_desk1" && last.approvedBy === "u_desk2");
s = r(s, { type: "scan", delegateId: vip.id, zoneId: "z_main", direction: "in", verdict: "allow", day: 1, at: "10:35" });
ok("every door scan names who scanned", byCode(s, "EXC-DEMO-4821").zoneLog[0].by === "u_desk1");

// signing out stops scanning; another event needs its own sign-in
s = r(s, { type: "scanSignOut" });
before = s;
s = r(s, { type: "scan", delegateId: vip.id, zoneId: "z_main", direction: "out", verdict: "allow", day: 1, at: "10:36" });
ok("signed out: no scans recorded", s === before);
s = r(s, { type: "scanSignIn", memberId: "u_desk1", eventId: "ev_ca3", pin: pin("u_desk1") });
ok("Agnes cannot sign in at Bouer's event", !s.scanSession);
s = r(s, { type: "scanSignIn", memberId: "u_bdesk1", eventId: "ev_ca3", pin: pin("u_bdesk1") });
ok("Halima signs in at Connected Africa", s.scanSession?.memberId === "u_bdesk1");

// 5. the seed scans nobody in who could not have entered
const contradictions = seed.delegates.filter(d => !d.accredited && ((d.roomLog ?? []).some(l => l.verdict !== "deny") || d.zoneLog.some(l => l.verdict !== "deny" && l.direction === "in") || d.checkIns.length > 0 || d.status === "Checked in"));
ok(`seed: nobody unaccredited has been through a door (${contradictions.length})`, contradictions.length === 0);
ok("Amina's seeded record has no session attendance", !(seed.delegates.find(d => d.id === "d_demo")!.roomLog ?? []).length);
