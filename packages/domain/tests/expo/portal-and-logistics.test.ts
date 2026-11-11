import { expect, test } from "vitest";
import { seed } from "@excursia/domain/seed";
import { expoReducer } from "@excursia/domain/expo/reducer";
import { protoCtx } from "@excursia/domain/proto-ctx";
const r = (s: Parameters<typeof expoReducer>[0], a: Parameters<typeof expoReducer>[1]) => expoReducer(s, a, protoCtx(s, a));
import { validateExpo, invoiceTotal, staffOf, paidInFull } from "@excursia/domain/expo/logic";
import { peopleFromCsv, brandingState, deliveryStatus, passCap, signOffProblems } from "@excursia/domain/expo/onsite";
import type { AppState } from "@excursia/domain/types";
let s: AppState = seed;
const ok = (label: string, cond: boolean) => test(label, () => expect(cond).toBe(true));
const R = "ex_rafiki-translation-services";
const cfg = () => s.expo.configs.ev_nairobi_summit;
const same = (a: AppState, b: AppState) => a === b;

// people wait for the contract
let before = s;
s = r(s, { type: "expo/people", exhibitorId: R, kind: "Staff", people: [{ name: "A", email: "a@r.example", phone: "", title: "" }], idBase: "d_t0", as: "exhibitor" });
ok("staff refused before a booking", same(before, s));
s = r(s, { type: "expo/hold", id: "bk_t", exhibitorId: R, boothIds: ["b_d5"], as: "exhibitor" });
s = r(s, { type: "expo/sign", bookingId: "bk_t", name: "Gideon Kamau", title: "Lead", as: "exhibitor" });
const csv = "Name,Email,Phone,Title\nAsha Njeri,asha@rafiki.example,+254700000001,Interpreter\n\"Otieno, Paul\",paul@rafiki.example,,Sales\nMaria Wanjiku,maria@rafiki.example,,Manager";
const ppl = peopleFromCsv(csv);
ok("csv read 3 people with a quoted comma", ppl.length === 3 && ppl[1].name === "Otieno, Paul");
const inv0 = s.expo.invoices.length; const sold0 = s.tiers.find(t => t.id === "t_exhibitor")!.sold;
s = r(s, { type: "expo/people", exhibitorId: R, kind: "Staff", people: ppl, idBase: "d_t1", as: "exhibitor" });
const extra = s.expo.invoices.slice(inv0);
ok("3 staff on a 9 m² stand: 1 extra pass invoiced", extra.length === 1 && extra[0].kind === "Extras" && extra[0].lines[0].qty === 1);
ok("tier sold +3", s.tiers.find(t => t.id === "t_exhibitor")!.sold === sold0 + 3);
ok("cap now 3 = staff", passCap(s, cfg(), R) === 3 && staffOf(s, R).length === 3);
ok("badge codes unique", validateExpo(s).length === 0);
before = s;
s = r(s, { type: "expo/people", exhibitorId: R, kind: "Staff", people: [{ name: "Dup", email: "ASHA@rafiki.example", phone: "", title: "" }], idBase: "d_t2", as: "exhibitor" });
ok("duplicate email refused", same(before, s));
s = r(s, { type: "expo/people", exhibitorId: R, kind: "Contractor", people: [{ name: "Builder", email: "b@pazia.example", phone: "", title: "Stand builder" }], idBase: "d_t3", as: "exhibitor" });
ok("contractor added, no invoice", s.delegates.some(d => d.id === "d_t3_1" && d.category === "Contractor" && d.tierId === "t_contractor") && s.expo.invoices.length === inv0 + 1);
// paid in full ignores orders but counts passes
ok("not paid in full while the stand fee and pass are open", !paidInFull(s.expo, R));
// branding
before = s;
s = r(s, { type: "expo/branding", exhibitorId: R, fascia: "RAFIKI TRANSLATION SERVICES LTD", logo: { id: "x", name: "l.svg", kind: "Logo", size: 1, at: "" }, artwork: [], as: "exhibitor" });
ok("fascia over 24 refused", same(before, s));
s = r(s, { type: "expo/branding", exhibitorId: R, fascia: "Rafiki Translation", logo: { id: "x", name: "l.svg", kind: "Logo", size: 1, at: "" }, artwork: [], as: "exhibitor" });
const br = s.expo.branding.find(b => b.exhibitorId === R)!;
ok("branding sent late, upper case, waiting", br.late && br.fascia === "RAFIKI TRANSLATION" && brandingState(br) === "Waiting for approval");
before = s;
s = r(s, { type: "expo/brandingDecide", exhibitorId: R, decision: "Returned", note: " " });
ok("return without a reason refused", same(before, s));
s = r(s, { type: "expo/actAs", memberId: "u_desk1" });
before = s;
s = r(s, { type: "expo/brandingDecide", exhibitorId: R, decision: "Approved", note: "" });
ok("accreditation cannot approve branding", same(before, s));
s = r(s, { type: "expo/actAs", memberId: "u_staff2" });
s = r(s, { type: "expo/brandingDecide", exhibitorId: R, decision: "Approved", note: "" });
ok("staff approves branding", brandingState(s.expo.branding.find(b => b.exhibitorId === R)) === "Approved");
// orders
s = r(s, { type: "expo/order", id: "ord_t", exhibitorId: R, lines: [{ itemId: "c_chair", qty: 2 }, { itemId: "c_socket", qty: 1 }], as: "exhibitor" });
const o = s.expo.orders.find(x => x.id === "ord_t")!; const oi = s.expo.invoices.find(i => i.id === o.invoiceId)!;
ok("late order: surcharge line, net 1600+3500=5100 +25% = 6375", o.late && oi.lines.length === 3 && oi.lines[2].unit === 1275 && invoiceTotal(oi) === Math.round(6375 * 1.16));
s = r(s, { type: "expo/orderState", orderId: "ord_t", state: "Delivered" });
before = s;
s = r(s, { type: "expo/orderState", orderId: "ord_t", state: "Collected" });
ok("collect refused before dismantling", same(before, s) && s.expo.orders.find(x => x.id === "ord_t")!.state === "Delivered");
// move-in is over
before = s;
s = r(s, { type: "expo/moveIn", exhibitorId: R, at: "2026-11-24 09:00" });
ok("past move-in refused", same(before, s));
// deliveries
before = s;
s = r(s, { type: "expo/delivery", id: "dl_t1", exhibitorId: R, bayId: "bay1", slot: "2026-11-27 18:00", vehicle: "KDA 1", what: "x", as: "exhibitor" });
ok("full slot refused", same(before, s));
before = s;
s = r(s, { type: "expo/delivery", id: "dl_t2", exhibitorId: R, bayId: "bay1", slot: "2026-11-24 09:00", vehicle: "KDA 1", what: "x", as: "exhibitor" });
ok("past slot refused", same(before, s));
s = r(s, { type: "expo/delivery", id: "dl_t3", exhibitorId: R, bayId: "bay1", slot: "2026-11-27 18:30", vehicle: "kda 123a", what: "Collection", as: "exhibitor" });
ok("delivery booked, reg upper-cased", s.expo.deliveries.find(d => d.id === "dl_t3")?.vehicle === "KDA 123A");
// issue
before = s;
s = r(s, { type: "expo/issue", id: "is_t0", exhibitorId: R, category: "Power", priority: "Urgent", text: "  ", as: "exhibitor" });
ok("empty issue refused", same(before, s));
s = r(s, { type: "expo/issue", id: "is_t1", exhibitorId: R, category: "Power", priority: "Urgent", text: "No power", as: "exhibitor" });
ok("issue on the stand's booth", s.expo.issues.find(i => i.id === "is_t1")?.boothId === "b_d5");
// requirement and ack
s = r(s, { type: "expo/requirement", id: "rq_t", exhibitorId: R, kind: "Storage", text: "Boxes", as: "exhibitor" });
s = r(s, { type: "expo/requirementAck", id: "rq_t" });
ok("requirement seen", !!s.expo.requirements.find(x => x.id === "rq_t")?.ack);
// dismantling
before = s;
s = r(s, { type: "expo/dismantleTick", exhibitorId: R, step: "cleared", as: "exhibitor" });
ok("clearing refused before dismantling", same(before, s));
s = r(s, { type: "expo/clock", clock: "2026-11-27 18:05" });
s = r(s, { type: "expo/dismantleTick", exhibitorId: R, step: "cleared", as: "exhibitor" });
ok("sign-off blocked while rentals out", signOffProblems(s.expo, cfg(), R, s.expo.clock).includes("Rentals are still to be collected"));
s = r(s, { type: "expo/orderState", orderId: "ord_t", state: "Collected" });
s = r(s, { type: "expo/signOff", exhibitorId: R, damage: "Scuff on the back wall" });
ok("signed off with damage", s.expo.dismantles.find(d => d.exhibitorId === R)?.signedOff?.damage === "Scuff on the back wall");
// arrivals
const d3 = s.expo.deliveries.find(d => d.id === "dl_t3")!;
ok("booked collection now shows booked", deliveryStatus(cfg(), d3, s.expo.clock) === "Booked");
// windows
before = s;
s = r(s, { type: "expo/config", eventId: "ev_nairobi_summit", patch: { dismantle: { from: "2026-11-27 12:00", to: "2026-11-28 14:00" } }, note: "x" });
ok("dismantling before the show closes refused", same(before, s));
ok("the invariants hold at the end", validateExpo(s).length === 0);
