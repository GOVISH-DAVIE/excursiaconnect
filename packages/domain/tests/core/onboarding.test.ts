/** Onboarding's rules: KYC from not sent to verified, an event from draft to live, and the Deal Room's starter. */
import { describe, expect, test } from "vitest";
import {
  DEFAULT_RATE_CARD,
  addKycDoc,
  decideEvent,
  decideKyc,
  editEvent,
  editKyc,
  eventGaps,
  newEvent,
  newOrganiser,
  publishEvent,
  rateCardOf,
  removeKycDoc,
  setRateCard,
  signDpa,
  slugFor,
  submitEvent,
  submitKyc,
  termsFrom,
  type EventDetails,
  type Result,
} from "@excursia/domain/core/onboarding";
import { dealRoomGaps, refPrefixFor, starterConfig } from "@excursia/domain/dealroom/defaults";
import type { Organiser } from "@excursia/domain/types";

const NOW = "2026-12-16 09:00";
const TODAY = "2026-12-16";
const v = <T>(r: Result<T>) => {
  if (r.refusal !== undefined) throw new Error(r.refusal);
  return r.value;
};

function readyOrganiser(): Organiser {
  let o = newOrganiser({ id: "org_x", name: "Savanna Summits", country: "Kenya", now: NOW });
  o = v(editKyc(o, { registrationNo: "PVT-1", kraPin: "p051234567x", address: "Westlands", payoutAccount: "KCB ****1", signatory: { name: "Wanjiru Kamau", title: "Director" } }));
  for (const [i, kind] of ["Registration certificate", "Tax PIN certificate", "Signatory ID"].entries()) o = v(addKycDoc(o, { id: `file_${i}`, kind, name: `${i}.pdf`, size: 10, at: NOW }));
  return v(signDpa(o, "Wanjiru Kamau", NOW));
}

const details: EventDetails = {
  kind: "summit",
  timezone: "Africa/Nairobi",
  currency: "KES",
  name: "Savanna Capital Summit",
  tagline: "",
  venue: "KICC",
  city: "Nairobi",
  startDate: "2027-03-10",
  endDate: "2027-03-11",
  expectedAttendance: 400,
  brand: { primary: "#1F6F5C", logoText: "SCS" },
  dealRoomRequest: null,
};
const terms = { commissionPct: 5, oneOffFee: 0, licenceFee: 120000, gatewayFeesBorneBy: "Organiser" as const, staffCount: 4, stations: 2, dealRoom: { enabled: true, addOnPrice: 450000, deskStaff: 3 } };

describe("KYC", () => {
  test("a new organiser starts with nothing sent, and says what is missing", () => {
    const o = newOrganiser({ id: "org_x", name: "S", country: "Kenya", now: NOW });
    expect(o.kycStatus).toBe("Not submitted");
    expect(submitKyc(o, NOW).refusal).toMatch(/Registration number.*Data processing agreement/);
  });
  test("a Kenyan tax PIN must look like a KRA PIN", () => {
    const o = { ...readyOrganiser(), kraPin: "12345" };
    expect(submitKyc(o, NOW).refusal).toMatch(/KRA PIN like/);
  });
  test("the agreement is signed by the named signatory, once", () => {
    const o = v(editKyc(newOrganiser({ id: "org_x", name: "S", country: "Kenya", now: NOW }), { signatory: { name: "Wanjiru Kamau", title: "Director" } }));
    expect(signDpa(o, "Someone Else", NOW).refusal).toMatch(/Wanjiru Kamau/);
    const signed = v(signDpa(o, " wanjiru kamau ", NOW));
    expect(signDpa(signed, "Wanjiru Kamau", NOW).refusal).toMatch(/already signed/);
  });
  test("sent, it is frozen; returned with a reason, it opens again; verified, it is done", () => {
    const sent = v(submitKyc(readyOrganiser(), NOW));
    expect(sent.kycStatus).toBe("Pending");
    expect(editKyc(sent, { address: "x" }).refusal).toBeTruthy();
    expect(decideKyc(sent, "Returned", " ", "Algotech", NOW).refusal).toMatch(/Mark what needs fixing/);
    expect(decideKyc(sent, "Returned", "", "Algotech", NOW, { "doc:Signatory ID": " " }).refusal).toMatch(/Say what to fix in Signatory ID/);
    const back = v(decideKyc(sent, "Returned", "Blurry ID", "Algotech", NOW));
    expect(back.kycNote).toBe("Blurry ID");
    expect(v(editKyc(back, { address: "Upper Hill" })).address).toBe("Upper Hill");
    const ok = v(decideKyc(v(submitKyc(back, NOW)), "Verified", "", "Algotech", NOW));
    expect(ok.kycStatus).toBe("Verified");
    expect(ok.kycNote).toBeUndefined();
    expect(decideKyc(ok, "Verified", "", "Algotech", NOW).refusal).toMatch(/not waiting/);
  });
});

