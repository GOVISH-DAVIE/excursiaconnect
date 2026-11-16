/**
 * Matching and introductions (M3.1): the team decides a pair with the fit in view, writes the brief and introduces
 * it; each side accepts or declines; the seeker shares documents one by one and may withdraw; a counterparty opens
 * a document only once both accepted and the seeker consented, and every opening is logged. Each refusal says why.
 */
import { describe, expect, test } from "vitest";
import { apply, type Action } from "@excursia/domain/core/reducer";
import { fixedCtx, type Actor } from "@excursia/domain/ctx";
import { candidates, consentGranted, matchable, mustHaveMisses } from "@excursia/domain/dealroom/logic";
import { seed } from "@excursia/domain/seed";
import type { AppState } from "@excursia/domain/types";

const NOW = "2027-02-14 09:00";
const run = (s: AppState, action: Action, actor: Actor | null) => apply(s, action, fixedCtx(NOW, actor));
const reviewer: Actor = { kind: "staff", id: "st_rev1" };
const ops: Actor = { kind: "staff", id: "st_ops1" };
const lead: Actor = { kind: "staff", id: "st_lead" };
const dr = seed.dealRoom;
const cfg = Object.values(dr.configs)[0];

/** A matchable seeker and a verified counterparty never paired, whose fit has no must-have miss nor exclusion. */
function freePair() {
  for (const s of dr.apps.filter((a) => a.type === "seeker" && matchable(a))) {
    const c = candidates(dr, cfg, s).find((x) => !x.existing && !x.exclusionHit && !mustHaveMisses(cfg, x.provider, x.missed).length);
    if (c) return { seeker: c.seeker, provider: c.provider };
  }
  throw new Error("the seed has no free pair");
}
/** An introduction sent the day before NOW, unanswered, with two documents proposed. */
const pending = dr.matches.find((m) => m.intro && !m.intro.seeker && !m.intro.provider && m.intro.sentAt > "2027-02-12")!;
const docsOf = (m: typeof pending) => m.intro!.items.filter((i) => i !== "teaser" && i !== "profile");

describe("deciding a pair", () => {
  test("a reviewer approves a free pair: a match with its fit and a drafted brief", () => {
    const { seeker, provider } = freePair();
    const r = run(seed, { type: "dr/matchDecide", seekerId: seeker.id, providerId: provider.id, decision: "Approved", note: "" }, reviewer);
    expect(r.refusal).toBeUndefined();
    const m = r.state.dealRoom.matches.find((x) => x.seekerId === seeker.id && x.providerId === provider.id)!;
    expect(m).toMatchObject({ decision: "Approved", origin: "search", by: "st_rev1", at: NOW });
    expect(m.met.length + m.missed.length).toBe(cfg.matching.length);
    expect(m.brief!.text).toContain(seeker.org.name);
  });

  test("operations can't decide; a rejection needs a reason; the same decision twice is refused", () => {
    const { seeker, provider } = freePair();
    const pair = { seekerId: seeker.id, providerId: provider.id };
    expect(run(seed, { type: "dr/matchDecide", ...pair, decision: "Approved", note: "" }, ops).refusal).toBe("Your role doesn't decide matches");
    expect(run(seed, { type: "dr/matchDecide", ...pair, decision: "Rejected", note: " " }, reviewer).refusal).toBe("Say why the pair is rejected");
    const once = run(seed, { type: "dr/matchDecide", ...pair, decision: "Deferred", note: "After the summit" }, reviewer).state;
    expect(run(once, { type: "dr/matchDecide", ...pair, decision: "Deferred", note: "Again" }, reviewer).refusal).toBe("This pair is already deferred");
  });

  test("a participant who isn't open to matching can't be approved, and the reason names them", () => {
    const { provider } = freePair();
    const s = dr.apps.find((a) => a.type === "seeker" && !matchable(a) && a.org.name)!;
    expect(run(seed, { type: "dr/matchDecide", seekerId: s.id, providerId: provider.id, decision: "Approved", note: "" }, reviewer).refusal).toMatch(new RegExp(`^${s.org.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} `));
  });

  test("a must-have miss needs the reviewer's note", () => {
    for (const s of dr.apps.filter((a) => a.type === "seeker" && matchable(a))) {
      const c = candidates(dr, cfg, s).find((x) => !x.existing && !x.exclusionHit && mustHaveMisses(cfg, x.provider, x.missed).length);
      if (!c) continue;
      const pair = { seekerId: c.seeker.id, providerId: c.provider.id };
      expect(run(seed, { type: "dr/matchDecide", ...pair, decision: "Approved", note: "" }, reviewer).refusal).toMatch(/which must match: write why it should still meet$/);
      expect(run(seed, { type: "dr/matchDecide", ...pair, decision: "Approved", note: "Their ticket stretches for strong teams" }, reviewer).refusal).toBeUndefined();
      return;
    }
    throw new Error("the seed has no pair with a must-have miss");
  });

  test("a rejected pair comes back only with the lead's reason, and that is logged as an exception", () => {
    const { seeker, provider } = freePair();
    const pair = { seekerId: seeker.id, providerId: provider.id };
    const rejected = run(seed, { type: "dr/matchDecide", ...pair, decision: "Rejected", note: "Stage" }, reviewer).state;
    expect(run(rejected, { type: "dr/matchDecide", ...pair, decision: "Approved", note: "" }, reviewer).refusal).toBe("This pair was rejected before; only the lead can propose it again");
    expect(run(rejected, { type: "dr/matchDecide", ...pair, decision: "Approved", note: "" }, lead).refusal).toBe("This pair was rejected before: give the reason to propose it again");
    const back = run(rejected, { type: "dr/matchDecide", ...pair, decision: "Approved", note: "", override: "They raised their stage focus" }, lead);
    expect(back.refusal).toBeUndefined();
    expect(back.state.dealRoom.exceptions[0]).toMatchObject({ kind: "Re-proposed pair", by: "st_lead" });
  });

  test("an introduced pair's decision can't change", () => {
    expect(run(seed, { type: "dr/matchDecide", seekerId: pending.seekerId, providerId: pending.providerId, decision: "Rejected", note: "Changed our mind" }, reviewer).refusal).toBe("This pair has been introduced; its decision can't change now");
  });
});

