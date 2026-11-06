"use client";

import { useState, type ReactNode } from "react";
import { Section } from "@/components/ui";
import { CATEGORIES, useStore } from "@/lib/store";
import { readableOn } from "@/lib/brand";
import type { Category, EventRecord, FormField, Room, Session, Tier, Zone } from "@/lib/types";

/* The editors an organiser needs to build an event (OR-3, OR-4, OR-6, OR-12, OR-13). Each is a
   panel that opens inside its tab, saves to the store and closes; nothing is a modal. */

const uid = (p: string) => `${p}_${Date.now().toString(36)}`;

function F({ label, children, span = 1, help }: { label: string; children: ReactNode; span?: 1 | 2 | 3; help?: string }) {
  return (
    <div className={span === 3 ? "sm:col-span-3" : span === 2 ? "sm:col-span-2" : ""}>
      <label className="label">{label}</label>
      {children}
      {help && <p className="mt-1 text-[13px] text-slate">{help}</p>}
    </div>
  );
}

function Foot({ onClose, onDelete, deleteLabel, deleteBlocked, save }: { onClose: () => void; onDelete?: () => void; deleteLabel?: string; deleteBlocked?: string; save: string }) {
  return (
    <div className="sm:col-span-3 flex items-center justify-between gap-3 pt-1">
      <span>
        {onDelete && (
          <button type="button" className="btn-quiet text-bad" disabled={!!deleteBlocked} title={deleteBlocked} onClick={onDelete}>
            {deleteLabel ?? "Remove"}
          </button>
        )}
      </span>
      <span className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">{save}</button>
      </span>
    </div>
  );
}

/* ---------- tiers ---------- */

