/** Money on the core platform: amounts, orders, categories and the organiser payouts. */
import type { AppState, Category, Order, PaymentMethod } from "../types";

export function money(n: number, currency = "KES") {
  return `${currency} ${n.toLocaleString("en-KE")}`;
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
    return { id: p.id, organiserId, date: p.date, status: state.payoutsPaid.includes(`${organiserId}/${p.id}`) ? "Paid" : p.status, orders, gross, commission, net: gross - commission };
  });
}
