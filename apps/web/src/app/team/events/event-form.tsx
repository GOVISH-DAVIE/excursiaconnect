"use client";

/** An event's details, as the organiser drafts them: the same form for a new event and for editing a draft. */
import { useState } from "react";
import type { EventInput, EventView } from "@excursia/contracts/onboarding";

/** The time zones the region's events run in; others can be added as clients need them. */
const TIMEZONES = [
  ["Africa/Nairobi", "East Africa (Nairobi, Kampala, Dar es Salaam, Addis Ababa)"],
  ["Africa/Kigali", "Central Africa (Kigali, Lusaka, Harare)"],
  ["Africa/Johannesburg", "South Africa (Johannesburg)"],
  ["Africa/Lagos", "West Africa (Lagos, Kinshasa)"],
  ["Africa/Accra", "West Africa (Accra, Dakar, Abidjan)"],
  ["Africa/Cairo", "North Africa (Cairo)"],
  ["Europe/London", "London"],
  ["Asia/Dubai", "Dubai"],
] as const;

const slugFor = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

export function EventForm({ initial, disabled, busy, submitLabel, onSave }: { initial?: EventView; disabled?: boolean; busy?: boolean; submitLabel: string; onSave: (input: EventInput) => void }) {
  const [f, setF] = useState({
    kind: initial?.kind ?? ("summit" as "summit" | "dealroom"),
    timezone: initial?.timezone ?? "Africa/Nairobi",
    currency: initial?.currency ?? ("KES" as "KES" | "USD"),
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    tagline: initial?.tagline ?? "",
    venue: initial?.venue ?? "",
    city: initial?.city ?? "Nairobi",
    startDate: initial?.startDate ?? "",
    endDate: initial?.endDate ?? "",
    expectedAttendance: String(initial?.expectedAttendance ?? ""),
    primary: initial?.brand.primary ?? "#0F4C81",
    logoText: initial?.brand.logoText ?? "",
    dealRoom: !!initial?.dealRoomRequest,
    leadName: initial?.dealRoomRequest?.lead.name ?? "",
    leadEmail: initial?.dealRoomRequest?.lead.email ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const slug = f.slug || slugFor(f.name);
  const input = (k: keyof typeof f, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <div>
      <label className="label" htmlFor={`ev-${k}`}>
        {label}
      </label>
      <input id={`ev-${k}`} className="input" value={String(f[k])} onChange={set(k)} disabled={disabled} {...props} />
      {hint && <p className="mt-1 text-[12px] text-slate">{hint}</p>}
    </div>
  );

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          kind: f.kind,
          timezone: f.timezone,
          currency: f.currency,
          name: f.name,
          ...(initial ? {} : { slug }),
          tagline: f.tagline,
          venue: f.venue,
          city: f.city,
          startDate: f.startDate,
          endDate: f.endDate || f.startDate,
          expectedAttendance: Number(f.expectedAttendance) || 0,
          brand: { primary: f.primary, logoText: f.logoText || f.name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 4) },
          dealRoomRequest: f.dealRoom || f.kind === "dealroom" ? { lead: { name: f.leadName, email: f.leadEmail } } : null,
        });
      }}
    >
      <fieldset className="sm:col-span-2" disabled={disabled}>
        <legend className="label">What kind of event</legend>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
          {(
            [
              ["summit", "A summit or conference", "Tickets and registration, with the Deal Room as an optional add-on"],
              ["dealroom", "A Deal Room on its own", "Curated meetings between businesses and investors, buyers or partners; no tickets"],
            ] as const
          ).map(([k, label, hint]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={f.kind === k}
              onClick={() => setF((x) => ({ ...x, kind: k }))}
              className={`rounded-lg border p-3 text-left ${f.kind === k ? "border-ink bg-paper-200" : "border-line hover:border-line-strong"}`}
            >
              <span className="block text-[15px] font-medium">{label}</span>
              <span className="mt-1 block text-[13px] text-slate">{hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2">{input("name", "Event name", { required: true, minLength: 3 })}</div>
      {!initial && (
        <div className="sm:col-span-2">
          {input("slug", "Web address", { placeholder: slugFor(f.name) || "your-event-name", pattern: "[a-z0-9]+(-[a-z0-9]+)*" }, `Its pages will be at /e/${slug || "…"}. It can't change once the event is created.`)}
        </div>
      )}
      <div className="sm:col-span-2">{input("tagline", "One line about it", { maxLength: 200 })}</div>
      {input("venue", "Venue")}
      {input("city", "City")}
      {input("startDate", "First day", { type: "date", required: true })}
      {input("endDate", "Last day", { type: "date" })}
      <div>
        <label className="label" htmlFor="ev-timezone">
          Time zone
        </label>
        <select id="ev-timezone" className="input" value={f.timezone} disabled={disabled} onChange={(e) => setF((x) => ({ ...x, timezone: e.target.value }))}>
          {TIMEZONES.map(([tz, label]) => (
            <option key={tz} value={tz}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="ev-currency">
          {f.kind === "dealroom" ? "Currency for fees" : "Ticket currency"}
        </label>
        <select id="ev-currency" className="input" value={f.currency} disabled={disabled} onChange={(e) => setF((x) => ({ ...x, currency: e.target.value as "KES" | "USD" }))}>
          <option value="KES">Kenya shillings (KES)</option>
          <option value="USD">US dollars (USD)</option>
        </select>
      </div>
      {input("expectedAttendance", f.kind === "dealroom" ? "Expected participants" : "Expected attendance", { type: "number", min: 0, inputMode: "numeric" })}
      <div className="grid grid-cols-[auto_1fr] items-end gap-3">
        <div>
          <label className="label" htmlFor="ev-primary">
            Brand colour
          </label>
          <input id="ev-primary" type="color" className="h-10 w-14 rounded border border-line" value={f.primary} onChange={set("primary")} disabled={disabled} />
        </div>
        {input("logoText", "Short mark", { maxLength: 6, placeholder: "SCS" })}
      </div>

      <div className="rounded-lg border border-line p-4 sm:col-span-2">
        {f.kind === "dealroom" ? (
          <p className="text-[14px] font-medium">The Deal Room&apos;s lead</p>
        ) : (
          <label className="flex items-center gap-2 text-[14px] font-medium">
            <input type="checkbox" checked={f.dealRoom} onChange={set("dealRoom")} disabled={disabled} />
            Ask for the Deal Room add-on
          </label>
        )}
        <p className="mt-1 text-[13px] text-slate">
          {f.kind === "dealroom" ? "Who runs it: they review applications and set its missions and dates. " : "Curated investor, buyer and partner meetings, with applications and review. "}
          Algotech sets its price when it approves the event, and gives the lead their account.
        </p>
        {(f.dealRoom || f.kind === "dealroom") && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {input("leadName", "Deal Room lead's name", { required: true })}
            {input("leadEmail", "Lead's work email", { type: "email", required: true })}
          </div>
        )}
      </div>

      {!disabled && (
        <div className="sm:col-span-2">
          <button className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : submitLabel}
          </button>
        </div>
      )}
    </form>
  );
}