describe("the brief and the introduction", () => {
  const approved = dr.matches.find((m) => m.decision === "Approved" && !m.intro && m.brief)!;
  const seeker = dr.apps.find((a) => a.id === approved.seekerId)!;

  test("the brief is edited, then the introduction goes to both sides with the documents chosen", () => {
    const edited = run(seed, { type: "dr/brief", matchId: approved.id, text: " A sharper brief. ", agenda: ["Intros", " ", "Next step"] }, reviewer);
    expect(edited.refusal).toBeUndefined();
    expect(edited.state.dealRoom.matches.find((m) => m.id === approved.id)!.brief).toMatchObject({ text: "A sharper brief.", agenda: ["Intros", "Next step"], editedAt: NOW });
    const doc = seeker.documents[0];
    const sent = run(edited.state, { type: "dr/introduce", matchId: approved.id, items: [doc.id, doc.id] }, reviewer);
    expect(sent.refusal).toBeUndefined();
    const m = sent.state.dealRoom.matches.find((x) => x.id === approved.id)!;
    expect(m.intro).toMatchObject({ items: ["teaser", "profile", doc.id], sentAt: NOW, by: "st_rev1" });
    expect(sent.state.dealRoom.outbox.slice(0, 2).map((x) => x.to).sort()).toEqual([approved.providerId, approved.seekerId].sort());
    expect(run(sent.state, { type: "dr/introduce", matchId: approved.id, items: [] }, reviewer).refusal).toBe("The introduction has already been sent");
    expect(run(sent.state, { type: "dr/brief", matchId: approved.id, text: "Late", agenda: [] }, reviewer).refusal).toBe("The introduction has been sent; its brief can't change");
  });

  test("someone else's document, an empty brief and operations are refused", () => {
    const other = dr.apps.find((a) => a.type === "seeker" && a.id !== seeker.id && a.documents.length)!;
    expect(run(seed, { type: "dr/introduce", matchId: approved.id, items: [other.documents[0].id] }, reviewer).refusal).toBe("Only the seeker's own documents can be proposed");
    expect(run(seed, { type: "dr/brief", matchId: approved.id, text: "  ", agenda: [] }, reviewer).refusal).toBe("Write the brief");
    expect(run(seed, { type: "dr/introduce", matchId: approved.id, items: [] }, ops).refusal).toBe("Your role doesn't send introductions");
  });
});

