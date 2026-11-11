"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { seed } from "./seed";
import { overlaps } from "./time";
import { drReducer, type DrAction } from "./dealroom/reducer";
import { expoReducer, type ExpoAction } from "./expo/reducer";
import { deskRefusal, doorProblem } from "./expo/ops";
import { can } from "./roles";
import { meetingInRoom } from "./dealroom/logic";
import type { AppState, Capability, Category, Delegate, EventState, FormField, Order, PaymentMethod, Role, Room, Session, SpeakerProfile, Sponsor, TeamMember, Tier, Zone } from "./types";

export const STORAGE_KEY = "excursiaconnect-proto-v1";
/** Bumped whenever the seed gains records in arrays that already exist, so a saved browser resets instead of
 *  keeping an older copy that lacks them (hydrate only merges top-level keys). */
export const SEED_VERSION = 17;

export { overlaps };

// `waivable`: a deny staff may override with a PIN; a bad, unpaid or unaccredited badge never is (AZ-5)
export type ScanVerdict = { verdict: "allow" | "deny"; reason?: string; delegate?: Delegate; waivable?: boolean };

type Action =
  | DrAction
  | ExpoAction
  | { type: "reset" }
  | { type: "addGallery"; eventId: string; images: string[] }
  | { type: "removeGallery"; eventId: string; index: number }
  | { type: "hydrate"; state: AppState }
  | { type: "register"; delegate: Delegate; order?: Order }
  | { type: "approveRegistration"; delegateId: string; approve: boolean }
  | { type: "setEventState"; eventId: string; state: EventState; note?: string; pricing?: Partial<AppState["events"][number]> }
  | { type: "scan"; delegateId: string; zoneId: string; direction: "in" | "out"; verdict: "allow" | "deny" | "override"; reason?: string; day: number; at?: string; pin?: string }
  | { type: "scanSignIn"; memberId: string; eventId: string; pin: string }
  | { type: "scanSignOut" }
  // `at` is HH:MM on a module's clock; `override` is the reason the desk accredits a stand that is not paid in full (OPS-1)
  | { type: "accredit"; delegateId: string; day: number; at?: string; override?: string; pin?: string }
  | { type: "enrol"; delegateId: string; sessionId: string; on: boolean }
  | { type: "book"; hostId: string; slotIndex: number; byId: string }
  | { type: "message"; from: string; to: string; body: string }
  | { type: "updateDelegate"; delegateId: string; patch: Partial<Delegate> }
  | { type: "setCurrentDelegate"; delegateId: string }
  | { type: "verifyKyc"; organiserId: string }
  | { type: "signDpa"; organiserId: string; by: string }
  | { type: "updateSession"; sessionId: string; patch: Partial<Session> }
  | { type: "grantZone"; delegateId: string; zoneId: string; on: boolean }
  | { type: "refund"; delegateId: string }
  | { type: "setGrant"; role: Role; cap: Capability; on: boolean }
  | { type: "inviteMember"; member: TeamMember }
  | { type: "setMemberRole"; memberId: string; role: Role }
  | { type: "removeMember"; memberId: string }
  | { type: "assignShift"; eventId: string; day: number; slot: "Morning" | "Afternoon"; post: string; memberId?: string }
  | { type: "setBanner"; eventId: string; image?: string }
  | { type: "setFloorPlan"; eventId: string; image?: string }
  | { type: "setSpeakerProfile"; profile: SpeakerProfile }
  | { type: "upsertSponsor"; sponsor: Sponsor }
  | { type: "removeSponsor"; sponsorId: string }
  | { type: "setEventLinks"; eventId: string; links: AppState["events"][number]["links"]; hashtag?: string }
  | { type: "addEvent"; event: AppState["events"][number] }
  | { type: "closeEvent"; eventId: string }
  | { type: "importDelegates"; delegates: Delegate[] }
  | { type: "mergeDelegates"; keepId: string; dropId: string }
  | { type: "setProfileLock"; eventId: string; locked: boolean }
  | { type: "releaseWaitlist"; delegateId: string }
  | { type: "expireOffer"; delegateId: string }
  | { type: "roomScan"; delegateId: string; roomId: string; sessionId: string; day: number; verdict: "allow" | "deny" | "override"; reason?: string; pin?: string }
  | { type: "requestRefund"; delegateId: string }
  | { type: "markPaid"; delegateId: string; method?: PaymentMethod }
  | { type: "addOrganiser"; organiser: AppState["organisers"][number] }
  | { type: "setRateCard"; organiserId: string; licenceFee: number; commissionPct: number }
  | { type: "resolveException"; ref: string; how: string }
  | { type: "runPayouts"; payoutIds: string[] }
  | { type: "sendCampaign"; campaign: AppState["campaigns"][number] }
  | { type: "upsertTier"; tier: Tier }
  | { type: "removeTier"; tierId: string }
  | { type: "upsertField"; field: FormField }
  | { type: "removeField"; fieldId: string }
  | { type: "upsertSession"; session: Session }
  | { type: "removeSession"; sessionId: string }
  | { type: "upsertZone"; zone: Zone }
  | { type: "removeZone"; zoneId: string }
  | { type: "upsertRoom"; room: Room }
  | { type: "removeRoom"; roomId: string }
  | { type: "setBrand"; eventId: string; brand: AppState["events"][number]["brand"]; tagline?: string };

function stamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function nowTime() {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function reducer(state: AppState, action: Action): AppState {
  if (action.type.startsWith("dr/")) return drReducer(state, action as DrAction);
  if (action.type.startsWith("expo/")) return expoReducer(state, action as ExpoAction);
  switch (action.type) {
    case "reset":
      return structuredClone(seed);
    case "hydrate":
      // a state saved before a key existed takes the seed's value for it
      return { ...structuredClone(seed), ...action.state };
    case "register": {
      const tiers = state.tiers.map((t) => (t.id === action.delegate.tierId && action.delegate.status === "Confirmed" ? { ...t, sold: t.sold + 1 } : t));
      return { ...state, tiers, delegates: [action.delegate, ...state.delegates], orders: action.order ? [action.order, ...state.orders] : state.orders, currentDelegateId: action.delegate.id };
    }
    case "approveRegistration": {
      // a paid tier still has to be paid: approval opens the order, Mark paid (or the gateway) confirms it
      return {
        ...state,
        delegates: state.delegates.map((d) => {
          if (d.id !== action.delegateId) return d;
          if (!action.approve) return { ...d, status: "Cancelled" };
          const paid = (state.tiers.find((t) => t.id === d.tierId)?.price ?? 0) > 0 && !state.orders.some((o) => o.delegateId === d.id && o.status === "paid");
          return { ...d, status: paid ? "Awaiting payment" : "Confirmed" };
        }),
      };
    }
    case "setEventState":
      return {
        ...state,
        events: state.events.map((e) => {
          if (e.id !== action.eventId) return e;
          // a live event that goes back for review, or is suspended, remembers it was live; approval returns it there
          const leavingLive = e.state === "Live" && (action.state === "Under review" || action.state === "Suspended");
          const restore = action.state === "Approved" && e.stateBefore === "Live";
          const next = restore ? "Live" : action.state;
          const addOn = action.state === "Approved" && action.pricing?.dealRoom?.enabled ? `, with the Deal Room add-on at KES ${action.pricing.dealRoom.addOnPrice.toLocaleString("en-KE")} and ${action.pricing.dealRoom.deskStaff} desk staff a day` : "";
          const what = (restore ? "Approved on the new terms; registration continues" : action.state + (action.note ? `: ${action.note}` : "")) + addOn;
          return { ...e, ...action.pricing, state: next, stateBefore: leavingLive ? "Live" : restore || action.state === "Live" ? undefined : e.stateBefore, reviewNote: action.note ?? e.reviewNote, history: [...(e.history ?? []), { at: stamp(), what }] };
        }),
        // the pending price takes effect on approval; a rejection or a request for changes drops it
        tiers: state.tiers.map((t) => {
          if (t.eventId !== action.eventId || t.pendingPrice === undefined) return t;
          const { pendingPrice, pendingCurrency, ...rest } = t;
          if (action.state === "Approved") return { ...rest, price: pendingPrice, currency: pendingCurrency ?? t.currency };
          if (action.state === "Rejected" || action.state === "Changes requested") return rest;
          return t;
        }),
      };
    case "addEvent":
      return { ...state, events: [...state.events, action.event] };
    case "closeEvent":
      return { ...state, events: state.events.map((e) => (e.id === action.eventId ? { ...e, state: "Closed", closedAt: stamp(), history: [...(e.history ?? []), { at: stamp(), what: "Closed; post-event report issued" }] } : e)) };
    case "setProfileLock":
      return { ...state, events: state.events.map((e) => (e.id === action.eventId ? { ...e, profileLocked: action.locked } : e)) };
    case "importDelegates": {
      const sold: Record<string, number> = {};
      for (const d of action.delegates) if (d.status === "Confirmed") sold[d.tierId] = (sold[d.tierId] ?? 0) + 1;
      return { ...state, tiers: state.tiers.map((t) => (sold[t.id] ? { ...t, sold: t.sold + sold[t.id] } : t)), delegates: [...action.delegates, ...state.delegates] };
    }
    case "mergeDelegates": {
      const keep = state.delegates.find((d) => d.id === action.keepId);
      const drop = state.delegates.find((d) => d.id === action.dropId);
      if (!keep || !drop) return state;
      const merged: Delegate = {
        ...keep,
        accredited: keep.accredited || drop.accredited,
        checkIns: [...keep.checkIns, ...drop.checkIns.filter((c) => !keep.checkIns.some((k) => k.day === c.day))],
        zoneLog: [...keep.zoneLog, ...drop.zoneLog],
        sessions: [...new Set([...keep.sessions, ...drop.sessions])],
        grants: [...new Set([...(keep.grants ?? []), ...(drop.grants ?? [])])],
      };
      const dropPaid = drop.status === "Confirmed" || drop.status === "Checked in";
      return {
        ...state,
        delegates: state.delegates.filter((d) => d.id !== action.dropId).map((d) => (d.id === action.keepId ? merged : d)),
        orders: state.orders.map((o) => (o.delegateId === action.dropId ? { ...o, delegateId: action.keepId } : o)),
        tiers: state.tiers.map((t) => (dropPaid && t.id === drop.tierId ? { ...t, sold: Math.max(0, t.sold - 1) } : t)),
        messages: state.messages.map((m) => ({ ...m, from: m.from === action.dropId ? action.keepId : m.from, to: m.to === action.dropId ? action.keepId : m.to })),
      };
    }
    case "releaseWaitlist": {
      // OS-7: the place is held for 24 hours; the delegate pays from the badge, or the seat goes to the next in line
      const until = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
      return { ...state, delegates: state.delegates.map((d) => (d.id === action.delegateId && d.status === "Waitlisted" ? { ...d, status: "Awaiting payment", offerExpires: until } : d)) };
    }
    case "expireOffer":
      return { ...state, delegates: state.delegates.map((d) => (d.id === action.delegateId && d.status === "Awaiting payment" && d.offerExpires ? { ...d, status: "Waitlisted", offerExpires: undefined } : d)) };
    case "requestRefund":
      return { ...state, delegates: state.delegates.map((d) => (d.id === action.delegateId && (d.status === "Confirmed" || d.status === "Checked in") ? { ...d, status: "Refund requested" } : d)) };
    case "markPaid": {
      // FI-4: the bank transfer arrived. The delegate is confirmed, the order paid, the seat counted.
      const d = state.delegates.find((x) => x.id === action.delegateId);
      if (!d || d.status !== "Awaiting payment") return state;
      const hasOrder = state.orders.some((o) => o.delegateId === d.id);
      const tier = state.tiers.find((t) => t.id === d.tierId);
      const event = state.events.find((e) => e.id === d.eventId);
      const newOrder: Order | null = !hasOrder && tier && event && tier.price > 0 ? makeOrder(tier.price, tier.currency, event.commissionPct, action.method ?? "bank", d.id, tier.id, event.id) : null;
      return {
        ...state,
        delegates: state.delegates.map((x) => (x.id === d.id ? { ...x, status: "Confirmed", offerExpires: undefined } : x)),
        orders: [...(newOrder ? [{ ...newOrder, status: "paid" as const }] : []), ...state.orders.map((o) => (o.delegateId === d.id ? { ...o, status: "paid" as const } : o))],
        tiers: state.tiers.map((t) => (t.id === d.tierId ? { ...t, sold: t.sold + 1 } : t)),
      };
    }
    case "addOrganiser":
      return { ...state, organisers: [...state.organisers, action.organiser] };
    case "setRateCard":
      return { ...state, organisers: state.organisers.map((o) => (o.id === action.organiserId ? { ...o, licenceFee: action.licenceFee, commissionPct: action.commissionPct } : o)) };
    case "resolveException":
      return { ...state, exceptions: state.exceptions.map((x) => (x.ref === action.ref ? { ...x, resolved: { at: stamp(), how: action.how } } : x)) };
    case "runPayouts": {
      // PA-7: one key per organiser and period; a held organiser (KYC pending) or a zero balance is never paid
      const ok = action.payoutIds.filter((key) => {
        const [organiserId, periodId] = key.split("/");
        const org = state.organisers.find((o) => o.id === organiserId);
        const p = org && payoutsFor(state, org.id).find((x) => x.id === periodId);
        return !!org && org.kycStatus === "Verified" && !!p && p.net > 0;
      });
      return { ...state, payoutsPaid: [...new Set([...state.payoutsPaid, ...ok])] };
    }
    case "sendCampaign":
      return { ...state, campaigns: [action.campaign, ...state.campaigns] };
    case "upsertTier": {
      const old = state.tiers.find((t) => t.id === action.tier.id);
      const exists = !!old;
      const event0 = state.events.find((e) => e.id === action.tier.eventId);
      const liveNow = event0?.state === "Live" || (event0?.state === "Under review" && event0.stateBefore === "Live");
      // OR-14: a money change on a live event goes back to Algotech; registration continues on the approved terms,
      // so the approved price stays on the tier and the new one waits as pendingPrice until approval
      const moneyChanged = !!old && liveNow && (old.price !== action.tier.price || old.currency !== action.tier.currency);
      const saved: Tier = moneyChanged ? { ...action.tier, price: old!.pendingPrice !== undefined ? old!.price : old!.price, currency: old!.currency, pendingPrice: action.tier.price, pendingCurrency: action.tier.currency } : action.tier;
      const tiers = exists ? state.tiers.map((t) => (t.id === action.tier.id ? saved : t)) : [...state.tiers, action.tier];
      const events = state.events.map((e) =>
        e.id === action.tier.eventId && e.state === "Live" && moneyChanged
          ? { ...e, state: "Under review" as const, stateBefore: "Live" as const, reviewNote: `${action.tier.name} price changed from ${old!.price} to ${action.tier.price}; registration continues on the approved terms`, history: [...(e.history ?? []), { at: stamp(), what: `Under review: ${action.tier.name} price changed to ${action.tier.currency} ${action.tier.price}` }] }
          : e,
      );
      return { ...state, tiers, events };
    }
    case "removeTier":
      return state.tiers.find((t) => t.id === action.tierId)?.sold ? state : { ...state, tiers: state.tiers.filter((t) => t.id !== action.tierId) };
    case "upsertField":
      return { ...state, formFields: state.formFields.some((f) => f.id === action.field.id) ? state.formFields.map((f) => (f.id === action.field.id ? action.field : f)) : [...state.formFields, action.field] };
    case "removeField":
      return { ...state, formFields: state.formFields.filter((f) => f.id !== action.fieldId) };
    case "upsertSession": {
      const ev = state.events.find((e) => e.id === action.session.eventId);
      // a session may not take a room a Deal Room meeting holds (the shared clash rule, both ways)
      if (ev && action.session.roomId && meetingInRoom(state.dealRoom, ev.startDate, action.session.roomId, action.session.day, action.session.start, action.session.end)) return state;
      return { ...state, sessions: state.sessions.some((s) => s.id === action.session.id) ? state.sessions.map((s) => (s.id === action.session.id ? action.session : s)) : [...state.sessions, action.session] };
    }
    case "removeSession":
      return { ...state, sessions: state.sessions.filter((s) => s.id !== action.sessionId), delegates: state.delegates.map((d) => (d.sessions.includes(action.sessionId) ? { ...d, sessions: d.sessions.filter((x) => x !== action.sessionId) } : d)) };
    case "upsertZone":
      return { ...state, zones: state.zones.some((z) => z.id === action.zone.id) ? state.zones.map((z) => (z.id === action.zone.id ? action.zone : z)) : [...state.zones, action.zone] };
    case "removeZone":
      return state.rooms.some((r) => r.zoneId === action.zoneId) ? state : { ...state, zones: state.zones.filter((z) => z.id !== action.zoneId), tiers: state.tiers.map((t) => ({ ...t, entitlements: t.entitlements.filter((e) => e !== action.zoneId) })) };
    case "upsertRoom":
      return { ...state, rooms: state.rooms.some((r) => r.id === action.room.id) ? state.rooms.map((r) => (r.id === action.room.id ? action.room : r)) : [...state.rooms, action.room] };
    case "removeRoom":
      // a room that holds sessions or Deal Room meetings stays
      return state.sessions.some((s) => s.roomId === action.roomId) || state.dealRoom.meetings.some((m) => m.roomId === action.roomId && m.status !== "Cancelled")
        ? state
        : { ...state, rooms: state.rooms.filter((r) => r.id !== action.roomId) };
    case "setBrand":
      return { ...state, events: state.events.map((e) => (e.id === action.eventId ? { ...e, brand: action.brand, tagline: action.tagline ?? e.tagline } : e)) };
    case "accredit": {
      const who = state.delegates.find((d) => d.id === action.delegateId);
      const op = scanOperator(state);
      // the desk acts for someone signed in on the scanner, so every accreditation names its person (AZ-1)
      if (!who || !op || op.eventId !== who.eventId) return state;
      // an exhibiting company's people wait for its stand to be paid in full; only that may be waived, and only
      // with the PIN of someone the role matrix lets override (OPS-1, AZ-5)
      const refusal = deskRefusal(state, who);
      const approver = action.override?.trim() ? overrider(state, action.pin ?? "", who.eventId) : undefined;
      if (refusal && !(refusal.waivable && approver)) return state;
      const at = action.at ?? nowTime();
      const expo =
        refusal && who.exhibitorId && approver
          ? { ...state.expo, overrides: [...state.expo.overrides, { id: `ov_${state.expo.overrides.length + 1}`, eventId: who.eventId, delegateId: who.id, exhibitorId: who.exhibitorId, reason: `${action.override!.trim()} (${refusal.reason})`, day: action.day, at: `${state.expo.clock.slice(0, 11)}${at}`, by: approver.id, operator: op.member.id }] }
          : state.expo;
      return {
        ...state,
        expo,
        delegates: state.delegates.map((d) =>
          d.id === action.delegateId
            ? { ...d, accredited: true, status: d.status === "Confirmed" ? "Checked in" : d.status, checkIns: d.checkIns.some((c) => c.day === action.day) ? d.checkIns : [...d.checkIns, { day: action.day, at, by: op.member.id }] }
            : d,
        ),
      };
    }
    case "scanSignIn": {
      // AZ-1: a scanner works for one person on one event, signed in with their own PIN
      const m = state.team.find((x) => x.id === action.memberId);
      if (!m || scanRefusal(state, m, action.eventId) || !action.pin || m.pin !== action.pin) return state;
      return { ...state, scanSession: { memberId: m.id, eventId: action.eventId } };
    }
    case "scanSignOut":
      return { ...state, scanSession: undefined };
    case "scan": {
      const op = scanOperator(state);
      const who = state.delegates.find((d) => d.id === action.delegateId);
      if (!op || !who || op.eventId !== who.eventId) return state;
      // an override needs the PIN of someone allowed to give one, and never waives a bad, unpaid or unaccredited badge
      const approver = action.verdict === "override" ? overrider(state, action.pin ?? "", who.eventId) : undefined;
      if (action.verdict === "override" && (!approver || entryBar(who, state))) return state;
      const delta = action.verdict === "deny" ? 0 : action.direction === "in" ? 1 : -1;
      return {
        ...state,
        zones: state.zones.map((z) => (z.id === action.zoneId ? { ...z, occupancy: Math.max(0, z.occupancy + delta) } : z)),
        delegates: state.delegates.map((d) =>
          d.id === action.delegateId
            ? {
                ...d,
                status: action.verdict !== "deny" && d.status === "Confirmed" ? "Checked in" : d.status,
                checkIns: action.verdict !== "deny" && !d.checkIns.some((c) => c.day === action.day) ? [...d.checkIns, { day: action.day, at: action.at ?? nowTime() }] : d.checkIns,
                zoneLog: [{ zoneId: action.zoneId, direction: action.direction, at: action.at ?? nowTime(), verdict: action.verdict, reason: action.reason, by: op.member.id, approvedBy: approver?.id }, ...d.zoneLog],
              }
            : d,
        ),
      };
    }
    case "roomScan": {
      const op = scanOperator(state);
      const who = state.delegates.find((d) => d.id === action.delegateId);
      if (!op || !who || op.eventId !== who.eventId) return state;
      const approver = action.verdict === "override" ? overrider(state, action.pin ?? "", who.eventId) : undefined;
      if (action.verdict === "override" && (!approver || entryBar(who, state))) return state;
      return {
        ...state,
        delegates: state.delegates.map((d) => (d.id === action.delegateId ? { ...d, roomLog: [{ roomId: action.roomId, sessionId: action.sessionId, day: action.day, at: nowTime(), verdict: action.verdict, reason: action.reason, by: op.member.id, approvedBy: approver?.id }, ...(d.roomLog ?? [])] } : d)),
      };
    }
    case "enrol": {
      if (action.on) {
        // one seat per slot: a session that overlaps something already enrolled on the same day is refused
        const me = state.delegates.find((d) => d.id === action.delegateId);
        const target = state.sessions.find((s) => s.id === action.sessionId);
        if (me && target && me.sessions.some((id) => { const o = state.sessions.find((s) => s.id === id); return o && o.id !== target.id && overlaps(o, target); })) return state;
      }
      return {
        ...state,
        sessions: state.sessions.map((s) => (s.id === action.sessionId ? { ...s, enrolled: Math.max(0, s.enrolled + (action.on ? 1 : -1)) } : s)),
        delegates: state.delegates.map((d) => (d.id === action.delegateId ? { ...d, sessions: action.on ? [...new Set([...d.sessions, action.sessionId])] : d.sessions.filter((x) => x !== action.sessionId) } : d)),
      };
    }
    case "book":
      // a Deal Room participant is never bookable through the open calendar; their meetings come by introduction
      if (state.delegates.find((d) => d.id === action.hostId)?.category === "Deal Room") return state;
      return {
        ...state,
        delegates: state.delegates.map((d) => (d.id === action.hostId && d.slots ? { ...d, slots: d.slots.map((s, i) => (i === action.slotIndex ? { ...s, bookedBy: action.byId } : s)) } : d)),
      };
    case "message":
      return { ...state, messages: [...state.messages, { id: `m_${Date.now()}`, from: action.from, to: action.to, body: action.body, at: nowTime() }] };
    case "updateDelegate":
      return { ...state, delegates: state.delegates.map((d) => (d.id === action.delegateId ? { ...d, ...action.patch, ...(d.category === "Deal Room" ? { bookable: false } : {}) } : d)) };
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
    case "signDpa":
      return { ...state, organisers: state.organisers.map((o) => (o.id === action.organiserId ? { ...o, dpaSigned: { by: action.by, at: stamp() } } : o)) };
    case "refund": {
      // the seat goes back to the tier, so the waitlist can take it (OS-7)
      const d = state.delegates.find((x) => x.id === action.delegateId);
      const held = d && (d.status === "Confirmed" || d.status === "Checked in" || d.status === "Refund requested");
      return {
        ...state,
        delegates: state.delegates.map((x) => (x.id === action.delegateId ? { ...x, status: "Refunded", cancelled: true } : x)),
        orders: state.orders.map((o) => (o.delegateId === action.delegateId ? { ...o, status: "refunded" } : o)),
        tiers: state.tiers.map((t) => (held && t.id === d!.tierId ? { ...t, sold: Math.max(0, t.sold - 1) } : t)),
      };
    }
    case "setGrant": {
      if (action.role === "Owner") return state;
      const caps = new Set(state.grants[action.role] ?? []);
      if (action.on) caps.add(action.cap); else caps.delete(action.cap);
      return { ...state, grants: { ...state.grants, [action.role]: [...caps] } };
    }
    case "inviteMember":
      return { ...state, team: [...state.team, action.member] };
    case "setMemberRole":
      return { ...state, team: state.team.map((m) => (m.id === action.memberId && m.role !== "Owner" ? { ...m, role: action.role } : m)) };
    case "removeMember":
      return {
        ...state,
        team: state.team.filter((m) => m.id !== action.memberId || m.role === "Owner"),
        shifts: state.shifts.map((s) => (s.memberId === action.memberId ? { ...s, memberId: undefined } : s)),
      };
    case "assignShift": {
      const same = (s: AppState["shifts"][number]) => s.eventId === action.eventId && s.day === action.day && s.slot === action.slot && s.post === action.post;
      const rest = state.shifts.filter((s) => !same(s));
      return { ...state, shifts: action.memberId ? [...rest, { id: `sh_${action.day}_${action.slot}_${action.post}`, eventId: action.eventId, day: action.day, slot: action.slot, post: action.post, memberId: action.memberId }] : rest };
    }
    case "setBanner": {
      const banners = { ...state.banners };
      if (action.image) banners[action.eventId] = action.image; else delete banners[action.eventId];
      return { ...state, banners };
    }
    case "setFloorPlan": {
      const floorPlans = { ...state.floorPlans };
      if (action.image) floorPlans[action.eventId] = action.image; else delete floorPlans[action.eventId];
      return { ...state, floorPlans };
    }
    case "addGallery": {
      const list = [...(state.galleries[action.eventId] ?? []), ...action.images].slice(0, 12);
      return { ...state, galleries: { ...state.galleries, [action.eventId]: list } };
    }
    case "removeGallery": {
      const list = (state.galleries[action.eventId] ?? []).filter((_, i) => i !== action.index);
      return { ...state, galleries: { ...state.galleries, [action.eventId]: list } };
    }
    case "setSpeakerProfile": {
      const rest = state.speakerProfiles.filter((p) => !(p.eventId === action.profile.eventId && p.name === action.profile.name));
      return { ...state, speakerProfiles: [...rest, action.profile] };
    }
    case "upsertSponsor": {
      const exists = state.sponsors.some((s) => s.id === action.sponsor.id);
      return { ...state, sponsors: exists ? state.sponsors.map((s) => (s.id === action.sponsor.id ? action.sponsor : s)) : [...state.sponsors, action.sponsor] };
    }
    case "removeSponsor":
      return { ...state, sponsors: state.sponsors.filter((s) => s.id !== action.sponsorId) };
    case "setEventLinks":
      return { ...state, events: state.events.map((e) => (e.id === action.eventId ? { ...e, links: action.links, hashtag: action.hashtag ?? e.hashtag } : e)) };
    default:
      return state;
  }
}

const Ctx = createContext<{ state: AppState; dispatch: (a: Action) => void; hydrated: boolean; storageFull: boolean } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, seed, (s) => structuredClone(s));
  const [hydrated, setHydrated] = useReducer(() => true, false);

  const [storageFull, setStorageFull] = useReducer((_: boolean, v: boolean) => v, false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as AppState & { __v?: number };
        // an older save lacks records the seed has since gained: start from the seed instead
        if (saved.__v === SEED_VERSION) dispatch({ type: "hydrate", state: saved });
        else localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
    setHydrated();
  }, []);

  // another tab saved: take its state, so this tab never writes an older copy over newer work.
  // The save that this hydrate triggers is skipped, or two tabs would echo the same state back and forth.
  const fromOtherTab = useRef(false);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      try {
        if (!e.newValue) {
          fromOtherTab.current = true;
          dispatch({ type: "reset" });
          return;
        }
        const saved = JSON.parse(e.newValue) as AppState & { __v?: number };
        if (saved.__v !== SEED_VERSION) return;
        fromOtherTab.current = true;
        dispatch({ type: "hydrate", state: saved });
      } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // saving waits for typing to settle: the whole state is written each time
  useEffect(() => {
    if (!hydrated) return;
    if (fromOtherTab.current) {
      fromOtherTab.current = false;
      return;
    }
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, __v: SEED_VERSION }));
        setStorageFull(false);
      } catch {
        setStorageFull(true);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [state, hydrated]);

  const value = useMemo(() => ({ state, dispatch, hydrated, storageFull }), [state, hydrated, storageFull]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {storageFull && (
        <div role="alert" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-bad text-white px-4 py-2.5 text-[14px] shadow-lg">
          This browser&apos;s storage is full, so changes are not being saved. Remove uploaded images or reset the demo data.
        </div>
      )}
    </Ctx.Provider>
  );
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

