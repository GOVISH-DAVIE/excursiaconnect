"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import { EV_NBS, actingMember, bookingStage, boothStatus, expoCan, gross, invoiceStatus, isActive, kes, type BookingStage, type InvoiceStatus } from "@excursia/domain/expo/logic";
import type { Booking, Booth, ExhibitorStatus, Invoice } from "@excursia/domain/expo/types";
import type { Capability } from "@excursia/domain/types";
import { Pill } from "@/app/dealroom/bits";

/** The exhibition slice, its config, who is signed in, and "now" from the exhibition clock. */
export function useExpo(eventId = EV_NBS) {
  const { state, dispatch, hydrated } = useStore();
  const expo = state.expo;
  const cfg = expo.configs[eventId];
  const me = actingMember(state);
  return { state, dispatch, hydrated, expo, cfg, me, now: expo.clock, can: (c: Capability) => expoCan(state, c), event: state.events.find((e) => e.id === eventId)! };
}

const stageTone: Record<BookingStage, "ok" | "okSolid" | "warn" | "bad" | "mute" | "coral"> = { Held: "warn", Expired: "mute", Reserved: "coral", Booked: "okSolid", Cancelled: "mute" };
export function StagePill({ k }: { k: Booking }) {
  const { expo, cfg, now } = useExpo(k.eventId);
  const st = bookingStage(expo, k, cfg, now);
  return <Pill tone={stageTone[st]}>{st}</Pill>;
}

const invTone: Record<InvoiceStatus, "ok" | "okSolid" | "warn" | "bad" | "mute" | "coral"> = { Draft: "mute", Issued: "coral", "Part paid": "warn", Paid: "ok", Overdue: "bad", Void: "mute" };
export function InvoicePill({ inv }: { inv: Invoice }) {
  const { expo, now } = useExpo(inv.eventId);
  const st = invoiceStatus(expo, inv, now);
  return <Pill tone={invTone[st]}>{st}</Pill>;
}

const exTone: Record<ExhibitorStatus, "ok" | "okSolid" | "warn" | "bad" | "mute" | "coral"> = { Applied: "coral", "Under review": "warn", Approved: "ok", Waitlisted: "mute", Declined: "bad" };
export function ExStatusPill({ status }: { status: ExhibitorStatus }) {
  return <Pill tone={exTone[status]}>{status}</Pill>;
}

/** The booth's status from the clock, for the floor plan. */
export function useBoothStatus(eventId = EV_NBS) {
  const { expo, cfg, now } = useExpo(eventId);
  return (b: Booth) => boothStatus(expo, b, cfg, now);
}

export function priceLine(b: Booth, vatPct: number, net: number) {
  return net === 0 ? b.overrideNote ?? "Included" : `${kes(net)} + VAT, ${kes(gross(net, vatPct))}`;
}

export function Field({ label, children, help }: { label: string; children: ReactNode; help?: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {help && <span className="mt-1 block text-[12px] text-slate">{help}</span>}
    </label>
  );
}

/** What a role outside the exhibition team does instead: the desk and doors. */
export const ScannerWork = () => (
  <>
    Your role works the scanner, at the accreditation desk and the hall doors.{" "}
    <Link className="link" href="/scan">
      Open the scanner
    </Link>
  </>
);

const stateTone: Record<string, "ok" | "okSolid" | "warn" | "bad" | "mute" | "coral"> = {
  Approved: "ok",
  "Waiting for approval": "warn",
  Returned: "bad",
  "Not sent": "mute",
  Ordered: "coral",
  Delivered: "ok",
  Collected: "okSolid",
  Booked: "coral",
  Arrived: "ok",
  Missed: "bad",
  Cancelled: "mute",
  "Not started": "mute",
  "In progress": "warn",
  "Signed off": "okSolid",
  Open: "coral",
  Assigned: "warn",
  Overdue: "bad",
  Resolved: "ok",
  Seen: "ok",
  New: "coral",
  Late: "warn",
  Staffed: "ok",
  "Not staffed": "warn",
};
/** A pill for the stand and logistics states (branding, orders, deliveries, dismantling, issues). */
export function StatePill({ s }: { s: string }) {
  return <Pill tone={stateTone[s] ?? "mute"}>{s}</Pill>;
}

/** The bookings with a signed contract: the stands the services and logistics are for. */
export function useStands(eventId = EV_NBS) {
  const { expo, cfg, now } = useExpo(eventId);
  if (!cfg) return [];
  return expo.bookings
    .filter((k) => k.eventId === eventId && k.contract && isActive(bookingStage(expo, k, cfg, now)))
    .map((k) => ({ k, e: expo.exhibitors.find((x) => x.id === k.exhibitorId)!, booths: expo.booths.filter((b) => k.boothIds.includes(b.id)) }))
    .sort((a, b) => a.e.name.localeCompare(b.e.name));
}