describe("answering an introduction, consent and access", () => {
  const [deck, fin] = docsOf(pending);
  const seekerSide = (s: AppState, consent: string[]) => run(s, { type: "dr/respondIntro", matchId: pending.id, side: "seeker", response: "Accepted", consent }, { kind: "applicant", appId: pending.seekerId });
  const providerSide = (s: AppState) => run(s, { type: "dr/respondIntro", matchId: pending.id, side: "provider", response: "Accepted" }, { kind: "applicant", appId: pending.providerId });
  const opens = (s: AppState, item: string, action: "view" | "download" = "view") => run(s, { type: "dr/access", seekerId: pending.seekerId, item, viewer: pending.providerId, action }, { kind: "applicant", appId: pending.providerId });

  test("the profile opens with the introduction; documents only once both accept and the seeker consents", () => {
    expect(opens(seed, "profile").refusal).toBeUndefined();
    expect(opens(seed, deck).refusal).toBe("Documents open once both of you accept the introduction.");
    const both = providerSide(seekerSide(seed, [deck]).state).state;
    expect(consentGranted(both.dealRoom, pending.seekerId, pending.providerId, deck)).toBe(true);
    expect(consentGranted(both.dealRoom, pending.seekerId, pending.providerId, fin)).toBe(false);
    const r = opens(both, deck, "download");
    expect(r.refusal).toBeUndefined();
    expect(r.state.dealRoom.access[0]).toMatchObject({ seekerId: pending.seekerId, item: deck, viewer: pending.providerId, action: "download", at: NOW });
    expect(opens(both, fin).refusal).toBe("The business hasn't shared this document with you.");
  });

  test("the seeker withdraws consent, and shares again: each a new version; the document closes and opens", () => {
    const both = providerSide(seekerSide(seed, [deck]).state).state;
    const seekerActor: Actor = { kind: "applicant", appId: pending.seekerId };
    const out = run(both, { type: "dr/consent", seekerId: pending.seekerId, providerId: pending.providerId, docId: deck, granted: false }, seekerActor);
    expect(out.refusal).toBeUndefined();
    expect(opens(out.state, deck).refusal).toBe("The business hasn't shared this document with you.");
    expect(run(out.state, { type: "dr/consent", seekerId: pending.seekerId, providerId: pending.providerId, docId: deck, granted: false }, seekerActor).refusal).toBe("It isn't shared with them");
    const back = run(out.state, { type: "dr/consent", seekerId: pending.seekerId, providerId: pending.providerId, docId: deck, granted: true }, seekerActor);
    expect(back.state.dealRoom.consents.filter((c) => c.docId === deck && c.providerId === pending.providerId).map((c) => [c.granted, c.version])).toEqual([[true, 1], [false, 2], [true, 3]]);
    expect(opens(back.state, deck).refusal).toBeUndefined();
    // stored rows come back in their ids' order: the highest version decides, wherever it sits in the list
    const withdrawn = out.state.dealRoom;
    expect(consentGranted({ ...withdrawn, consents: [...withdrawn.consents].reverse() }, pending.seekerId, pending.providerId, deck)).toBe(false);
  });

  test("a decline needs a reason; a second answer, a document not proposed and an expired introduction are refused", () => {
    const seekerActor: Actor = { kind: "applicant", appId: pending.seekerId };
    expect(run(seed, { type: "dr/respondIntro", matchId: pending.id, side: "seeker", response: "Declined" }, seekerActor).refusal).toBe("Say why, so the Deal Room team can find a better match");
    expect(seekerSide(seed, ["file_not_proposed"]).refusal).toBe("You can share only the documents this introduction proposes");
    const once = seekerSide(seed, []).state;
    expect(seekerSide(once, []).refusal).toBe("You've already accepted this introduction");
    const old = dr.matches.find((m) => m.intro && !m.intro.seeker && !m.intro.provider && m.intro.sentAt < "2027-02-01")!;
    expect(run(seed, { type: "dr/respondIntro", matchId: old.id, side: "provider", response: "Accepted" }, { kind: "applicant", appId: old.providerId }).refusal).toBe("This introduction expired unanswered");
  });

  test("consent before accepting is refused: it is chosen with the acceptance", () => {
    expect(run(seed, { type: "dr/consent", seekerId: pending.seekerId, providerId: pending.providerId, docId: deck, granted: true }, { kind: "applicant", appId: pending.seekerId }).refusal).toBe("Choose what to share when you accept the introduction");
  });
});
