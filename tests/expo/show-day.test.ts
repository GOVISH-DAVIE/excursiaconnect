import { expect, test } from "vitest";
import { seed } from "@/lib/seed";
import { reducer as storeReducer } from "../helpers";
import { scanVerdict } from "../helpers";
import { validateExpo } from "@/lib/expo/logic";
import { staffedOn, deskProblem } from "@/lib/expo/ops";
import type { AppState } from "@/lib/types";
const r = storeReducer as unknown as (s: AppState, a: unknown) => AppState;
let s: AppState = seed;
// the desk now works for someone signed in on the scanner, and an override carries an approver's PIN
s = (storeReducer as unknown as (s: AppState, a: unknown) => AppState)(s, { type: "scanSignIn", memberId: "u_desk1", eventId: "ev_nairobi_summit", pin: seed.team.find(m => m.id === "u_desk1")!.pin });
const ok = (label: string, cond: boolean) => test(label, () => expect(cond).toBe(true));
const byCode = (c: string) => s.delegates.find(d => d.badgeCode === c)!;
// desk
const owe = byCode("EXC-VU-5152");
let before = s;
s = r(s, { type: "accredit", delegateId: owe.id, day: 1, at: "10:31" });
ok("owing stand: accredit refused", s === before && !byCode("EXC-VU-5152").accredited);
s = r(s, { type: "accredit", delegateId: owe.id, day: 1, at: "10:31", override: "Payment confirmed by Finance", pin: seed.team.find(m => m.id === "u_desk1")!.pin });
ok("override accredits and logs", byCode("EXC-VU-5152").accredited && s.expo.overrides.length === 1 && s.expo.overrides[0].reason.includes("not paid in full") && byCode("EXC-VU-5152").checkIns[0]?.at === "10:31");
const paid = byCode("EXC-SL-5844");
s = r(s, { type: "accredit", delegateId: paid.id, day: 1, at: "10:32" });
ok("paid stand: accredited", byCode("EXC-SL-5844").accredited && byCode("EXC-SL-5844").status === "Checked in");
// doors
const ct = byCode("EXC-CT-3402");
ok("contractor refused at the hall on a show day", scanVerdict(s, ct.badgeCode, "z_exhib", "in", "2026-11-25 10:30", true).verdict === "deny");
ok("contractor admitted in dismantling", scanVerdict(s, ct.badgeCode, "z_exhib", "in", "2026-11-27 18:30", true).verdict === "allow");
ok("contractor refused at the main hall", scanVerdict(s, ct.badgeCode, "z_main", "in", "2026-11-27 18:30", true).verdict === "deny");
ok("stand staff refused at 07:00", scanVerdict(s, paid.badgeCode, "z_exhib", "in", "2026-11-26 07:00", true).reason?.includes("07:30") === true);
ok("stand staff admitted at 08:00", scanVerdict(s, paid.badgeCode, "z_exhib", "in", "2026-11-26 08:00", true).verdict === "allow");
ok("no clock: door rule not applied", scanVerdict(s, ct.badgeCode, "z_exhib", "in", "2026-11-25 10:00").verdict === "allow");
// occupancy derived from check-ins
ok("Safaricom staffed day 1 from check-ins", staffedOn(s, "ex_safaricom", 1).staffed);
before = s;
s = r(s, { type: "expo/occupancy", exhibitorId: "ex_safaricom", day: 2, staffed: true });
ok("future day not walked", s === before);
s = r(s, { type: "expo/occupancy", exhibitorId: "ex_gearbox", day: 1, staffed: false });
ok("floor walk overrides check-ins", !staffedOn(s, "ex_gearbox", 1).staffed && !!staffedOn(s, "ex_gearbox", 1).manual);
s = r(s, { type: "expo/occupancy", exhibitorId: "ex_gearbox", day: 1, staffed: null });
ok("back to check-ins", staffedOn(s, "ex_gearbox", 1).staffed && !staffedOn(s, "ex_gearbox", 1).manual);
// issues
before = s;
s = r(s, { type: "expo/issueResolve", id: "is_1", note: " " });
ok("resolve needs a note", s === before);
s = r(s, { type: "expo/actAs", memberId: "u_desk1" });
before = s;
s = r(s, { type: "expo/issueAssign", id: "is_1", assignee: "u_staff3" });
ok("accreditation cannot assign", s === before);
s = r(s, { type: "expo/actAs", memberId: "u_staff2" });
s = r(s, { type: "expo/issueAssign", id: "is_1", assignee: "u_staff3" });
s = r(s, { type: "expo/issueResolve", id: "is_1", note: "Reset the breaker on the C row" });
ok("assigned and resolved, stand told", !!s.expo.issues.find(i => i.id === "is_1")?.resolved && s.expo.outbox[0].subject.includes("power issue is resolved"));
// day 2 arrivals
const owing2 = s.delegates.filter(d => d.exhibitorId && deskProblem(s, d)?.includes("paid in full"));
s = r(s, { type: "expo/clock", clock: "2026-11-26 08:30" });
const d2 = s.delegates.filter(d => d.exhibitorId && d.checkIns.some(c => c.day === 2));
ok(`day 2 arrivals played (${d2.length})`, d2.length > 5 && d2.every(d => { const c = d.checkIns.find(x => x.day === 2)!; return c.at >= "07:30" && c.at <= "08:30"; }));
ok("nobody from an owing stand arrives", owing2.every(o => !s.delegates.find(d => d.id === o.id)!.checkIns.some(c => c.day === 2)));
const again = r(s, { type: "expo/clock", clock: "2026-11-26 09:30" });
ok("arrivals play once", again.delegates.filter(d => d.exhibitorId && d.checkIns.some(c => c.day === 2)).length === d2.length);
ok("the invariants hold at the end", validateExpo(s).length === 0);