test("returned item by item: each must change before KYC goes back, and a returned agreement is signed again", () => {
  const sent = v(submitKyc(readyOrganiser(), NOW));
  const back = v(decideKyc(sent, "Returned", "", "Algotech", NOW, { "doc:Signatory ID": "Blank page", payoutAccount: "Not in the company's name", dpa: "Signed before the signatory was named" }));
  expect(back.kycStatus).toBe("Returned");
  expect(back.dpaSigned).toBeUndefined();
  expect(back.history?.at(-1)?.what).toMatch(/Signatory ID, Payout account, Data processing agreement/);
  // nothing changed yet: each returned item is still to fix
  expect(submitKyc(back, NOW).refusal).toMatch(/Signatory ID, as Algotech asked: Blank page.*Payout account, as Algotech asked/);
  let fixed = v(editKyc(back, { payoutAccount: "KCB ****9" }));
  fixed = v(removeKycDoc(fixed, "file_2"));
  fixed = v(addKycDoc(fixed, { id: "file_9", kind: "Signatory ID", name: "id.pdf", size: 10, at: NOW }));
  fixed = v(signDpa(fixed, "Wanjiru Kamau", NOW));
  const again = v(submitKyc(fixed, NOW));
  expect(again.kycStatus).toBe("Pending");
  expect(again.kycReturns).toBeUndefined();
  // the next check starts from what was returned last time
  expect(again.kycLastReturns).toEqual({ "doc:Signatory ID": "Blank page", payoutAccount: "Not in the company's name", dpa: "Signed before the signatory was named" });
  expect(v(decideKyc(again, "Verified", "", "Algotech", NOW)).kycLastReturns).toBeUndefined();
});

describe("an event", () => {
  const verified = v(decideKyc(v(submitKyc(readyOrganiser(), NOW)), "Verified", "", "Algotech", NOW));

  test("a web address from its name", () => expect(slugFor("Connected Africa 3.0 — Nairobi!")).toBe("connected-africa-3-0-nairobi"));

  test("a draft says what it lacks; dates in the past and backwards are refused", () => {
    const e = newEvent(verified, { ...details, venue: "", startDate: "2026-12-01", endDate: "2026-11-30" }, { id: "ev_x", slug: "x" }, NOW);
    expect(eventGaps(e, TODAY)).toEqual(["The venue", "A start date that isn't in the past", "An end date on or after the start"]);
  });

  test("submitting needs verified KYC", () => {
    const unverified = readyOrganiser();
    const e = newEvent(unverified, details, { id: "ev_x", slug: "x" }, NOW);
    expect(submitEvent(e, unverified, TODAY, NOW).refusal).toMatch(/KYC must be verified/);
    expect(v(submitEvent(e, verified, TODAY, NOW)).state).toBe("Submitted");
  });

  test("Algotech approves with terms, or sends it back with a note; the organiser then publishes", () => {
    const sent = v(submitEvent(newEvent(verified, details, { id: "ev_x", slug: "x" }, NOW), verified, TODAY, NOW));
    expect(editEvent(sent, details).refusal).toMatch(/submitted/);
    expect(decideEvent(sent, verified, { to: "Changes requested", note: "" }, "Algotech", NOW).refusal).toMatch(/note/);
    const back = v(decideEvent(sent, verified, { to: "Changes requested", note: "Add the venue's address" }, "Algotech", NOW));
    expect(back.reviewNote).toBe("Add the venue's address");
    expect(v(editEvent(back, { ...details, venue: "KICC, Harambee Avenue" })).venue).toBe("KICC, Harambee Avenue");
    expect(publishEvent(sent, NOW).refusal).toMatch(/Only an approved event/);
    const approved = v(decideEvent(sent, verified, { to: "Approved", terms }, "Algotech", NOW));
    expect(approved).toMatchObject({ state: "Approved", commissionPct: 5, dealRoom: { enabled: true } });
    expect(v(publishEvent(approved, NOW)).state).toBe("Live");
  });
});

