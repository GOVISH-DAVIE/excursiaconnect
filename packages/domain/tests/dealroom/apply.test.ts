/**
 * Applying (M1.1): an applicant's changes reach only the fields an applicant may write, two devices' edits merge,
 * and submitting respects the window the config sets.
 */
import { describe, expect, test } from "vitest";
import { apply } from "@excursia/domain/core/reducer";
import { fixedCtx } from "@excursia/domain/ctx";
import { blankApplication, patchDraft, writablePaths } from "@excursia/domain/dealroom/apply";
import { seed } from "@excursia/domain/seed";

const now = "2026-12-16 09:00";
const seeker = blankApplication({ id: "dr_t_seek", eventId: "ev_ca3", mode: "seeker", email: "amina@example.co.ke", now });
const challenge = blankApplication({ id: "dr_t_chal", eventId: "ev_ca3", mode: "challenge", email: "ops@county.example", now });

describe("a draft is patched field by field", () => {
  test("an applicant's own fields are written", () => {
    const { app, refused } = patchDraft(seeker, { "org.name": "Zambezi Pay Ltd", "ask.amount": 2_000_000, mission: "m1" });
    expect(refused).toEqual([]);
    expect(app.org.name).toBe("Zambezi Pay Ltd");
    expect(app.ask?.amount).toBe(2_000_000);
    expect(app.mission).toBe("m1");
    expect(app.org.country).toBe(""); // the rest of the group is kept
  });

  test("status, fee, reference, decisions, documents and the owning email can't be set", () => {
    const crafted = { status: "Decided", ref: "CA3-CS-99999", fee: { waived: true }, decisions: [{ decision: "Qualified" }], documents: [{ kind: "Pitch deck" }], "contact.email": "someone@else.example", assignee: "st_rev1" };
    const { app, refused } = patchDraft(seeker, crafted as never);
    expect(refused.sort()).toEqual(Object.keys(crafted).sort());
    expect(app).toBe(seeker);
  });

  test("a seeker can't write a provider's mandate, nor a provider a seeker's ask", () => {
    expect(patchDraft(seeker, { "mandate.ticketMin": 1 }).refused).toEqual(["mandate.ticketMin"]);
    const provider = blankApplication({ id: "dr_t_prov", eventId: "ev_ca3", mode: "provider", email: "fund@example.com", now });
    expect(patchDraft(provider, { "ask.amount": 1 }).refused).toEqual(["ask.amount"]);
    expect(writablePaths(provider).has("challenge.title")).toBe(false);
  });

  test("a challenge comes only from a public institution or a corporate buyer", () => {
    expect(patchDraft(challenge, { providerKind: "Venture capital" }).refused).toEqual(["providerKind"]);
    expect(patchDraft(challenge, { providerKind: "Corporate buyer", "challenge.title": "Water metering" }).refused).toEqual([]);
  });

  test("two devices' edits to different fields both survive", () => {
    const phone = { "org.name": "Savanna Water Ltd" };
    const laptop = { "org.country": "Tanzania", "ask.useOfFunds": "Treatment plant" };
    const once = patchDraft(seeker, phone).app;
    const both = patchDraft(once, laptop).app;
    expect(both.org).toMatchObject({ name: "Savanna Water Ltd", country: "Tanzania" });
    expect(both.ask?.useOfFunds).toBe("Treatment plant");
  });
});

describe("submitting respects the application window", () => {
  const cfg = seed.dealRoom.configs.ev_ca3;
  const filledDraft = seed.dealRoom.apps.find((a) => a.type === "provider" && a.status === "Submitted")!;
  const draft = { ...filledDraft, id: "dr_t_window", ref: undefined, status: "Draft" as const, submittedAt: undefined };
  const state = { ...seed, dealRoom: { ...seed.dealRoom, apps: [draft, ...seed.dealRoom.apps] } };
  const submitAt = (at: string) => apply(state, { type: "dr/submit", appId: draft.id }, fixedCtx(at, { kind: "applicant", appId: draft.id }));

  test("before applications open, it is refused with the opening date", () => {
    expect(submitAt("2026-12-14 23:59").refusal).toBe(`Applications open on ${cfg.rules.appOpen}`);
  });

  test("from the opening day it goes through, with the next reference", () => {
    const r = submitAt(`${cfg.rules.appOpen} 08:00`);
    expect(r.refusal).toBeUndefined();
    const app = r.state.dealRoom.apps.find((a) => a.id === draft.id)!;
    expect(app.status).toBe("Submitted");
    expect(app.ref).toBe(`CA3-FP-${String(seed.dealRoom.seq.fp + 1).padStart(5, "0")}`);
  });
});
