/**
 * The prototype's Ctx: the one place in src/lib that reads the machine clock and Math.random, because the
 * prototype has no server. It is built from what the demo already uses (the demo clocks and the persona
 * switchers). On the server the gateway builds Ctx instead, from the server clock and the session. No React here,
 * so the client store and the rule tests share it.
 */
import { nairobiNow, type Actor, type Ctx } from "./ctx";
import { ADMIN_ACTIONS } from "./dealroom/reducer";
import { actionExhibitor } from "./expo/logic";
import type { AppState } from "./types";

/**
 * The prototype's Ctx, built from what the demo already uses: the Deal Room and Exhibition run on their own demo
 * clocks, the core on Nairobi's wall clock; ids are random. On the server the gateway builds Ctx instead, from the
 * server clock and the session.
 */
export function protoCtx(state: AppState, action?: { type: string }): Ctx {
  const t = action?.type ?? "";
  const now = t.startsWith("dr/") ? state.dealRoom.clock : t.startsWith("expo/") ? state.expo.clock : nairobiNow(new Date());
  return { now, actor: protoActor(state, action), newId: (prefix) => `${prefix}_${now.replace(/\D/g, "").slice(-8)}${Math.random().toString(36).slice(2, 7)}` };
}

/**
 * Who is acting in the prototype: the persona the switchers chose. On the server this comes from the session.
 * - Deal Room: the staff member in the rail's switcher; Algotech for its own actions; the system for a paid fee,
 *   standing in for the payment provider's confirmation.
 * - Exhibition: the member in the switcher, or the exhibitor when the portal acts for its company (`as`).
 * - Scanning: whoever signed in on the scanner, for that event.
 */
export function protoActor(state: AppState, action?: { type: string }): Actor | null {
  const t = action?.type ?? "";
  if (t.startsWith("dr/")) {
    if (ADMIN_ACTIONS.has(t)) return { kind: "admin", id: "admin" };
    if (t === "dr/payFee") return { kind: "system" };
    return state.dealRoom.actingStaffId ? { kind: "staff", id: state.dealRoom.actingStaffId } : null;
  }
  if (t.startsWith("expo/")) {
    const a = action as { type: string; as?: string } & Record<string, unknown>;
    if (a.as === "exhibitor") {
      const exhibitorId = actionExhibitor(state, a);
      return exhibitorId ? { kind: "exhibitor", exhibitorId } : null;
    }
    return state.expo.actingMemberId ? { kind: "member", id: state.expo.actingMemberId } : null;
  }
  if (t === "scan" || t === "roomScan" || t === "accredit") {
    const s = state.scanSession;
    return s ? { kind: "member", id: s.memberId, eventId: s.eventId } : null;
  }
  return null;
}

