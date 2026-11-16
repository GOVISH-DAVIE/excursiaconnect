/**
 * The Deal Room badge (M2.1): the participant corrects the name and title on it until the organiser locks them for
 * printing; the desk may correct them at any time; a reissue gives a new code and tells the participant; and the
 * emails that announce a badge point at the badge.
 */
import { describe, expect, test } from "vitest";
import { apply, type Action } from "@excursia/domain/core/reducer";
import { fixedCtx, type Actor } from "@excursia/domain/ctx";
import { seed } from "@excursia/domain/seed";
import type { AppState } from "@excursia/domain/types";

const NOW = "2027-02-10 09:00";
const holder = seed.dealRoom.apps.find((a) => a.delegateId && seed.delegates.some((d) => d.id === a.delegateId && !d.cancelled))!;
const as = (actor: Actor) => fixedCtx(NOW, actor);
const run = (s: AppState, action: Action, actor: Actor) => apply(s, action, as(actor));
const delegateOf = (s: AppState) => s.delegates.find((d) => d.id === holder.delegateId)!;
const lastTo = (s: AppState) => s.dealRoom.outbox.find((m) => m.to === holder.id);
const me: Actor = { kind: "applicant", appId: holder.id };

describe("the badge's details", () => {
  test("the participant changes their own name and title; the history says what changed", () => {
    const r = run(seed, { type: "dr/badgeDetails", appId: holder.id, name: "  Grace   Wanjiru ", jobTitle: "Chief Executive" }, me);
    expect(r.refusal).toBeUndefined();
    expect(delegateOf(r.state)).toMatchObject({ name: "Grace Wanjiru", jobTitle: "Chief Executive", badgeCode: delegateOf(seed).badgeCode });
    expect(r.state.dealRoom.apps.find((a) => a.id === holder.id)!.history.at(-1)).toMatchObject({ by: "applicant", what: expect.stringMatching(/^Badge changed: name ".*" to "Grace Wanjiru"/) });
  });

  test("another applicant, a reviewer and a bad name are refused", () => {
    const other = seed.dealRoom.apps.find((a) => a.id !== holder.id)!;
    expect(run(seed, { type: "dr/badgeDetails", appId: holder.id, name: "X Y", jobTitle: "" }, { kind: "applicant", appId: other.id }).refusal).toMatch(/Only the participant/);
    expect(run(seed, { type: "dr/badgeDetails", appId: holder.id, name: "X Y", jobTitle: "" }, { kind: "staff", id: "st_rev1" }).refusal).toMatch(/Only the participant/);
    expect(run(seed, { type: "dr/badgeDetails", appId: holder.id, name: "X", jobTitle: "" }, me).refusal).toBe("The name on a badge is 2 to 80 characters");
    const d = delegateOf(seed);
    expect(run(seed, { type: "dr/badgeDetails", appId: holder.id, name: d.name, jobTitle: d.jobTitle }, me).refusal).toBe("Those are already the badge's details");
  });

  test("locked for printing: the participant is refused, the desk is not", () => {
    const locked: AppState = { ...seed, events: seed.events.map((e) => (e.id === holder.eventId ? { ...e, profileLocked: true } : e)) };
    expect(run(locked, { type: "dr/badgeDetails", appId: holder.id, name: "Grace Wanjiru", jobTitle: "" }, me).refusal).toMatch(/locked for printing/);
    expect(run(locked, { type: "dr/badgeDetails", appId: holder.id, name: "Grace Wanjiru", jobTitle: "" }, { kind: "staff", id: "st_coord1" }).refusal).toBeUndefined();
  });

  test("a revoked badge is not changed", () => {
    const revoked: AppState = { ...seed, delegates: seed.delegates.map((d) => (d.id === holder.delegateId ? { ...d, cancelled: true, status: "Cancelled" } : d)) };
    expect(run(revoked, { type: "dr/badgeDetails", appId: holder.id, name: "Grace Wanjiru", jobTitle: "" }, me).refusal).toBe("This badge is revoked");
  });
});

describe("reissuing a badge", () => {
  test("the desk reissues with a reason: a new code, the old one noted, the participant told", () => {
    const old = delegateOf(seed).badgeCode;
    const r = run(seed, { type: "dr/reissueBadge", appId: holder.id, reason: "Lost on day one" }, { kind: "staff", id: "st_coord1" });
    expect(r.refusal).toBeUndefined();
    const fresh = delegateOf(r.state).badgeCode;
    expect(fresh).toMatch(/^EXC-DR-[0-9A-Z]{8}$/);
    expect(fresh).not.toBe(old);
    expect(r.state.dealRoom.apps.find((a) => a.id === holder.id)!.history.at(-1)!.what).toContain(old);
    expect(lastTo(r.state)).toMatchObject({ subject: "Your Deal Room badge was reissued: use the new one", link: `/dr/${holder.id}?badge=1` });
  });

  test("a reviewer, the participant, and no reason are refused", () => {
    expect(run(seed, { type: "dr/reissueBadge", appId: holder.id, reason: "Lost" }, { kind: "staff", id: "st_rev1" }).refusal).toMatch(/Only the lead, operations or a coordinator/);
    expect(run(seed, { type: "dr/reissueBadge", appId: holder.id, reason: "Lost" }, me).refusal).toBe("Only active Deal Room staff can do this");
    expect(run(seed, { type: "dr/reissueBadge", appId: holder.id, reason: " " }, { kind: "staff", id: "st_lead" }).refusal).toBe("A reissue needs a reason");
  });
});

describe("the emails that bring a badge", () => {
  test("a waived fee points at the badge", () => {
    const owed = seed.dealRoom.apps.find((a) => a.fee && !a.fee.paid && !a.fee.waived && a.status === "Decided")!;
    expect(owed).toBeDefined();
    const r = run(seed, { type: "dr/waiveFee", appId: owed.id, reason: "Sponsored" }, { kind: "staff", id: "st_lead" });
    expect(r.state.dealRoom.outbox.find((m) => m.to === owed.id)).toMatchObject({ link: `/dr/${owed.id}?badge=1` });
  });

  test("an approval that settles at once announces the badge", () => {
    const free: AppState = { ...seed, dealRoom: { ...seed.dealRoom, configs: { ...seed.dealRoom.configs, ev_ca3: { ...seed.dealRoom.configs.ev_ca3, seekerFee: { amount: 0, currency: "USD", reminderDays: 3 } } } } };
    const target = free.dealRoom.apps.find((a) => a.type === "seeker" && a.status === "In review" && !a.delegateId && (a.ask?.currency === "USD" ? a.ask.amount : (a.ask?.amount ?? 0) / 130) <= 10_000_000)!;
    const r = run(free, { type: "dr/decide", appId: target.id, decision: "Qualified", reason: "Fit", conditions: [] }, { kind: "staff", id: "st_lead" });
    expect(r.refusal).toBeUndefined();
    const subjects = r.state.dealRoom.outbox.filter((m) => m.to === target.id).map((m) => `${m.subject} ${m.link}`);
    expect(subjects).toContain(`Your Deal Room badge is ready /dr/${target.id}?badge=1`);
  });
});
