/**
 * The core records the database holds today, between the rules' shapes and rows: organisers, events, tiers,
 * delegates and badges. Each row keeps the whole record in `record` (JSONB) plus the columns the database indexes
 * or constrains; reading back takes the record, so the round trip is exact (tests/mappers.test.ts).
 *
 * Zones, rooms, the programme, orders, the team and the rest of the core stay on the prototype store until
 * Phase 2 normalises them; the Exhibition until Phase 5 (D9).
 */
import type { Prisma } from "@excursia/db";
import type { Delegate, EventRecord, Organiser, Tier } from "@excursia/domain/types";
import { toDay } from "../../persistence/time";

export type CoreRecords = { organisers: Organiser[]; events: EventRecord[]; tiers: Tier[]; delegates: Delegate[] };

export type CoreRows = {
  organisers: Prisma.OrganiserCreateManyInput[];
  events: Prisma.EventCreateManyInput[];
  tiers: Prisma.TierCreateManyInput[];
  delegates: Prisma.DelegateCreateManyInput[];
  badges: Prisma.BadgeCreateManyInput[];
};

/** A record as JSON for a `record` column. The rules' records are plain data, so this loses nothing. */
export const json = <T>(value: T) => value as unknown as Prisma.InputJsonValue;

export function coreToRows(core: CoreRecords, opts: { demo: boolean }): CoreRows {
  return {
    organisers: core.organisers.map((o) => ({ id: o.id, name: o.name, demo: opts.demo, record: json(o) })),
    events: core.events.map((e) => ({
      id: e.id,
      organiserId: e.organiserId,
      slug: e.slug,
      name: e.name,
      startDate: toDay(e.startDate),
      endDate: toDay(e.endDate),
      state: e.state,
      demo: opts.demo,
      record: json(e),
    })),
    tiers: core.tiers.map((t) => ({ id: t.id, eventId: t.eventId, name: t.name, price: t.price, currency: t.currency, cap: t.cap, record: json(t) })),
    delegates: core.delegates.map((d) => ({
      id: d.id,
      eventId: d.eventId,
      tierId: d.tierId,
      name: d.name,
      email: d.email || null,
      phone: d.phone || null,
      organisation: d.organisation || null,
      category: d.category,
      status: d.status,
      accredited: d.accredited,
      exhibitorId: d.exhibitorId ?? null,
      record: json(d),
    })),
    badges: core.delegates.filter((d) => d.badgeCode && !d.cancelled).map((d) => ({ code: d.badgeCode, delegateId: d.id, eventId: d.eventId })),
  };
}

/** Rows as read back: only `record` matters, the columns are copies of what is in it. */
type Stored = { record: Prisma.JsonValue };
const records = <T>(rows: Stored[]) => rows.map((r) => r.record as unknown as T);

export function coreFromRows(rows: { organisers: Stored[]; events: Stored[]; tiers: Stored[]; delegates: Stored[] }): CoreRecords {
  return {
    organisers: records<Organiser>(rows.organisers),
    events: records<EventRecord>(rows.events),
    tiers: records<Tier>(rows.tiers),
    delegates: records<Delegate>(rows.delegates),
  };
}
