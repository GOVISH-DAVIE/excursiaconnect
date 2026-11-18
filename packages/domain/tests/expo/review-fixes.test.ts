import { expect, test } from "vitest";
import { seed } from "@excursia/domain/seed";
import { reducer as storeReducer } from "../helpers";
import { validateExpo, hallProblems, resizeHall, wallOf, doorAlong, sizeFits, includesOf, passLine, doorOn } from "@excursia/domain/expo/logic";
import type { AppState } from "@excursia/domain/types";
import type { Hall } from "@excursia/domain/expo/types";
const r = storeReducer as unknown as (s: AppState, a: unknown) => AppState;
let s: AppState = { ...seed, expo: { ...seed.expo, actingMemberId: "u_staff2" } };
const ok = (label: string, cond: boolean) => test(label, () => expect(cond).toBe(true));
const expoHall = () => s.expo.halls.find(h => h.id === "h_expo")!;
// seeded walls read back as placed
const h = expoHall();
ok("seeded doors read on their walls", h.features.filter(f => f.kind !== "Pillar").map(f => wallOf(h, f)).join(",") === "South,East,West");
ok("seed halls pass the hall rules", s.expo.halls.every(x => hallProblems(s.expo, x).length === 0));
// add a hall
const blank: Hall = { id: "h_3_test", eventId: h.eventId, name: "Annex", zoneId: "z_exhib", width: 20, depth: 12, features: [] };
let before = s;
s = r(s, { type: "expo/hall", hall: blank });
ok("a hall with no entrance is refused", s === before);
s = r(s, { type: "expo/hall", hall: { ...blank, features: [{ id: "fx1", kind: "Entrance", ...doorOn(blank, "South", 8, 4) }] } });
ok("a hall with an entrance is added and logged", s.expo.halls.some(x => x.id === "h_3_test") && s.expo.configs[h.eventId].log.at(-1)!.what.startsWith("Hall added: Annex"));
before = s;
s = r(s, { type: "expo/hall", hall: { ...blank, id: "h_4_test", name: "annex", features: [{ id: "fx2", kind: "Entrance", ...doorOn(blank, "South", 8, 4) }] } });
ok("a second hall with the same name is refused", s === before);
// pillar under a booth
before = s;
s = r(s, { type: "expo/hall", hall: { ...expoHall(), features: [...expoHall().features, { id: "fp", kind: "Pillar", x: 1, y: 1, w: 1, d: 1 }] } });
ok("a pillar under A1 is refused", s === before && hallProblems(before.expo, { ...expoHall(), features: [...expoHall().features, { id: "fp", kind: "Pillar", x: 1, y: 1, w: 1, d: 1 }] }).some(p => p.includes("A1")));
s = r(s, { type: "expo/hall", hall: { ...expoHall(), features: [...expoHall().features, { id: "fp", kind: "Pillar", x: 20, y: 4, w: 1, d: 1 }] } });
ok("a pillar in an aisle is added", expoHall().features.some(f => f.id === "fp"));
// a door outside the wall
before = s;
s = r(s, { type: "expo/hall", hall: { ...expoHall(), features: [...expoHall().features, { id: "fd", kind: "Fire exit", ...doorOn(expoHall(), "North", 40, 4) }] } });
ok("a door running past the wall is refused", s === before);
// resizing keeps doors on their walls
const big = resizeHall(expoHall(), 45, 26);
ok("growing the hall keeps the entrance on the south wall", wallOf(big, big.features.find(f => f.id === "f1")!) === "South" && big.features.find(f => f.id === "f1")!.y === 26 - 0.6 && doorAlong(big, big.features.find(f => f.id === "f1")!).at === 19);
ok("and the loading door on the east wall", big.features.find(f => f.id === "f4")!.x === 45 - 0.6);
s = r(s, { type: "expo/hall", hall: big });
ok("the grown hall saves", expoHall().width === 45);
before = s;
s = r(s, { type: "expo/hall", hall: resizeHall(expoHall(), 30, 26) });
ok("shrinking past booths is refused", s === before);
// Finance cannot change halls
before = { ...s, expo: { ...s.expo, actingMemberId: "u_fin" } };
const after = r(before, { type: "expo/hall", hall: { ...expoHall(), name: "Renamed" } });
ok("Finance cannot change a hall", after === before);
// sizes
const b = (w: number, d: number) => ({ w, d }) as never;
ok("3 × 6 m answers a 6 × 3 m booth", sizeFits("3 × 6 m", b(6, 3)) && !sizeFits("3 × 6 m", b(3, 3)));
ok("Larger means over 36 m²", sizeFits("Larger", b(6, 9)) && !sizeFits("Larger", b(6, 6)));
// inclusions follow the terms
const cfg = s.expo.configs[h.eventId];
ok("includes default, and the pass line follows the allowance", includesOf(cfg, "Shell scheme").length === 3 && passLine({ ...cfg, passPer9: 3 }) === "3 exhibitor passes per 9 m²");
s = r(s, { type: "expo/config", eventId: h.eventId, patch: { includes: { "Shell scheme": ["Walls", "Carpet"], "Space only": ["Floor"] } }, note: "Shell scheme list trimmed" });
ok("includes saved through config", includesOf(s.expo.configs[h.eventId], "Shell scheme").join("|") === "Walls|Carpet");
// removing halls
before = s;
s = r(s, { type: "expo/hallRemove", hallId: "h_expo" });
ok("a hall with booths cannot be removed", s === before);
s = r(s, { type: "expo/hallRemove", hallId: "h_3_test" });
ok("an empty hall is removed and logged", !s.expo.halls.some(x => x.id === "h_3_test") && s.expo.configs[h.eventId].log.at(-1)!.what === "Hall removed: Annex");
ok("the invariants hold at the end", validateExpo(s).length === 0);