describe("a Deal Room-only event, and rate cards", () => {
  const verified = v(decideKyc(v(submitKyc(readyOrganiser(), NOW)), "Verified", "", "Algotech", NOW));
  const dr = { ...details, kind: "dealroom" as const };

  test("it names its lead, and is approved only with its Deal Room", () => {
    expect(eventGaps(newEvent(verified, dr, { id: "ev_d", slug: "d" }, NOW), TODAY)).toContain("The Deal Room lead: a Deal Room-only event is the Deal Room");
    const withLead = newEvent(verified, { ...dr, dealRoomRequest: { lead: { name: "Otieno", email: "o@x.example" } } }, { id: "ev_d", slug: "d" }, NOW);
    const sent = v(submitEvent(withLead, verified, TODAY, NOW));
    expect(decideEvent(sent, verified, { to: "Approved", terms: { ...terms, dealRoom: { ...terms.dealRoom, enabled: false } } }, "Algotech", NOW).refusal).toMatch(/approved with its Deal Room/);
    expect(v(decideEvent(sent, verified, { to: "Approved", terms }, "Algotech", NOW)).history?.at(-1)?.what).toMatch(/the Deal Room at KES 450,000/);
  });

  test("approval starts from the organiser's rate card, or the platform's until one is set", () => {
    const e = newEvent(verified, dr, { id: "ev_d", slug: "d" }, NOW);
    expect(termsFrom(rateCardOf(verified), e)).toMatchObject({ commissionPct: DEFAULT_RATE_CARD.commissionPct, dealRoom: { enabled: true, addOnPrice: DEFAULT_RATE_CARD.dealRoomOnly } });
    const priced = v(setRateCard(verified, { ...DEFAULT_RATE_CARD, commissionPct: 3.5, dealRoomAddOn: 300_000 }, "Algotech", NOW));
    expect(termsFrom(rateCardOf(priced), { kind: "summit", dealRoomRequest: undefined })).toMatchObject({ commissionPct: 3.5, dealRoom: { enabled: false, addOnPrice: 300_000 } });
    expect(setRateCard(verified, { ...DEFAULT_RATE_CARD, commissionPct: 120 }, "Algotech", NOW).refusal).toMatch(/0 to 100/);
  });
});

describe("the Deal Room's starter settings", () => {
  test("standard rubric and rules, dates from the event, closed until the lead names a mission", () => {
    const cfg = starterConfig({ id: "ev_x", name: "Savanna Capital Summit", startDate: "2027-03-10", endDate: "2027-03-11", brand: { primary: "#000000", logoText: "scs" } }, TODAY, NOW, "admin");
    expect(cfg.refPrefix).toBe("SCS");
    expect(refPrefixFor({ name: "East Africa Growth Capital Summit 2027", brand: { primary: "#000000", logoText: "" } })).toBe("EAGCS2");
    expect(cfg.rules).toMatchObject({ appOpen: TODAY, appClose: "2027-02-24", rfiDays: 7 });
    expect(cfg.freezeDate).toBe("2027-03-03");
    expect(dealRoomGaps(cfg)).toEqual(["Name at least one mission"]);
    expect(dealRoomGaps({ ...cfg, missions: [{ id: "m1", code: "M1", name: "Growth", description: "" }] })).toEqual([]);
  });
});
