"use client";

import Link from "next/link";
import { Bars, Empty, KV, Meter, PageHeader, Section, Stat, Tone } from "@/components/ui";
import { useStore } from "@/lib/store";

export function ZoneDetail({ eventId, zoneId }: { eventId: string; zoneId: string }) {
  const { state, hydrated } = useStore();
  const z = state.zones.find((x) => x.id === zoneId);
  const event = state.events.find((e) => e.id === eventId);
  if (!z || !event) return <Empty>{hydrated ? "Zone not found." : "Loading…"}</Empty>;
  const base = `/organiser/events/${eventId}`;
  const tiers = state.tiers.filter((t) => t.eventId === eventId);
  const allowed = tiers.filter((t) => t.entitlements.includes(z.id));
  const rooms = state.rooms.filter((r) => r.zoneId === z.id);
  const log = state.delegates.flatMap((d) => d.zoneLog.filter((l) => l.zoneId === z.id).map((l) => ({ ...l, delegate: d }))).sort((a, b) => (a.at < b.at ? 1 : -1));
  const denies = log.filter((l) => l.verdict === "deny");
  const byReason = Object.entries(denies.reduce<Record<string, number>>((m, l) => ({ ...m, [l.reason ?? "Unknown"]: (m[l.reason ?? "Unknown"] ?? 0) + 1 }), {}));
  const entitledCount = state.delegates.filter((d) => d.eventId === eventId && (d.status === "Confirmed" || d.status === "Checked in") && (allowed.some((t) => t.id === d.tierId) || (d.grants ?? []).includes(z.id) || (d.category === "VIP" && z.id === "z_vip"))).length;
  // deterministic mock hourly curve for the day, scaled to capacity
  const shape = [0.02, 0.18, 0.55, 0.82, 0.76, 0.3, 0.62, 0.88, 0.71, 0.4, 0.12];
  const seedScale = z.id === "z_dining" ? [0, 0, 0, 0, 0.1, 0.95, 0.6, 0, 0, 0, 0] : shape;
  const hourly = seedScale.map((v) => Math.round(v * z.capacity * 0.9));
  const peak = Math.max(...hourly);

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/organiser", label: "Events" }, { href: base, label: event.name }, { href: `${base}?tab=Zones and rooms`, label: "Zones" }, { label: z.name }]}
        title={z.name}
        kicker={`Capacity ${z.capacity}. ${z.window ? `Open ${z.window}.` : "Open all day."} ${entitledCount} delegates entitled.`}
        actions={
          <>
            <button className="btn-secondary">Edit zone</button>
            <Link href="/scan" className="btn-secondary" target="_blank">
              Open scanner
            </Link>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-4 mb-4">
        <Stat label="Inside now" value={z.occupancy} sub={`${Math.round((z.occupancy / z.capacity) * 100)}% of capacity`} tone={z.occupancy / z.capacity >= 0.9 ? "bad" : undefined} />
        <Stat label="Peak today" value={peak} sub="at 14:00, day 1" />
        <Stat label="Entries today" value={hourly.reduce((a, b) => a + b, 0)} sub="all scanners" />
        <Stat label="Denied scans" value={denies.length} tone={denies.length ? "warn" : undefined} sub={denies.length ? "see reasons" : "none"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Occupancy by hour, day 1" className="lg:col-span-2">
          <Bars values={hourly} height={140} labels={["08:00", "18:00"]} />
          <div className="mt-3">
            <Meter value={z.occupancy} max={z.capacity} />
            <div className="mt-1 text-[13px] text-slate">Warning at 90%, hard stop at 100% unless overridden.</div>
          </div>
        </Section>
        <Section title="Access rules">
          <KV rows={[["Tiers", allowed.map((t) => t.name).join(", ") || "None"], ["Categories", z.id === "z_vip" ? "VIP (always)" : "Per ticket"], ["Window", z.window ?? "All day"], ["Anti-passback", z.id === "z_dining" ? "Off (no exit scanner)" : "On"], ["Rooms inside", rooms.map((r) => r.name).join(", ") || "–"]]} />
        </Section>
        <Section title="Denies by reason" flush>
          {byReason.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate">No denied scans at this zone yet.</p>
          ) : (
            <ul>
              {byReason.map(([r, n]) => (
                <li key={r} className="flex justify-between px-5 py-2.5 border-b border-line last:border-0 text-sm">
                  <span>{r}</span>
                  <span className="num font-medium">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Scan log" flush className="lg:col-span-2">
          {log.length === 0 ? (
            <div className="p-5">
              <Empty>No scans yet. Scans made in the staff scanner appear here.</Empty>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Time</th>
                  <th className="th">Delegate</th>
                  <th className="th">Direction</th>
                  <th className="th">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {log.slice(0, 40).map((l, i) => (
                  <tr key={i}>
                    <td className="td num text-slate">{l.at}</td>
                    <td className="td">
                      <Link href={`${base}/delegates/${l.delegate.id}`} className="font-medium hover:underline">
                        {l.delegate.name}
                      </Link>
                    </td>
                    <td className="td text-slate">{l.direction === "in" ? "Entry" : "Exit"}</td>
                    <td className="td">
                      <Tone tone={l.verdict === "allow" ? "ok" : l.verdict === "override" ? "warn" : "bad"}>{l.verdict}</Tone>
                      {l.reason && <span className="ml-2 text-[13px] text-slate">{l.reason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    </>
  );
}
