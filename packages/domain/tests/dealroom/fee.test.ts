import { expect, test } from "vitest";
import { seed } from "@excursia/domain/seed";
import { reducer as storeReducer } from "../helpers";
import { feeOwed, feeSettled, matchable, qualified, validateDealRoom } from "@excursia/domain/dealroom/logic";
import type { AppState } from "@excursia/domain/types";
const r = storeReducer as unknown as (s: AppState, a: unknown) => AppState;
const ok = (label: string, cond: boolean) => test(label, () => expect(cond).toBe(true));
let s: AppState = seed;
const app = (id: string) => s.dealRoom.apps.find((a) => a.id === id)!;
const badge = (id: string) => s.delegates.find((d) => d.id === app(id).delegateId && !d.cancelled);
// a seeker in review, small enough ask that one decider settles it
const target = s.dealRoom.apps.find((a) => a.type === "seeker" && a.status === "In review" && (a.ask?.currency === "USD" ? a.ask.amount : (a.ask?.amount ?? 0) / 130) <= 10_000_000)!;
ok(`found a seeker in review (${target.id})`, !!target);
s = { ...s, dealRoom: { ...s.dealRoom, actingStaffId: "st_lead" } };
s = r(s, { type: "dr/decide", appId: target.id, decision: "Qualified", reason: "Strong fit for the enterprise mission", conditions: [] });
const t = app(target.id);
ok("approval sends the payment link: a USD 250 fee is owed", qualified(t) && feeOwed(t) && t.fee!.amount === 250 && t.fee!.currency === "USD");
ok("the seeker gets the decision and the payment link", s.dealRoom.outbox.some((m) => m.to === t.id && /pay the USD 250/.test(m.subject) && m.link.includes("pay=1")));
ok("no badge until paid", !badge(t.id));
ok("not matchable until paid, even if made Deal Room Ready", !matchable({ ...t, readiness: "Deal Room Ready", decisionMaker: { ...t.decisionMaker, confirmed: { by: "x", at: "y" } } }));
ok("the queue lists it as approved, fee not paid", feeOwed(t));
// the reminder, once, three days on
const sent = t.fee!.sentAt;
const plus = (h: number) => new Date(new Date(sent.replace(" ", "T") + "Z").getTime() + h * 3600_000).toISOString().slice(0, 16).replace("T", " ");
s = r(s, { type: "dr/clock", clock: plus(71) });
ok("no reminder before three days", !app(target.id).fee!.reminderAt);
s = r(s, { type: "dr/clock", clock: plus(73) });
ok("a reminder at three days, dated then", app(target.id).fee!.reminderAt === plus(72) && s.dealRoom.outbox.some((m) => m.to === t.id && /^Reminder: pay/.test(m.subject) && m.at === plus(72)));
s = r(s, { type: "dr/clock", clock: plus(200) });
ok("only one reminder", s.dealRoom.outbox.filter((m) => m.to === t.id && /^Reminder: pay/.test(m.subject)).length === 1);
// a reviewer cannot waive; the lead can, with a reason
let before = s;
s = r({ ...s, dealRoom: { ...s.dealRoom, actingStaffId: "st_rev1" } }, { type: "dr/waiveFee", appId: target.id, reason: "Sponsored" });
ok("a reviewer cannot waive the fee", feeOwed(app(target.id)));
s = before;
s = r(s, { type: "dr/waiveFee", appId: target.id, reason: "  " });
ok("the lead cannot waive without a reason", feeOwed(app(target.id)));
// the seeker pays by M-Pesa
s = r(s, { type: "dr/payFee", appId: target.id, method: "M-Pesa", reference: "RX7TEST01" });
const p = app(target.id);
ok("paying settles the fee, in shillings at 130", feeSettled(p) && p.fee!.paid?.method === "M-Pesa" && p.fee!.paid?.kes === 32500);
ok("the badge is issued on payment", !!badge(target.id));
ok("a receipt goes out", s.dealRoom.outbox.some((m) => m.to === p.id && /^Payment received/.test(m.subject)));
before = s;
s = r(s, { type: "dr/payFee", appId: target.id, method: "Card", reference: "PSK_again" });
ok("paying twice is refused", s === before);
// waiving another owed fee
const owed = s.dealRoom.apps.find((a) => a.id !== target.id && feeOwed(a))!;
s = r(s, { type: "dr/waiveFee", appId: owed.id, reason: "Sponsored place: mission partner pays" });
ok("the lead waives with a reason; the badge is issued", feeSettled(app(owed.id)) && !!app(owed.id).fee!.waived && !!badge(owed.id));
// a provider is never charged
const prov = s.dealRoom.apps.find((a) => a.type === "provider")!;
ok("providers have no fee", !prov.fee && feeSettled(prov));
// a fee of 0 charges nothing
let z: AppState = { ...seed, dealRoom: { ...seed.dealRoom, actingStaffId: "st_lead", configs: { ...seed.dealRoom.configs, ev_ca3: { ...seed.dealRoom.configs.ev_ca3, seekerFee: { amount: 0, currency: "USD", reminderDays: 3 } } } } };
z = r(z, { type: "dr/decide", appId: target.id, decision: "Qualified", reason: "Fit", conditions: [] });
ok("with the fee set to 0, approval issues the badge at once", !z.dealRoom.apps.find((a) => a.id === target.id)!.fee && !!z.delegates.find((d) => d.id === z.dealRoom.apps.find((a) => a.id === target.id)!.delegateId && !d.cancelled));
ok("the invariants hold at the end", validateDealRoom(s).length === 0);
