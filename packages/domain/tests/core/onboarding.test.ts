/** Onboarding's rules: KYC from not sent to verified, an event from draft to live, and the Deal Room's starter. */
import { describe, expect, test } from "vitest";
import {
  addKycDoc,
  decideEvent,
  decideKyc,
  editEvent,
  editKyc,
  eventGaps,
  newEvent,
  newOrganiser,
  publishEvent,
  signDpa,
  slugFor,
  submitEvent,
  submitKyc,
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
const terms = { commissionPct: 5, oneOffFee: 0, licenceFee: 120000, gatewayFeesBorneBy: "Organiser" as const, dealRoom: { enabled: true, addOnPrice: 450000, deskStaff: 3 } };

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
    expect(decideKyc(sent, "Returned", " ", "Algotech", NOW).refusal).toMatch(/what needs fixing/);
    const back = v(decideKyc(sent, "Returned", "Blurry ID", "Algotech", NOW));
    expect(back.kycNote).toBe("Blurry ID");
    expect(v(editKyc(back, { address: "Upper Hill" })).address).toBe("Upper Hill");
    const ok = v(decideKyc(v(submitKyc(back, NOW)), "Verified", "", "Algotech", NOW));
    expect(ok.kycStatus).toBe("Verified");
    expect(ok.kycNote).toBeUndefined();
    expect(decideKyc(ok, "Verified", "", "Algotech", NOW).refusal).toMatch(/not waiting/);
  });
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