export function TierEditor({ eventId, tier, onClose }: { eventId: string; tier?: Tier; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const event = state.events.find((e) => e.id === eventId)!;
  const zones = state.zones.filter((z) => z.eventId === eventId);
  const [t, setT] = useState<Tier>(tier ?? { id: uid("t"), eventId, name: "", price: 0, currency: "KES", cap: 100, sold: 0, visibility: "public", approval: "auto", entitlements: ["all-days", ...zones.filter((z) => z.id !== "z_vip").map((z) => z.id)], description: "" });
  const toggle = (e: string) => setT({ ...t, entitlements: t.entitlements.includes(e) ? t.entitlements.filter((x) => x !== e) : [...t.entitlements, e] });
  const moneyChange = !!tier && event.state === "Live" && (tier.price !== t.price || tier.currency !== t.currency);
  const minCap = Math.max(1, tier?.sold ?? 0);
  const bad = t.cap < minCap ? `Capacity must be at least ${minCap}` : t.saleFrom && t.saleTo && t.saleTo < t.saleFrom ? "The sale must end after it starts" : undefined;

  return (
    <Section title={tier ? `Edit ${tier.name}` : "New ticket tier"} className="mb-4">
      <form
        className="grid gap-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!t.name || bad) return;
          dispatch({ type: "upsertTier", tier: t });
          onClose();
        }}
      >
        <F label="Name" span={2}><input className="input" required value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Full conference" /></F>
        <F label="Visibility">
          <select className="input" value={t.visibility} onChange={(e) => setT({ ...t, visibility: e.target.value as Tier["visibility"] })}>
            <option value="public">Public</option>
            <option value="hidden">Hidden (link only)</option>
            <option value="invite">Invite only</option>
          </select>
        </F>
        <F label="Price"><input type="number" min={0} className="input" value={t.price} onChange={(e) => setT({ ...t, price: Number(e.target.value) })} /></F>
        <F label="Currency">
          <select className="input" value={t.currency} onChange={(e) => setT({ ...t, currency: e.target.value as Tier["currency"] })}><option>KES</option><option>USD</option></select>
        </F>
        <F label="Capacity" help={tier ? `${tier.sold} sold so far` : undefined}><input type="number" min={minCap} required className="input" value={t.cap} onChange={(e) => setT({ ...t, cap: Number(e.target.value) })} /></F>
        <F label="On sale from" help="Empty: now"><input type="date" className="input" value={t.saleFrom ?? ""} onChange={(e) => setT({ ...t, saleFrom: e.target.value || undefined })} /></F>
        <F label="On sale until" help="Empty: the first day of the event"><input type="date" min={t.saleFrom} className="input" value={t.saleTo ?? ""} onChange={(e) => setT({ ...t, saleTo: e.target.value || undefined })} /></F>
        {bad && <p className="sm:col-span-3 text-[13px] text-bad">{bad}</p>}
        <F label="Confirmation">
          <select className="input" value={t.approval} onChange={(e) => setT({ ...t, approval: e.target.value as Tier["approval"] })}>
            <option value="auto">Automatic on payment</option>
            <option value="organiser">Organiser approves first</option>
          </select>
        </F>
        <F label="Description" span={3}><input className="input" value={t.description} onChange={(e) => setT({ ...t, description: e.target.value })} placeholder="What the ticket includes, in one line" /></F>
        <div className="sm:col-span-3">
          <div className="label">Entitlements</div>
          <div className="flex flex-wrap gap-2">
            {[
              ["all-days", "All days"],
              ["day-1", "Day 1 only"],
              ...zones.map((z) => [z.id, z.name] as [string, string]),
              ["breakouts", "Breakout enrolment"],
              ["dinner", "Gala dinner"],
              ["stream", "Live stream"],
            ].map(([id, label]) => (
              <label key={id} className={`pill cursor-pointer select-none ${t.entitlements.includes(id) ? "bg-ink text-white" : "bg-paper-200 text-slate"}`}>
                <input type="checkbox" className="sr-only" checked={t.entitlements.includes(id)} onChange={() => toggle(id)} />
                {label}
              </label>
            ))}
          </div>
        </div>
        {moneyChange && <p className="sm:col-span-3 rounded-lg bg-warn-50 px-3 py-2 text-[14px] text-warn">A price change on a live event goes back to Algotech for re-approval. Registration continues on the approved terms meanwhile.</p>}
        <Foot onClose={onClose} save={tier ? "Save tier" : "Add tier"} onDelete={tier ? () => { dispatch({ type: "removeTier", tierId: tier.id }); onClose(); } : undefined} deleteLabel="Remove tier" deleteBlocked={tier?.sold ? "A tier with sales cannot be removed; pause it instead" : undefined} />
      </form>
    </Section>
  );
}

/* ---------- form fields ---------- */

export function FieldEditor({ eventId, field, onClose }: { eventId: string; field?: FormField; onClose: () => void }) {
  const { dispatch } = useStore();
  const [f, setF] = useState<FormField>(field ?? { id: uid("f"), eventId, label: "", type: "text", required: false, showTo: "Everyone" });
  const cats = f.showTo === "Everyone" ? [] : f.showTo;
  const toggleCat = (c: Category) => {
    const next = cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c];
    setF({ ...f, showTo: next.length === 0 ? "Everyone" : next });
  };
  return (
    <Section title={field ? `Edit field: ${field.label}` : "New form field"} className="mb-4">
      <form
        className="grid gap-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.label) return;
          dispatch({ type: "upsertField", field: f });
          onClose();
        }}
      >
        <F label="Label" span={2}><input className="input" required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Dietary or accessibility needs" /></F>
        <F label="Type">
          <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as FormField["type"] })}>
            <option value="text">Short text</option>
            <option value="textarea">Long text</option>
            <option value="select">Choice</option>
            <option value="file">File upload</option>
          </select>
        </F>
        {f.type === "select" && <F label="Choices, one per line" span={3}><textarea className="input" rows={3} value={(f.options ?? []).join("\n")} onChange={(e) => setF({ ...f, options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} /></F>}
        <F label="Help line" span={2}><input className="input" value={f.help ?? ""} onChange={(e) => setF({ ...f, help: e.target.value || undefined })} /></F>
        <F label="Required">
          <select className="input" value={f.required ? "yes" : "no"} onChange={(e) => setF({ ...f, required: e.target.value === "yes" })}><option value="no">Optional</option><option value="yes">Required</option></select>
        </F>
        <div className="sm:col-span-3">
          <div className="label">Shown to</div>
          <div className="flex flex-wrap gap-2">
            <label className={`pill cursor-pointer ${f.showTo === "Everyone" ? "bg-ink text-white" : "bg-paper-200 text-slate"}`}>
              <input type="checkbox" className="sr-only" checked={f.showTo === "Everyone"} onChange={() => setF({ ...f, showTo: "Everyone" })} />Everyone
            </label>
            {CATEGORIES.map((c) => (
              <label key={c} className={`pill cursor-pointer ${cats.includes(c) ? "bg-ink text-white" : "bg-paper-200 text-slate"}`}>
                <input type="checkbox" className="sr-only" checked={cats.includes(c)} onChange={() => toggleCat(c)} />{c}
              </label>
            ))}
          </div>
        </div>
        <Foot onClose={onClose} save={field ? "Save field" : "Add field"} onDelete={field ? () => { dispatch({ type: "removeField", fieldId: field.id }); onClose(); } : undefined} deleteLabel="Remove field" />
      </form>
    </Section>
  );
}

