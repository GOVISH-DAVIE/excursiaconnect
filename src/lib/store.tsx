"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { seed } from "./seed";
import type { AppState, Category, Delegate, EventState, Order, PaymentMethod, Session } from "./types";

const STORAGE_KEY = "excursiaconnect-proto-v1";

export type ScanVerdict = { verdict: "allow" | "deny"; reason?: string; delegate?: Delegate };

type Action =
  | { type: "reset" }
  | { type: "hydrate"; state: AppState }
  | { type: "register"; delegate: Delegate; order?: Order }
  | { type: "approveRegistration"; delegateId: string; approve: boolean }
  | { type: "setEventState"; eventId: string; state: EventState; note?: string; pricing?: Partial<AppState["events"][number]> }
  | { type: "scan"; delegateId: string; zoneId: string; direction: "in" | "out"; verdict: "allow" | "deny" | "override"; reason?: string; day: number }
  | { type: "accredit"; delegateId: string; day: number }
  | { type: "enrol"; delegateId: string; sessionId: string; on: boolean }
  | { type: "book"; hostId: string; slotIndex: number; byId: string }
  | { type: "message"; from: string; to: string; body: string }
  | { type: "updateDelegate"; delegateId: string; patch: Partial<Delegate> }
  | { type: "setCurrentDelegate"; delegateId: string }
  | { type: "verifyKyc"; organiserId: string }
  | { type: "updateSession"; sessionId: string; patch: Partial<Session> }
  | { type: "grantZone"; delegateId: string; zoneId: string; on: boolean }
  | { type: "refund"; delegateId: string };

function nowTime() {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "reset":
      return structuredClone(seed);
    case "hydrate":
      return action.state;
    case "register": {
      const tiers = state.tiers.map((t) => (t.id === action.delegate.tierId && action.delegate.status === "Confirmed" ? { ...t, sold: t.sold + 1 } : t));
      return { ...state, tiers, delegates: [action.delegate, ...state.delegates], orders: action.order ? [action.order, ...state.orders] : state.orders, currentDelegateId: action.delegate.id };
    }
    case "approveRegistration":
      return { ...state, delegates: state.delegates.map((d) => (d.id === action.delegateId ? { ...d, status: action.approve ? "Confirmed" : "Cancelled" } : d)) };
    case "setEventState":
      return { ...state, events: state.events.map((e) => (e.id === action.eventId ? { ...e, ...action.pricing, state: action.state, reviewNote: action.note ?? e.reviewNote } : e)) };
    case "accredit":
      return {
        ...state,
        delegates: state.delegates.map((d) =>
          d.id === action.delegateId
            ? { ...d, accredited: true, status: d.status === "Confirmed" ? "Checked in" : d.status, checkIns: d.checkIns.some((c) => c.day === action.day) ? d.checkIns : [...d.checkIns, { day: action.day, at: nowTime() }] }
            : d,
        ),
      };
    case "scan": {
      const delta = action.verdict === "deny" ? 0 : action.direction === "in" ? 1 : -1;
      return {
        ...state,
        zones: state.zones.map((z) => (z.id === action.zoneId ? { ...z, occupancy: Math.max(0, z.occupancy + delta) } : z)),
        delegates: state.delegates.map((d) =>
          d.id === action.delegateId
            ? {
                ...d,
                status: action.verdict !== "deny" && d.status === "Confirmed" ? "Checked in" : d.status,
                checkIns: action.verdict !== "deny" && !d.checkIns.some((c) => c.day === action.day) ? [...d.checkIns, { day: action.day, at: nowTime() }] : d.checkIns,
                zoneLog: [{ zoneId: action.zoneId, direction: action.direction, at: nowTime(), verdict: action.verdict, reason: action.reason }, ...d.zoneLog],
              }
            : d,
        ),
      };
    }
    case "enrol": {
      return {
        ...state,
        sessions: state.sessions.map((s) => (s.id === action.sessionId ? { ...s, enrolled: Math.max(0, s.enrolled + (action.on ? 1 : -1)) } : s)),
        delegates: state.delegates.map((d) => (d.id === action.delegateId ? { ...d, sessions: action.on ? [...new Set([...d.sessions, action.sessionId])] : d.sessions.filter((x) => x !== action.sessionId) } : d)),
      };
    }
    case "book":
      return {
        ...state,
        delegates: state.delegates.map((d) => (d.id === action.hostId && d.slots ? { ...d, slots: d.slots.map((s, i) => (i === action.slotIndex ? { ...s, bookedBy: action.byId } : s)) } : d)),
      };
    case "message":
      return { ...state, messages: [...state.messages, { id: `m_${Date.now()}`, from: action.from, to: action.to, body: action.body, at: nowTime() }] };
    case "updateDelegate":
      return { ...state, delegates: state.delegates.map((d) => (d.id === action.delegateId ? { ...d, ...action.patch } : d)) };
    case "setCurrentDelegate":
      return { ...state, currentDelegateId: action.delegateId };
    case "updateSession":
      return { ...state, sessions: state.sessions.map((s) => (s.id === action.sessionId ? { ...s, ...action.patch } : s)) };
    case "grantZone":
      return {
        ...state,
        delegates: state.delegates.map((d) => {
          if (d.id !== action.delegateId) return d;
          const grants = new Set(d.grants ?? []);
          if (action.on) grants.add(action.zoneId); else grants.delete(action.zoneId);
          return { ...d, grants: [...grants] };
        }),
      };
    case "verifyKyc":
      return { ...state, organisers: state.organisers.map((o) => (o.id === action.organiserId ? { ...o, kycStatus: "Verified" } : o)) };
    case "refund":
      return {
        ...state,
        delegates: state.delegates.map((d) => (d.id === action.delegateId ? { ...d, status: "Refunded", cancelled: true } : d)),
        orders: state.orders.map((o) => (o.delegateId === action.delegateId ? { ...o, status: "refunded" } : o)),
      };
    default:
      return state;
  }
}

