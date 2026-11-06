"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Programme } from "@/components/programme";
import { Bars, Empty, EventPill, Meter, PageHeader, Section, Stat, StatusPill, Tabs } from "@/components/ui";
import { money, useStore } from "@/lib/store";
import type { Delegate, EventRecord, FormField, Order, Room, Session, Tier, Zone } from "@/lib/types";
import { MediaTab } from "./media";
import { BrandEditor, FieldEditor, RoomEditor, SessionEditor, TierEditor, ZoneEditor } from "./editors";
import { readableOn } from "@/lib/brand";

const tabs = ["Overview", "Delegates", "Tickets and form", "Programme", "Media", "Zones and rooms", "Finance"] as const;
type Tab = (typeof tabs)[number];

export function EventWorkspace({ id }: { id: string }) {
  const { state, dispatch } = useStore();
  const search = useSearchParams();
  const router = useRouter();
  const tab = (tabs.find((t) => t === search.get("tab")) ?? "Overview") as Tab;
  const [editor, setEditor] = useState<{ kind: "tier"; tier?: Tier } | { kind: "field"; field?: FormField } | { kind: "session"; session?: Session } | { kind: "zone"; zone?: Zone } | { kind: "room"; room?: Room } | { kind: "brand" } | null>(null);
  const [closing, setClosing] = useState(false);
  const closeEditor = () => setEditor(null);
  const setTab = (t: Tab) => router.replace(`/organiser/events/${id}${t === "Overview" ? "" : `?tab=${encodeURIComponent(t)}`}`);

  const event = state.events.find((e) => e.id === id);
  if (!event) return <Empty>Event not found.</Empty>;
  const organiser = state.organisers.find((o) => o.id === event.organiserId);
  const base = `/organiser/events/${id}`;
  const tiers = state.tiers.filter((t) => t.eventId === id);
  const delegates = state.delegates.filter((d) => d.eventId === id);
  const orders = state.orders.filter((o) => o.eventId === id);
  const zones = state.zones.filter((z) => z.eventId === id);
  const sessions = state.sessions.filter((s) => s.eventId === id);

  const confirmed = delegates.filter((d) => d.status === "Confirmed" || d.status === "Checked in");
  const checkedIn = delegates.filter((d) => d.checkIns.length > 0);
  const paid = orders.filter((o) => o.status === "paid");
  const gross = paid.reduce((a, o) => a + o.gross, 0);
  const net = paid.reduce((a, o) => a + o.net, 0);
  const commission = paid.reduce((a, o) => a + o.commission, 0);
  const pending = delegates.filter((d) => d.status === "Pending");

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/organiser", label: "Events" }, { label: event.name }]}
        title={event.name}
        badge={<EventPill state={event.state} />}
        kicker={`${event.venue}, ${event.city}. ${event.days} days, ${event.expectedAttendance} expected.`}
        actions={
          <>
            <Link href={`/e/${event.slug}`} className="btn-secondary" target="_blank">
              Public page
            </Link>
            {(event.state === "Draft" || event.state === "Changes requested") && (
              <button className="btn-primary" disabled={organiser?.kycStatus !== "Verified"} title={organiser?.kycStatus !== "Verified" ? "KYC must be verified before you can submit" : undefined} onClick={() => dispatch({ type: "setEventState", eventId: id, state: "Submitted" })}>
                {event.state === "Draft" ? "Submit for approval" : "Resubmit for approval"}
              </button>
            )}
            {event.state === "Approved" && (
              <button className="btn-primary" onClick={() => dispatch({ type: "setEventState", eventId: id, state: "Live" })}>
                Open registration
              </button>
            )}
            {event.state === "Live" && !closing && (
              <button className="btn-secondary" onClick={() => setClosing(true)}>
                Close event
              </button>
            )}
            {event.state === "Live" && closing && (
              <span className="inline-flex items-center gap-2 rounded-md bg-warn-50 px-3 py-1.5 text-[13px] text-warn">
                Registration stops and the report is issued.
                <button className="btn-primary btn-sm" onClick={() => { dispatch({ type: "closeEvent", eventId: id }); setClosing(false); }}>Close it</button>
                <button className="btn-quiet" onClick={() => setClosing(false)}>Keep open</button>
              </span>
            )}
            {event.state === "Closed" && (
              <button className="btn-primary" onClick={() => exportWorkbook(event, delegates, orders, tiers)}>
                Download report
              </button>
            )}
          </>
        }
      />

      <Tabs tabs={tabs} value={tab} onChange={setTab} counts={{ Delegates: pending.length }} />

      {tab === "Overview" && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Confirmed delegates" value={confirmed.length} sub={`${Math.round((confirmed.length / event.expectedAttendance) * 100)}% of ${event.expectedAttendance} expected`} href={`${base}?tab=Delegates&status=Confirmed`} />
            <Stat label="Checked in, day 1" value={checkedIn.length} sub={confirmed.length ? `${Math.round((checkedIn.length / confirmed.length) * 100)}% of confirmed` : undefined} tone="ok" href={`${base}?tab=Delegates&status=Checked in`} />
            <Stat label="Gross collected" value={money(gross)} sub={`Net to you ${money(net)}`} href={`${base}?tab=Finance`} />
            <Stat label="Awaiting your approval" value={pending.length} tone={pending.length ? "warn" : undefined} sub="invite-only tiers" href={`${base}?tab=Delegates&status=Pending`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Section title="Registrations, last 12 days" className="lg:col-span-2">
              <Bars values={event.registrationsByDay.length ? event.registrationsByDay : [0]} height={120} labels={["12 days ago", "Today"]} />
            </Section>
            <Section title="Occupancy now" flush>
              <ul>
                {zones.map((z) => (
                  <li key={z.id}>
                    <Link href={`${base}/zones/${z.id}`} className="block px-5 py-3 border-b border-line last:border-0 hover:bg-paper">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{z.name}</span>
                        <span className={`num ${z.occupancy / z.capacity >= 0.9 ? "text-bad font-medium" : "text-slate"}`}>
                          {z.occupancy} / {z.capacity}
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <Meter value={z.occupancy} max={z.capacity} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Ticket tiers" flush>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Tier</th>
                    <th className="th-r">Sold</th>
                    <th className="th-r">Cap</th>
                    <th className="th-r">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t) => (
                    <tr key={t.id} className="hover:bg-paper">
                      <td className="td">
                        <Link href={`${base}/tiers/${t.id}`} className="font-medium hover:underline">
                          {t.name}
                        </Link>
                      </td>
                      <td className="td-r">{t.sold}</td>
                      <td className="td-r text-slate">{t.cap}</td>
                      <td className="td-r">{money(orders.filter((o) => o.tierId === t.id && o.status === "paid").reduce((a, o) => a + o.gross, 0), t.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
            <Section title="Breakout fill" flush>
              <ul>
                {sessions
                  .filter((s) => s.kind === "breakout")
                  .map((s) => (
                    <li key={s.id}>
                      <Link href={`${base}/sessions/${s.id}`} className="flex items-center gap-3 px-5 py-2.5 border-b border-line last:border-0 hover:bg-paper text-sm">
                        <span className="flex-1 truncate font-medium">{s.title}</span>
                        <span className="w-24">
                          <Meter value={s.enrolled} max={s.capacity ?? 1} warnAt={0.8} badAt={1} />
                        </span>
                        <span className="w-14 text-right num text-slate">
                          {s.enrolled}/{s.capacity}
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </Section>
          </div>
        </div>
      )}

      {event.state === "Changes requested" && event.reviewNote && (
        <div className="mb-5 rounded-lg bg-coral-50 px-4 py-3 text-[14px] text-coral-600">
          <span className="font-medium">Algotech asked for changes:</span> {event.reviewNote}. Edit and resubmit.
        </div>
      )}
      {event.state === "Suspended" && (
        <div className="mb-5 rounded-lg bg-bad-50 px-4 py-3 text-[14px] text-bad">
          <span className="font-medium">Suspended by Algotech:</span> {event.reviewNote || "no reason given"}. Registration and scanning are paused and payouts are held until it is lifted. Reply to Algotech to resolve it.
        </div>
      )}
      {event.state === "Under review" && event.stateBefore === "Live" && (
        <div className="mb-5 rounded-lg bg-warn-50 px-4 py-3 text-[14px] text-warn">
          <span className="font-medium">Back with Algotech:</span> {event.reviewNote}. Registration continues at the approved prices; the new price takes effect when Algotech approves it.
        </div>
      )}
      {event.state === "Closed" && (
        <div className="mb-5 rounded-lg bg-paper-200 px-4 py-3 text-[14px] text-slate">
          Closed {event.closedAt}. The figures below are final; the workbook holds every delegate and order.
        </div>
      )}

      {tab === "Delegates" && <DelegatesTab event={event} delegates={delegates} tiers={tiers} base={base} initialStatus={search.get("status") ?? "All"} tierName={(tid) => tiers.find((t) => t.id === tid)?.name ?? ""} />}

      {tab === "Tickets and form" && editor?.kind === "tier" && <TierEditor eventId={id} tier={editor.tier} onClose={closeEditor} />}
      {tab === "Tickets and form" && editor?.kind === "field" && <FieldEditor eventId={id} field={editor.field} onClose={closeEditor} />}
      {tab === "Tickets and form" && editor?.kind === "brand" && <BrandEditor event={event} onClose={closeEditor} />}
      {tab === "Tickets and form" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Ticket tiers" action={<button className="btn-secondary btn-sm" onClick={() => setEditor({ kind: "tier" })}>Add tier</button>} flush>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Tier</th>
                  <th className="th-r">Price</th>
                  <th className="th-r">Sold / cap</th>
                  <th className="th">Rules</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t) => (
                  <tr key={t.id} className="hover:bg-paper">
                    <td className="td">
                      <Link href={`${base}/tiers/${t.id}`} className="font-medium hover:underline">
                        {t.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.entitlements.map((e) => (
                          <span key={e} className="pill bg-paper-200 text-slate">
                            {zones.find((z) => z.id === e)?.name ?? e.replace("-", " ")}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="td-r">
                      {t.price === 0 ? "Free" : money(t.price, t.currency)}
                      {t.pendingPrice !== undefined && <span className="block text-[12px] text-warn">{money(t.pendingPrice, t.pendingCurrency ?? t.currency)} awaiting approval</span>}
                    </td>
                    <td className="td-r">
                      {t.sold} / {t.cap}
                    </td>
                    <td className="td text-[13px] text-slate">
                      {t.visibility}, {t.approval === "auto" ? "auto-confirm on payment" : "organiser approval"}
                      {t.paused && <div className="text-warn">Sales paused</div>}
                      {t.saleFrom && <div>From {t.saleFrom}</div>}
                    </td>
                    <td className="td text-right">
                      <button className="btn-quiet" onClick={() => setEditor({ kind: "tier", tier: t })}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-5 py-3 text-[13px] text-slate">A price change on a live event goes back to Algotech for re-approval. Registration continues on the approved terms meanwhile.</p>
          </Section>
          <Section title="Registration form" action={<button className="btn-secondary btn-sm" onClick={() => setEditor({ kind: "field" })}>Add field</button>} flush>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Field</th>
                  <th className="th">Shown to</th>
                  <th className="th">Required</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Full name", "Everyone", "Yes"],
                  ["Email", "Everyone", "Yes"],
                  ["Phone", "Everyone", "Yes"],
                  ["Organisation", "Everyone", "Yes"],
                  ["Job title", "Everyone", "No"],
                  ["Country", "Everyone", "No"],
                  ["Category", "Everyone", "Yes"],
                ].map(([f, who, req]) => (
                  <tr key={f}>
                    <td className="td font-medium">{f}</td>
                    <td className="td text-slate">{who}</td>
                    <td className="td text-slate">{req}</td>
                    <td className="td text-right text-[13px] text-slate">Standard</td>
                  </tr>
                ))}
                {state.formFields.filter((f) => f.eventId === id).map((f) => (
                  <tr key={f.id} className="hover:bg-paper">
                    <td className="td font-medium">
                      {f.label}
                      <div className="text-[13px] text-slate font-normal">{{ text: "Short text", textarea: "Long text", select: "Choice", file: "File upload" }[f.type]}{f.help ? `, ${f.help}` : ""}</div>
                    </td>
                    <td className="td text-slate">{f.showTo === "Everyone" ? "Everyone" : f.showTo.join(", ")}</td>
                    <td className="td text-slate">{f.required ? "Yes" : "No"}</td>
                    <td className="td text-right"><button className="btn-quiet" onClick={() => setEditor({ kind: "field", field: f })}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-4 flex items-center gap-3 text-sm border-t border-line">
              <span className="h-8 w-8 rounded grid place-items-center text-[11px] font-medium" style={{ background: event.brand.primary, color: readableOn(event.brand.primary) }}>{event.brand.logoText.slice(0, 2)}</span>
              <div className="flex-1">
                <div className="font-medium">Brand colour {event.brand.primary}, mark {event.brand.logoText}</div>
                <div className="text-[13px] text-slate">Used on the public page, emails, badges and the post-event report.</div>
              </div>
              <button className="btn-quiet" onClick={() => setEditor({ kind: "brand" })}>Edit brand</button>
            </div>
          </Section>
        </div>
      )}

      {tab === "Programme" && editor?.kind === "session" && <SessionEditor eventId={id} session={editor.session} onClose={closeEditor} />}
      {tab === "Programme" && (
        <Section title="Programme" action={<button className="btn-secondary btn-sm" onClick={() => setEditor({ kind: "session" })}>Add session</button>}>
          <Programme sessions={sessions} rooms={state.rooms} days={event.days} startDate={event.startDate} linkBase={`${base}/sessions`} />
        </Section>
      )}

      {tab === "Media" && <MediaTab eventId={id} />}

      {tab === "Zones and rooms" && editor?.kind === "zone" && <ZoneEditor eventId={id} zone={editor.zone} onClose={closeEditor} />}
      {tab === "Zones and rooms" && editor?.kind === "room" && <RoomEditor eventId={id} room={editor.room} onClose={closeEditor} />}
      {tab === "Zones and rooms" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Zones" action={<button className="btn-secondary btn-sm" onClick={() => setEditor({ kind: "zone" })}>Add zone</button>} flush>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Zone</th>
                  <th className="th-r">Capacity</th>
                  <th className="th-r">Inside now</th>
                  <th className="th">Open</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id} className="hover:bg-paper">
                    <td className="td">
                      <Link href={`${base}/zones/${z.id}`} className="font-medium hover:underline">
                        {z.name}
                      </Link>
                      <div className="text-[13px] text-slate">{tiers.filter((t) => t.entitlements.includes(z.id)).map((t) => t.name).join(", ") || "Manual grants only"}</div>
                    </td>
                    <td className="td-r">{z.capacity}</td>
                    <td className="td-r">{z.occupancy}</td>
                    <td className="td text-slate">{z.window ?? "All day"}</td>
                    <td className="td text-right"><button className="btn-quiet" onClick={() => setEditor({ kind: "zone", zone: z })}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Section title="Breakout rooms" action={<button className="btn-secondary btn-sm" onClick={() => setEditor({ kind: "room" })}>Add room</button>} flush>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Room</th>
                  <th className="th">Zone</th>
                  <th className="th-r">Seats</th>
                  <th className="th-r">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {state.rooms.map((r) => (
                  <tr key={r.id}>
                    <td className="td font-medium">{r.name}</td>
                    <td className="td text-slate">{zones.find((z) => z.id === r.zoneId)?.name}</td>
                    <td className="td-r">{r.capacity}</td>
                    <td className="td-r">{sessions.filter((s) => s.roomId === r.id).length}</td>
                    <td className="td text-right"><button className="btn-quiet" onClick={() => setEditor({ kind: "room", room: r })}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      )}

      {tab === "Finance" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Gross" value={money(gross)} />
            <Stat label="Commission to Algotech" value={money(commission)} sub={`${event.commissionPct}% fixed at approval`} />
            <Stat label="Your net" value={money(net)} tone="ok" />
            <Stat label="Next payout" value="Fri 6 Nov" sub={`to ${state.organisers[0].payoutAccount}`} href="/organiser/finance" />
          </div>
          <Section title="Ledger" action={<button className="btn-secondary">Export .xlsx</button>} flush>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Delegate</th>
                    <th className="th">Tier</th>
                    <th className="th">Method</th>
                    <th className="th">Reference</th>
                    <th className="th-r">Gross</th>
                    <th className="th-r">Commission</th>
                    <th className="th-r">Net</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 30).map((o) => {
                    const d = delegates.find((x) => x.id === o.delegateId);
                    return (
                      <tr key={o.id} className="hover:bg-paper">
                        <td className="td num text-slate">{o.at}</td>
                        <td className="td">
                          <Link href={`${base}/delegates/${o.delegateId}`} className="font-medium hover:underline">
                            {d?.name}
                          </Link>
                        </td>
                        <td className="td text-slate">{tiers.find((t) => t.id === o.tierId)?.name}</td>
                        <td className="td">{o.method === "mpesa" ? "M-Pesa" : o.method === "card" ? "Card" : "Bank"}</td>
                        <td className="td font-mono text-[13px]">{o.reference}</td>
                        <td className="td-r">{o.gross.toLocaleString()}</td>
                        <td className="td-r text-slate">{o.commission.toLocaleString()}</td>
                        <td className="td-r font-medium">{o.net.toLocaleString()}</td>
                        <td className="td">
                          <span className={`pill ${o.status === "paid" ? "bg-ok-50 text-ok" : o.status === "refunded" ? "bg-bad-50 text-bad" : "bg-warn-50 text-warn"}`}>{o.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-[13px] text-slate">
              First 30 of {orders.length}. Gateway fees are paid by Algotech and never come out of your net.
            </p>
          </Section>
        </div>
      )}
    </>
  );
}

/** The post-event workbook (OR-17, FI-8): one CSV with every delegate and every order. */
function exportWorkbook(event: { name: string }, delegates: Delegate[], orders: Order[], tiers: { id: string; name: string }[]) {
  const tierName = (id: string) => tiers.find((t) => t.id === id)?.name ?? "";
  const lines = ["Delegates", "Name,Email,Phone,Organisation,Category,Tier,Status,Accredited,Days checked in"];
  for (const d of delegates) lines.push([d.name, d.email, d.phone, d.organisation, d.category, tierName(d.tierId), d.status, d.accredited ? "Yes" : "No", d.checkIns.length].map((v) => `"${v}"`).join(","));
  lines.push("", "Orders", "Date,Delegate,Tier,Method,Reference,Gross,Discount,Gateway fee,Commission,Net,Status");
  for (const o of orders) lines.push([o.at, delegates.find((d) => d.id === o.delegateId)?.name ?? o.delegateId, tierName(o.tierId), o.method, o.reference, o.gross, o.discount, o.gatewayFee, o.commission, o.net, o.status].map((v) => `"${v}"`).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${event.name.replace(/\W+/g, "-").toLowerCase()}-report.csv`;
  a.click();
}

/** OR-11: a sponsor's invite list as CSV: name, email, phone, organisation[, category]. Badges issued, no payment. */
function parseCsv(text: string) {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(",").map((c) => c.replace(/^"|"$/g, "").trim()));
  const head = rows[0].map((h) => h.toLowerCase());
  const col = (names: string[]) => head.findIndex((h) => names.includes(h));
  const ix = { name: col(["name", "full name"]), email: col(["email"]), phone: col(["phone", "mobile"]), org: col(["organisation", "organization", "company"]), cat: col(["category"]) };
  const body = ix.name >= 0 && ix.email >= 0 ? rows.slice(1) : rows;
  return body.map((r, i) => {
    const get = (k: keyof typeof ix, fallback: number) => (ix[k] >= 0 ? r[ix[k]] : r[fallback]) ?? "";
    const row = { line: i + 2, name: get("name", 0), email: get("email", 1), phone: get("phone", 2), organisation: get("org", 3), category: get("cat", 4) };
    const error = !row.name ? "No name" : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email) ? "Bad email" : undefined;
    return { ...row, error };
  });
}

function DelegatesTab({ event, delegates, tiers, base, tierName, initialStatus }: { event: EventRecord; delegates: Delegate[]; tiers: Tier[]; base: string; tierName: (id: string) => string; initialStatus: string }) {
  const { state, dispatch } = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [cat, setCat] = useState("All");
  const [panel, setPanel] = useState<"none" | "import" | "campaign" | "duplicates">("none");
  const [importRows, setImportRows] = useState<ReturnType<typeof parseCsv>>([]);
  const [importTier, setImportTier] = useState(tiers.find((t) => t.price === 0)?.id ?? tiers[0]?.id ?? "");
  const [camp, setCamp] = useState({ segment: "Confirmed", channel: "Email and SMS" as "Email" | "SMS" | "Email and SMS", subject: "", body: "" });

  const rows = useMemo(
    () => delegates.filter((d) => (status === "All" || d.status === status) && (cat === "All" || d.category === cat) && (q === "" || `${d.name} ${d.email} ${d.organisation} ${d.badgeCode}`.toLowerCase().includes(q.toLowerCase()))),
    [delegates, q, status, cat],
  );

  // OS-3: the same email or phone on two records
  const duplicates = useMemo(() => {
    const live = delegates.filter((d) => d.status !== "Cancelled" && d.status !== "Refunded");
    const pairs: [Delegate, Delegate][] = [];
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        if ((a.email && a.email.toLowerCase() === b.email.toLowerCase()) || (a.phone && a.phone === b.phone)) pairs.push([a, b]);
      }
    return pairs;
  }, [delegates]);

  const segmentCount = (seg: string) => delegates.filter((d) => (seg === "Confirmed" ? d.status === "Confirmed" || d.status === "Checked in" : seg === "Awaiting payment" ? d.status === "Awaiting payment" : seg === "Waitlisted" ? d.status === "Waitlisted" : seg === "Not yet checked in" ? (d.status === "Confirmed") : d.category === seg)).length;
  const segments = ["Confirmed", "Not yet checked in", "Awaiting payment", "Waitlisted", "Speaker", "Sponsor", "Exhibitor", "VIP"];

  function exportCsv() {
    const header = "Name,Email,Phone,Organisation,Category,Tier,Status,Badge";
    const body = rows.map((d) => [d.name, d.email, d.phone, d.organisation, d.category, tierName(d.tierId), d.status, d.badgeCode].map((v) => `"${v}"`).join(","));
    const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "delegates.csv";
    a.click();
  }

  function runImport() {
    const ok = importRows.filter((r) => !r.error);
    const tier = tiers.find((t) => t.id === importTier)!;
    const stamp = Date.now().toString(36);
    const cats = ["General Delegate", "Speaker", "Panelist", "Sponsor", "Exhibitor", "VIP"];
    dispatch({
      type: "importDelegates",
      delegates: ok.map((r, i) => ({
        id: `d_${stamp}${i}`,
        eventId: event.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        organisation: r.organisation,
        jobTitle: "",
        country: "Kenya",
        category: (cats.includes(r.category) ? r.category : tier.id === "t_sponsor" ? "Sponsor" : "General Delegate") as Delegate["category"],
        tierId: tier.id,
        status: "Confirmed",
        accredited: false,
        checkIns: [],
        zoneLog: [],
        sessions: [],
        bookable: false,
        badgeCode: `EXC-${stamp.slice(-4).toUpperCase()}${i}-${1000 + i}`,
      })),
    });
    setImportRows([]);
    setPanel("none");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <span className="text-slate">Profile edits:</span>
        <button className={`pill ${event.profileLocked ? "bg-ink text-white" : "bg-paper-200 text-slate"}`} onClick={() => dispatch({ type: "setProfileLock", eventId: event.id, locked: !event.profileLocked })}>
          {event.profileLocked ? "Locked, badges print from final data" : "Open to delegates"}
        </button>
        {duplicates.length > 0 && (
          <button className="pill bg-warn-50 text-warn" onClick={() => setPanel(panel === "duplicates" ? "none" : "duplicates")}>
            {duplicates.length} possible duplicate{duplicates.length > 1 ? "s" : ""}
          </button>
        )}
        <span className="text-slate ml-auto">{state.campaigns.filter((c) => c.eventId === event.id).length} campaigns sent</span>
      </div>

      {panel === "duplicates" && (
        <Section title="Possible duplicates" flush action={<span className="text-[13px] text-slate">Same email or phone. Merging keeps one record with both sets of scans and payments.</span>}>
          <ul>
            {duplicates.map(([a, b]) => (
              <li key={a.id + b.id} className="px-5 py-3 border-b border-line last:border-0 flex flex-wrap items-center gap-3 text-[14px]">
                <span className="font-medium">{a.name}</span>
                <span className="text-slate">{a.email}, {tierName(a.tierId)}, {a.status}</span>
                <span className="text-slate">and</span>
                <span className="font-medium">{b.name}</span>
                <span className="text-slate">{b.email}, {tierName(b.tierId)}, {b.status}</span>
                <span className="ml-auto flex gap-1">
                  <button className="btn-quiet" onClick={() => dispatch({ type: "mergeDelegates", keepId: a.id, dropId: b.id })}>Keep {a.name.split(" ")[0]}</button>
                  <button className="btn-quiet" onClick={() => dispatch({ type: "mergeDelegates", keepId: b.id, dropId: a.id })}>Keep {b.name.split(" ")[0]}</button>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {panel === "import" && (
        <Section title="Import delegates from CSV" flush action={<button className="btn-quiet" onClick={() => setPanel("none")}>Close</button>}>
          <div className="px-5 py-4 grid gap-4 sm:grid-cols-[1fr_220px_auto] items-end border-b border-line">
            <div>
              <label className="label" htmlFor="csv">CSV file</label>
              <input id="csv" type="file" accept=".csv,text/csv" className="input py-2.5 text-[14px]" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImportRows(parseCsv(await f.text())); }} />
              <p className="mt-1.5 text-[13px] text-slate">Columns: name, email, phone, organisation, category. A header row is optional.</p>
            </div>
            <div>
              <label className="label" htmlFor="csv-tier">Ticket to issue</label>
              <select id="csv-tier" className="input" value={importTier} onChange={(e) => setImportTier(e.target.value)}>
                {tiers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.price ? ` (${t.price} ${t.currency}, no payment taken)` : " (free)"}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" disabled={!importRows.some((r) => !r.error)} onClick={runImport}>
              Import {importRows.filter((r) => !r.error).length || ""} and issue badges
            </button>
          </div>
          {importRows.length > 0 && (
            <table className="w-full">
              <thead><tr><th className="th">Line</th><th className="th">Name</th><th className="th">Email</th><th className="th">Phone</th><th className="th">Organisation</th><th className="th">Result</th></tr></thead>
              <tbody>
                {importRows.map((r) => (
                  <tr key={r.line} className={r.error ? "bg-bad-50/40" : ""}>
                    <td className="td num text-slate">{r.line}</td>
                    <td className="td">{r.name}</td>
                    <td className="td">{r.email}</td>
                    <td className="td">{r.phone}</td>
                    <td className="td">{r.organisation}</td>
                    <td className="td">{r.error ? <span className="text-bad">{r.error}, skipped</span> : <span className="text-ok">Ready</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {panel === "campaign" && (
        <Section title="Send a campaign" action={<button className="btn-quiet" onClick={() => setPanel("none")}>Close</button>}>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!camp.subject) return;
              dispatch({ type: "sendCampaign", campaign: { id: `c_${Date.now().toString(36)}`, eventId: event.id, at: new Date().toISOString().slice(0, 16).replace("T", " "), segment: camp.segment, channel: camp.channel, subject: camp.subject, recipients: segmentCount(camp.segment) } });
              setCamp({ ...camp, subject: "", body: "" });
              setPanel("none");
            }}
          >
            <div>
              <label className="label" htmlFor="seg">Segment</label>
              <select id="seg" className="input" value={camp.segment} onChange={(e) => setCamp({ ...camp, segment: e.target.value })}>
                {segments.map((s) => <option key={s} value={s}>{s} ({segmentCount(s)})</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="chan">Channel</label>
              <select id="chan" className="input" value={camp.channel} onChange={(e) => setCamp({ ...camp, channel: e.target.value as typeof camp.channel })}>
                {["Email and SMS", "Email", "SMS"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="subj">Subject</label>
              <input id="subj" className="input" required value={camp.subject} onChange={(e) => setCamp({ ...camp, subject: e.target.value })} placeholder="Schedule change for day 2" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="body">Message</label>
              <textarea id="body" className="input" rows={3} value={camp.body} onChange={(e) => setCamp({ ...camp, body: e.target.value })} placeholder="Your badge link is included automatically." />
            </div>
            <div className="sm:col-span-2 flex items-center justify-between gap-3">
              <span className="text-[13px] text-slate">Goes to {segmentCount(camp.segment)} people. Delivery status shows per message once sent.</span>
              <button className="btn btn-primary" type="submit">Send to {segmentCount(camp.segment)}</button>
            </div>
          </form>
        </Section>
      )}

      <Section
        title={`${rows.length} delegates`}
        flush
        action={
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm" onClick={exportCsv}>
              Export CSV
            </button>
            <button className="btn-secondary btn-sm" onClick={() => setPanel(panel === "import" ? "none" : "import")}>Import CSV</button>
            <button className="btn-secondary btn-sm" onClick={() => setPanel(panel === "campaign" ? "none" : "campaign")}>Send a campaign</button>
          </div>
        }
      >
        <div className="px-5 py-3 flex flex-wrap gap-2 border-b border-line">
          <input className="input max-w-xs" placeholder="Search name, email, organisation or badge" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input max-w-[200px]" value={status} onChange={(e) => setStatus(e.target.value)}>
            {["All", "Pending", "Awaiting payment", "Confirmed", "Checked in", "Waitlisted", "Refund requested", "Cancelled", "Refunded"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="input max-w-[180px]" value={cat} onChange={(e) => setCat(e.target.value)}>
            {["All", "General Delegate", "Speaker", "Panelist", "Sponsor", "Exhibitor", "VIP"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th className="th">Delegate</th>
                <th className="th">Organisation</th>
                <th className="th">Category</th>
                <th className="th">Tier</th>
                <th className="th">Status</th>
                <th className="th">Day 1</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((d) => (
                <tr key={d.id} className="hover:bg-paper">
                  <td className="td">
                    <Link href={`${base}/delegates/${d.id}`} className="font-medium hover:underline">
                      {d.name}
                    </Link>
                    <div className="text-[13px] text-slate">{d.email}</div>
                  </td>
                  <td className="td text-slate">{d.organisation}</td>
                  <td className="td text-slate">{d.category}</td>
                  <td className="td text-slate">{tierName(d.tierId)}</td>
                  <td className="td">
                    <StatusPill status={d.status} />
                  </td>
                  <td className="td num text-slate">{d.checkIns.find((c) => c.day === 1)?.at ?? "–"}</td>
                  <td className="td text-right whitespace-nowrap">
                    {d.status === "Pending" && (
                      <>
                        <button className="btn-quiet text-ok" onClick={() => dispatch({ type: "approveRegistration", delegateId: d.id, approve: true })}>
                          Approve
                        </button>
                        <button className="btn-quiet text-bad" onClick={() => dispatch({ type: "approveRegistration", delegateId: d.id, approve: false })}>
                          Decline
                        </button>
                      </>
                    )}
                    {d.status === "Awaiting payment" && (
                      <button className="btn-quiet" onClick={() => dispatch({ type: "markPaid", delegateId: d.id })}>
                        Mark paid
                      </button>
                    )}
                    {d.status === "Waitlisted" && (
                      <button className="btn-quiet text-ok" disabled={(tiers.find((t) => t.id === d.tierId)?.sold ?? 0) >= (tiers.find((t) => t.id === d.tierId)?.cap ?? 0)} title="Needs a free place on the tier" onClick={() => dispatch({ type: "releaseWaitlist", delegateId: d.id })}>
                        Offer place
                      </button>
                    )}
                    {d.status === "Refund requested" && (
                      <button className="btn-quiet text-bad" onClick={() => dispatch({ type: "refund", delegateId: d.id })}>
                        Approve refund
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="p-5">
              <Empty>No delegates match these filters.</Empty>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