/* ---------- sessions ---------- */

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function SessionEditor({ eventId, session, onClose }: { eventId: string; session?: Session; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const event = state.events.find((e) => e.id === eventId)!;
  const zoneIds = state.zones.filter((z) => z.eventId === eventId).map((z) => z.id);
  const rooms = state.rooms.filter((r) => zoneIds.includes(r.zoneId));
  const [s, setS] = useState<Session>(session ?? { id: uid("s"), eventId, day: 1, start: "09:00", end: "10:30", title: "", kind: "breakout", speakers: [], enrolled: 0, attended: 0, status: "scheduled", walkIns: false, roomId: rooms[0]?.id, capacity: rooms[0]?.capacity });
  const room = rooms.find((r) => r.id === s.roomId);
  const clash = s.kind === "breakout" && s.roomId ? state.sessions.find((o) => o.id !== s.id && o.eventId === eventId && o.roomId === s.roomId && o.day === s.day && toMin(o.start) < toMin(s.end) && toMin(o.end) > toMin(s.start)) : undefined;
  const bad = toMin(s.end) <= toMin(s.start) ? "End must be after start" : clash ? `Clashes with "${clash.title}", ${clash.start} to ${clash.end} in the same room` : s.capacity && room && s.capacity > room.capacity ? `${room.name} seats ${room.capacity}` : undefined;

  return (
    <Section title={session ? `Edit session` : "New session"} className="mb-4">
      <form
        className="grid gap-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!s.title || bad) return;
          dispatch({ type: "upsertSession", session: { ...s, roomId: s.kind === "breakout" ? s.roomId : undefined, capacity: s.kind === "breakout" ? s.capacity : undefined } });
          onClose();
        }}
      >
        <F label="Title" span={2}><input className="input" required value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} /></F>
        <F label="Kind">
          <select className="input" value={s.kind} onChange={(e) => setS({ ...s, kind: e.target.value as Session["kind"], walkIns: e.target.value !== "breakout" })}>
            <option value="plenary">Plenary, main hall</option>
            <option value="breakout">Breakout, in a room</option>
            <option value="break">Break</option>
            <option value="social">Social</option>
          </select>
        </F>
        <F label="Day">
          <select className="input" value={s.day} onChange={(e) => setS({ ...s, day: Number(e.target.value) })}>
            {Array.from({ length: event.days }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Day {d}</option>)}
          </select>
        </F>
        <F label="Start"><input type="time" className="input" required value={s.start} onChange={(e) => setS({ ...s, start: e.target.value })} /></F>
        <F label="End"><input type="time" className="input" required value={s.end} onChange={(e) => setS({ ...s, end: e.target.value })} /></F>
        {s.kind === "breakout" && (
          <>
            <F label="Room">
              <select className="input" value={s.roomId ?? ""} onChange={(e) => { const r = rooms.find((x) => x.id === e.target.value); setS({ ...s, roomId: r?.id, capacity: r?.capacity ?? s.capacity }); }}>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}, {r.capacity} seats</option>)}
              </select>
            </F>
            <F label="Seats offered" help={room ? `${room.name} seats ${room.capacity}` : undefined}><input type="number" min={1} className="input" value={s.capacity ?? ""} onChange={(e) => setS({ ...s, capacity: Number(e.target.value) })} /></F>
            <F label="Door rule">
              <select className="input" value={s.walkIns ? "walk" : "enrolled"} onChange={(e) => setS({ ...s, walkIns: e.target.value === "walk" })}><option value="enrolled">Enrolled delegates only</option><option value="walk">Enrolled plus walk-ins</option></select>
            </F>
          </>
        )}
        <F label="Track" help="Optional, groups breakouts on the programme"><input className="input" value={s.track ?? ""} onChange={(e) => setS({ ...s, track: e.target.value || undefined })} placeholder="PR" /></F>
        <F label="Speakers, comma separated" span={2}><input className="input" value={s.speakers.join(", ")} onChange={(e) => setS({ ...s, speakers: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="Esther Njeri, Brian Otieno" /></F>
        {bad && <p className="sm:col-span-3 rounded-lg bg-bad-50 px-3 py-2 text-[14px] text-bad">{bad}</p>}
        <Foot onClose={onClose} save={session ? "Save session" : "Add session"} onDelete={session ? () => { dispatch({ type: "removeSession", sessionId: session.id }); onClose(); } : undefined} deleteLabel="Remove session" deleteBlocked={session?.enrolled ? `${session.enrolled} delegates are enrolled; they lose the seat` : undefined} />
      </form>
    </Section>
  );
}

/* ---------- zones and rooms ---------- */

export function ZoneEditor({ eventId, zone, onClose }: { eventId: string; zone?: Zone; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [z, setZ] = useState<Zone>(zone ?? { id: uid("z"), eventId, name: "", capacity: 100, occupancy: 0 });
  const hasRooms = state.rooms.some((r) => r.zoneId === z.id);
  const inside = zone?.occupancy ?? 0;
  const bad = z.capacity < Math.max(1, inside) ? `${inside} people are inside now; capacity cannot go below that` : z.window && !/^\d{2}:\d{2}[–-]\d{2}:\d{2}$/.test(z.window) ? "Window as HH:MM–HH:MM, for example 12:30–14:00" : undefined;
  return (
    <Section title={zone ? `Edit ${zone.name}` : "New zone"} className="mb-4">
      <form
        className="grid gap-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!z.name || bad) return;
          dispatch({ type: "upsertZone", zone: z });
          onClose();
        }}
      >
        <F label="Name" span={2}><input className="input" required value={z.name} onChange={(e) => setZ({ ...z, name: e.target.value })} placeholder="Exhibition" /></F>
        <F label="Capacity" help={inside ? `${inside} inside now. Scanners warn at 90% and stop at 100%` : "Scanners warn at 90% and stop at 100% unless overridden"}><input type="number" min={Math.max(1, inside)} className="input" value={z.capacity} onChange={(e) => setZ({ ...z, capacity: Number(e.target.value) })} /></F>
        <F label="Opening window" span={2} help="Empty: all day. The door refuses outside it, as 12:30–14:00 for lunch."><input className="input" value={z.window ?? ""} onChange={(e) => setZ({ ...z, window: e.target.value || undefined })} placeholder="12:30–14:00" /></F>
        {bad && <p className="sm:col-span-3 text-[13px] text-bad">{bad}</p>}
        <p className="sm:col-span-3 text-[13px] text-slate">Which tickets may enter is set on each tier&apos;s entitlements; a delegate can also be granted this zone by hand on their record.</p>
        <Foot onClose={onClose} save={zone ? "Save zone" : "Add zone"} onDelete={zone ? () => { dispatch({ type: "removeZone", zoneId: zone.id }); onClose(); } : undefined} deleteLabel="Remove zone" deleteBlocked={hasRooms ? "Remove its rooms first" : zone?.occupancy ? "People are inside" : undefined} />
      </form>
    </Section>
  );
}