const Ctx = createContext<{ state: AppState; dispatch: (a: Action) => void; hydrated: boolean } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, seed, (s) => structuredClone(s));
  const [hydrated, setHydrated] = useReducer(() => true, false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) dispatch({ type: "hydrate", state: JSON.parse(raw) });
    } catch {}
    setHydrated();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

  const value = useMemo(() => ({ state, dispatch, hydrated }), [state, hydrated]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore outside StoreProvider");
  return ctx;
}

// ---------- domain helpers ----------

export function money(n: number, currency = "KES") {
  return `${currency} ${n.toLocaleString("en-KE")}`;
}

export function scanVerdict(state: AppState, code: string, zoneId: string, direction: "in" | "out"): ScanVerdict {
  const delegate = state.delegates.find((d) => d.badgeCode.toLowerCase() === code.trim().toLowerCase() || d.id === code.trim());
  if (!delegate || delegate.cancelled || delegate.status === "Cancelled" || delegate.status === "Refunded") return { verdict: "deny", reason: "Invalid or cancelled badge", delegate };
  if (delegate.status === "Pending" || delegate.status === "Awaiting payment") return { verdict: "deny", reason: "Registration not paid", delegate };
  if (direction === "out") return { verdict: "allow", delegate };
  const tier = state.tiers.find((t) => t.id === delegate.tierId);
  const zone = state.zones.find((z) => z.id === zoneId);
  if (!tier || !zone) return { verdict: "deny", reason: "Unknown zone", delegate };
  const entitled = tier.entitlements.includes(zoneId) || (delegate.grants ?? []).includes(zoneId) || (delegate.category === "VIP" && zoneId === "z_vip") || (delegate.category === "Speaker" && zoneId === "z_breakout");
  if (!entitled) return { verdict: "deny", reason: `Not entitled: ${zone.name}`, delegate };
  const last = delegate.zoneLog.find((l) => l.zoneId === zoneId);
  if (last && last.direction === "in" && last.verdict !== "deny") return { verdict: "deny", reason: "Anti-passback: already inside", delegate };
  if (zone.occupancy >= zone.capacity) return { verdict: "deny", reason: `Zone full (${zone.capacity})`, delegate };
  return { verdict: "allow", delegate };
}

export function makeOrder(tierPrice: number, currency: "KES" | "USD", commissionPct: number, method: PaymentMethod, delegateId: string, tierId: string, eventId: string, discount = 0): Order {
  const gross = tierPrice - discount;
  const commission = Math.round(gross * (commissionPct / 100));
  const gatewayFee = method === "bank" ? 0 : Math.round(gross * 0.015);
  const ref = method === "mpesa" ? `R${Math.random().toString(36).slice(2, 10).toUpperCase()}` : method === "card" ? `PSK_${Math.random().toString(16).slice(2, 10)}` : `INV-${Math.floor(1000 + Math.random() * 9000)}`;
  return { id: `o_${Date.now()}`, eventId, delegateId, tierId, gross, discount, gatewayFee, commission, net: gross - commission, method, reference: ref, status: method === "bank" ? "pending" : "paid", at: new Date().toISOString().slice(0, 10) };
}

export const CATEGORIES: Category[] = ["General Delegate", "Speaker", "Panelist", "Sponsor", "Exhibitor", "VIP"];


/* ---------- payouts ---------- */

export interface Payout {
  id: string;
  organiserId: string;
  date: string;
  status: "Paid" | "Scheduled";
  orders: Order[];
  gross: number;
  commission: number;
  net: number;
}

const PERIODS: { id: string; date: string; from: string; to: string; status: "Paid" | "Scheduled" }[] = [
  { id: "po_1", date: "2026-10-16", from: "0000-00-00", to: "2026-10-10", status: "Paid" },
  { id: "po_2", date: "2026-10-23", from: "2026-10-11", to: "2026-10-17", status: "Paid" },
  { id: "po_3", date: "2026-10-30", from: "2026-10-18", to: "2026-10-24", status: "Paid" },
  { id: "po_4", date: "2026-11-06", from: "2026-10-25", to: "9999-99-99", status: "Scheduled" },
];

export function payoutsFor(state: AppState, organiserId: string): Payout[] {
  const eventIds = state.events.filter((e) => e.organiserId === organiserId).map((e) => e.id);
  return PERIODS.map((p) => {
    const orders = state.orders.filter((o) => eventIds.includes(o.eventId) && o.status === "paid" && o.at >= p.from && o.at <= p.to);
    const gross = orders.reduce((a, o) => a + o.gross, 0);
    const commission = orders.reduce((a, o) => a + o.commission, 0);
    return { id: p.id, organiserId, date: p.date, status: p.status, orders, gross, commission, net: gross - commission };
  });
}
