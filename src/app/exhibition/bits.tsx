"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import { EV_NBS, actingMember, bookingStage, boothStatus, expoCan, gross, invoiceStatus, kes, type BookingStage, type InvoiceStatus } from "@/lib/expo/logic";
import type { Booking, Booth, ExhibitorStatus, Invoice } from "@/lib/expo/types";
import type { Capability } from "@/lib/types";
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