/** `now`, a full stamp, is a module's clock; without it the zone windows use the wall clock and the hall door rules are not applied. */
/* ---------- who may scan, and what a PIN may waive (AZ-1, AZ-5) ---------- */

/** Why a team member cannot work a scanner for this event; undefined when they can. */
export function scanRefusal(state: AppState, m: TeamMember, eventId: string): string | undefined {
  if (m.status !== "Active") return `${m.name} has not accepted the invitation yet`;
  if (state.events.find((e) => e.id === eventId)?.organiserId !== m.organiserId || (m.eventIds.length && !m.eventIds.includes(eventId))) return `${m.name} is not on this event's team`;
  if (!can(state.grants, m.role, "access.scan")) return `The ${m.role} role does not scan`;
  if (!m.pin) return `${m.name} has no scanner PIN yet`;
  return undefined;
}

/** The person signed in on the scanner, if they still may scan. */
export function scanOperator(state: AppState) {
  const sess = state.scanSession;
  const member = sess && state.team.find((m) => m.id === sess.memberId);
  return member && !scanRefusal(state, member, sess.eventId) ? { member, eventId: sess.eventId } : undefined;
}

/** The team member a PIN belongs to, when the role matrix lets them override on this event. */
export function overrider(state: AppState, pin: string, eventId: string): TeamMember | undefined {
  if (!pin.trim()) return undefined;
  const organiserId = state.events.find((e) => e.id === eventId)?.organiserId;
  return state.team.find((m) => m.pin === pin.trim() && m.status === "Active" && m.organiserId === organiserId && (!m.eventIds.length || m.eventIds.includes(eventId)) && can(state.grants, m.role, "access.override"));
}