export function RoomEditor({ eventId, room, onClose }: { eventId: string; room?: Room; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const zones = state.zones.filter((z) => z.eventId === eventId);
  const [r, setR] = useState<Room>(room ?? { id: uid("r"), zoneId: zones.find((z) => z.id === "z_breakout")?.id ?? zones[0]?.id ?? "", name: "", capacity: 40 });
  const using = state.sessions.filter((s) => s.roomId === r.id);
  const inUse = using.length;
  const biggest = using.reduce((m, s) => Math.max(m, s.capacity ?? 0, s.enrolled), 0);
  const bad = biggest && r.capacity < biggest ? `Sessions in this room already offer ${biggest} seats; cut their seats first` : undefined;
  return (
    <Section title={room ? `Edit ${room.name}` : "New room"} className="mb-4">
      <form
        className="grid gap-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!r.name || bad) return;
          dispatch({ type: "upsertRoom", room: r });
          onClose();
        }}
      >
        <F label="Name"><input className="input" required value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Room D (Aberdare)" /></F>
        <F label="Inside zone">
          <select className="input" value={r.zoneId} onChange={(e) => setR({ ...r, zoneId: e.target.value })}>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>
        </F>
        <F label="Seats" help={biggest ? `Sessions here offer up to ${biggest}` : undefined}><input type="number" min={Math.max(1, biggest)} className="input" value={r.capacity} onChange={(e) => setR({ ...r, capacity: Number(e.target.value) })} /></F>
        {bad && <p className="sm:col-span-3 text-[13px] text-bad">{bad}</p>}
        <Foot onClose={onClose} save={room ? "Save room" : "Add room"} onDelete={room ? () => { dispatch({ type: "removeRoom", roomId: room.id }); onClose(); } : undefined} deleteLabel="Remove room" deleteBlocked={inUse ? `${inUse} session${inUse > 1 ? "s" : ""} use this room` : undefined} />
      </form>
    </Section>
  );
}

