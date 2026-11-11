/**
 * Refusals say why (M0.0): apply() returns the new state, or the reason a rule refused, so the server's gateway and
 * the screens give the same text. These cover the Phase 1 actions: applying, review, decisions, verification, fees.
 */
import { describe, expect, test } from "vitest";
import { UNEXPLAINED, apply } from "@excursia/domain/core/reducer";
import { fixedCtx, type Actor } from "@excursia/domain/ctx";
import { feeOwed } from "@excursia/domain/dealroom/logic";
import { seed } from "@excursia/domain/seed";
import type { AppState } from "@excursia/domain/types";

const dr = seed.dealRoom;
const lead: Actor = { kind: "staff", id: "st_lead" };
const coordinator: Actor = { kind: "staff", id: "st_coord1" };
const run = (action: unknown, actor: Actor | null, state: AppState = seed) => apply(state, action as never, fixedCtx(state.dealRoom.clock, actor));

describe("apply", () => {
  test("an accepted action returns the new state and no refusal", () => {
    const app = dr.apps.find((a) => a.status === "Submitted" && !a.assignee)!;
    const r = run({ type: "dr/assign", appIds: [app.id], staffId: "st_rev1" }, lead);
    expect(r.refusal).toBeUndefined();
    expect(r.state.dealRoom.apps.find((a) => a.id === app.id)!.assignee).toBe("st_rev1");
  });

  test("a refused action returns the same state and its reason", () => {
    const r = run({ type: "dr/assign", appIds: [], staffId: "st_rev1" }, { kind: "applicant", appId: "dr_cs50" });
    expect(r.state).toBe(seed);
    expect(r.refusal).toBe("Only active Deal Room staff can do this");
  });

  test("a refusal a rule does not explain still comes back, never silent", () => {
    // matching is Phase 3: its refusals get reasons there; until then the generic one stands in
    const r = run({ type: "dr/matchDecide", seekerId: "nobody", providerId: "nobody", decision: "Approved", note: "" }, lead);
    expect(r.refusal).toBe(UNEXPLAINED);
  });
});

describe("Phase 1 refusals give their reason", () => {
  test("submitting with gaps names what is missing", () => {
    const draft = dr.apps.find((a) => a.status === "Draft" && a.type === "seeker")!;
    const r = run({ type: "dr/submit", appId: draft.id }, { kind: "applicant", appId: draft.id });
    expect(r.refusal).toMatch(/^Still needed: /);
  });

  test("a coordinator cannot score an application", () => {
    const app = dr.apps.find((a) => a.status === "In review")!;
    const r = run({ type: "dr/score", appId: app.id, layer: "eligibility", criterion: "e1", pass: true }, coordinator);
    expect(r.refusal).toBe("Your role cannot score applications");
  });

  test("a score needs evidence", () => {
    const app = dr.apps.find((a) => a.status === "In review" && a.assignee === "st_lead") ?? dr.apps.find((a) => a.status === "In review")!;
    const r = run({ type: "dr/score", appId: app.id, layer: "assessment", criterion: "a1", score: 70 }, lead);
    expect(r.refusal).toBe("A score needs a document or a note as evidence");
  });

  test("a decision needs a reason", () => {
    const app = dr.apps.find((a) => a.status === "In review" && a.type === "seeker")!;
    const r = run({ type: "dr/decide", appId: app.id, decision: "Qualified", reason: " ", conditions: [] }, lead);
    expect(r.refusal).toBe("A decision needs a reason");
  });

  test("a fee is settled only by the payment provider", () => {
    const owing = dr.apps.find(feeOwed)!;
    const r = run({ type: "dr/payFee", appId: owing.id, method: "M-Pesa", reference: "RK1" }, { kind: "applicant", appId: owing.id });
    expect(r.refusal).toBe("A fee is settled only by the payment provider's confirmation");
  });

  test("only the lead waives a fee", () => {
    const owing = dr.apps.find(feeOwed)!;
    const r = run({ type: "dr/waiveFee", appId: owing.id, reason: "Sponsored" }, { kind: "staff", id: "st_rev1" });
    expect(r.refusal).toBe("Only the lead can waive a fee");
  });

  test("verifying a provider with steps missing lists them", () => {
    const provider = dr.apps.find((a) => a.type === "provider" && a.verification?.state === "Verification pending" && !a.challenge)!;
    const r = run({ type: "dr/verify", appId: provider.id, outcome: "Verified", reason: "All checked" }, lead);
    expect(r.refusal).toMatch(/^Not ready to verify: /);
  });

  test("staff accounts are Algotech's", () => {
    const r = run({ type: "dr/staffRevoke", staffId: "st_rev1" }, lead);
    expect(r.refusal).toBe("Only Algotech can do this");
  });

  test("an archived Deal Room refuses changes", () => {
    const archived: AppState = { ...seed, dealRoom: { ...dr, archivedAt: "2027-08-21 23:59" } };
    const app = dr.apps.find((a) => a.status === "Submitted" && !a.assignee)!;
    const r = run({ type: "dr/assign", appIds: [app.id], staffId: "st_rev1" }, lead, archived);
    expect(r.refusal).toBe("The Deal Room is archived and read-only");
  });
});