/**
 * What no door may waive: a badge that is not valid, not paid for, or has not been through the desk. Staff can
 * override hours, entitlement, re-entry and capacity; these go back to the desk (DE-12, AZ-5).
 */
export function entryBar(d: Delegate, state: AppState): string | undefined {
  if (d.cancelled || d.status === "Cancelled" || d.status === "Refunded") return "Invalid or cancelled badge";
  if (state.events.find((e) => e.id === d.eventId)?.state === "Suspended") return "Event suspended by Algotech";
  if (d.status === "Pending" || d.status === "Awaiting payment") return "Registration not paid";
  if (d.status === "Waitlisted" || d.status === "Refund requested") return d.status === "Waitlisted" ? "On the waitlist, no seat yet" : "Refund requested";
  if (!d.accredited) return "Not accredited: go to the desk first";
  return undefined;
}

export function scanVerdict(state: AppState, code: string, zoneId: string, direction: "in" | "out", now?: string): ScanVerdict {
  const delegate = state.delegates.find((d) => d.badgeCode.toLowerCase() === code.trim().toLowerCase() || d.id === code.trim());
  if (!delegate) return { verdict: "deny", reason: "Invalid or cancelled badge", waivable: false };
  // the desk comes first: no zone door admits a badge that is not valid, paid and accredited, and no PIN waives it (DE-12, AZ-2)
  const bar = entryBar(delegate, state);
  if (bar) return { verdict: "deny", reason: bar, delegate, waivable: false };
  if (direction === "out") return { verdict: "allow", delegate };
  const tier = state.tiers.find((t) => t.id === delegate.tierId);
  const zone = state.zones.find((z) => z.id === zoneId);
  if (!tier || !zone) return { verdict: "deny", reason: "Unknown zone", delegate, waivable: false };
  const entitled = tier.entitlements.includes(zoneId) || (delegate.grants ?? []).includes(zoneId) || (delegate.category === "VIP" && zoneId === "z_vip") || (delegate.category === "Speaker" && zoneId === "z_breakout");
  if (!entitled) return { verdict: "deny", reason: `Not entitled: ${zone.name}`, delegate, waivable: true };
  // "entitled here, now": a zone with an opening window (the dining hall at lunch) refuses outside it
  if (zone.window) {
    const [from, to] = zone.window.split(/[–-]/).map((t) => t.trim());
    const hm = now ? now.slice(11, 16) : nowTime();
    if (from && to && (hm < from || hm > to)) return { verdict: "deny", reason: `${zone.name} opens ${from} to ${to}`, delegate, waivable: true };
  }
  // the exhibition halls open to stand staff and contractors at their own hours (OPS-2)
  const door = now ? doorProblem(state, delegate, zoneId, now) : undefined;
  if (door) return { verdict: "deny", reason: door, delegate, waivable: true };
  const last = delegate.zoneLog.find((l) => l.zoneId === zoneId);
  if (last && last.direction === "in" && last.verdict !== "deny") return { verdict: "deny", reason: "Anti-passback: already inside", delegate, waivable: true };
  if (zone.occupancy >= zone.capacity) return { verdict: "deny", reason: `Zone full (${zone.capacity})`, delegate, waivable: true };
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

/** The session a room door is scanning for: the live one, else the next scheduled one that day, else the last ended. */
export function sessionAtRoom(state: AppState, roomId: string, day: number): Session | undefined {
  const here = state.sessions.filter((s) => s.roomId === roomId && s.day === day).sort((a, b) => a.start.localeCompare(b.start));
  return here.find((s) => s.status === "live") ?? here.find((s) => s.status === "scheduled") ?? here[here.length - 1];
}

/** AZ-6: the room door. Valid, paid and accredited first; then enrolled, or a walk-in where the facilitator allows it. */
export function roomVerdict(state: AppState, code: string, roomId: string, day: number): ScanVerdict & { session?: Session } {
  const delegate = state.delegates.find((d) => d.badgeCode.toLowerCase() === code.trim().toLowerCase() || d.id === code.trim());
  if (!delegate) return { verdict: "deny", reason: "Invalid or cancelled badge", waivable: false };
  const bar = entryBar(delegate, state);
  if (bar) return { verdict: "deny", reason: bar, delegate, waivable: false };
  const session = sessionAtRoom(state, roomId, day);
  if (!session) return { verdict: "deny", reason: "No session in this room today", delegate, waivable: false };
  if (session.status === "ended") return { verdict: "deny", reason: `${session.title} has ended`, delegate, session, waivable: false };
  if ((delegate.roomLog ?? []).some((l) => l.sessionId === session.id && l.verdict !== "deny")) return { verdict: "deny", reason: "Already in this session", delegate, session, waivable: true };
  const enrolled = delegate.sessions.includes(session.id);
  if (enrolled) return { verdict: "allow", reason: `Enrolled: ${session.title}`, delegate, session };
  const seats = state.delegates.filter((d) => (d.roomLog ?? []).some((l) => l.sessionId === session.id && l.verdict !== "deny")).length;
  const room = state.rooms.find((r) => r.id === roomId);
  if (session.walkIns && room && seats < room.capacity) return { verdict: "allow", reason: `Walk-in: ${session.title}`, delegate, session };
  return { verdict: "deny", reason: session.walkIns ? `${room?.name ?? "Room"} is full` : `Not enrolled: ${session.title} is enrolled only`, delegate, session, waivable: true };
}

export function payoutsFor(state: AppState, organiserId: string): Payout[] {
  const eventIds = state.events.filter((e) => e.organiserId === organiserId).map((e) => e.id);
  return PERIODS.map((p) => {
    const orders = state.orders.filter((o) => eventIds.includes(o.eventId) && o.status === "paid" && o.at >= p.from && o.at <= p.to);
    const gross = orders.reduce((a, o) => a + o.gross, 0);
    const commission = orders.reduce((a, o) => a + o.commission, 0);
    return { id: p.id, organiserId, date: p.date, status: state.payoutsPaid.includes(`${organiserId}/${p.id}`) ? "Paid" : p.status, orders, gross, commission, net: gross - commission };
  });
}