/* ---------- brand ---------- */

export function BrandEditor({ event, onClose }: { event: EventRecord; onClose: () => void }) {
  const { dispatch } = useStore();
  const [b, setB] = useState({ primary: event.brand.primary, logoText: event.brand.logoText, tagline: event.tagline });
  return (
    <Section title="Brand" className="mb-4">
      <form
        className="grid gap-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          dispatch({ type: "setBrand", eventId: event.id, brand: { primary: b.primary, logoText: b.logoText }, tagline: b.tagline });
          onClose();
        }}
      >
        <F label="Colour" help={`Buttons show ${readableOn(b.primary) === "#ffffff" ? "white" : "dark"} text on it, for contrast`}>
          <div className="flex items-center gap-2">
            <input type="color" className="h-12 w-14 rounded-md border border-line-strong bg-white p-1" value={b.primary} onChange={(e) => setB({ ...b, primary: e.target.value })} aria-label="Brand colour" />
            <input className="input font-mono" value={b.primary} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && setB({ ...b, primary: e.target.value })} />
          </div>
        </F>
        <F label="Mark" help="Two to four letters on the mark tile"><input className="input" maxLength={4} value={b.logoText} onChange={(e) => setB({ ...b, logoText: e.target.value.toUpperCase() })} /></F>
        <F label="Tagline" help="Under the name on the public page"><input className="input" value={b.tagline} onChange={(e) => setB({ ...b, tagline: e.target.value })} /></F>
        <Foot onClose={onClose} save="Save brand" />
      </form>
    </Section>
  );
}
