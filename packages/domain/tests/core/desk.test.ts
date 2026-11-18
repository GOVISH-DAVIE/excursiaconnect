/** The Deal Room desk's rule (M2.2): what a scan means on each day, for each kind of badge. */
import { describe, expect, test } from "vitest";
import { deskVerdict, type DeskBadge } from "@excursia/domain/core/desk";

const EVENT = { id: "ev_x", startDate: "2027-04-20", endDate: "2027-04-22" };
const badge = (b: Partial<DeskBadge> = {}): DeskBadge => ({ code: "EXC-DR-AAAA1111", eventId: "ev_x", revoked: false, accredited: false, arrivedAt: null, ...b });

describe("the desk", () => {
  test("a bad, foreign or revoked badge is refused, and records nothing", () => {
    for (const [b, outcome] of [[undefined, "unknown"], [badge({ eventId: "ev_y" }), "other_event"], [badge({ revoked: true }), "revoked"]] as const) {
      const v = deskVerdict(b, EVENT, "2027-04-20 08:10");
      expect(v).toMatchObject({ verdict: "deny", outcome, accredit: false, arrive: false });
    }
  });

  test("the first scan on an event day accredits and records the arrival", () => {
    expect(deskVerdict(badge(), EVENT, "2027-04-21 08:10")).toMatchObject({ verdict: "allow", outcome: "accredited", accredit: true, arrive: true, eventDay: 2, reason: "Accredited and checked in for day 2" });
  });

  test("on a later day, an accredited badge arrives; a second scan that day changes nothing", () => {
    expect(deskVerdict(badge({ accredited: true }), EVENT, "2027-04-22 09:00")).toMatchObject({ outcome: "arrived", accredit: false, arrive: true, eventDay: 3 });
    expect(deskVerdict(badge({ accredited: true, arrivedAt: "08:12" }), EVENT, "2027-04-22 11:00")).toMatchObject({ verdict: "allow", outcome: "again", accredit: false, arrive: false, reason: "Already checked in today at 08:12" });
  });

  test("before the event: accredited at badge pickup, no arrival; after it: refused", () => {
    const pickup = deskVerdict(badge(), EVENT, "2027-04-19 16:00");
    expect(pickup).toMatchObject({ outcome: "accredited", accredit: true, arrive: false });
    expect(pickup.eventDay).toBeUndefined();
    expect(deskVerdict(badge({ accredited: true }), EVENT, "2027-04-19 16:05")).toMatchObject({ outcome: "early", accredit: false });
    expect(deskVerdict(badge({ accredited: true }), EVENT, "2027-04-23 08:00")).toMatchObject({ verdict: "deny", outcome: "over" });
  });
});
