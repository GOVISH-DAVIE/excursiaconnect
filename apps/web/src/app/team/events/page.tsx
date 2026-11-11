"use client";

import Link from "next/link";
import { Empty, PageHeader, Section } from "@/components/ui";
import { useMyOrganisers } from "@/features/onboarding/hooks/use-onboarding";
import { Failed, Loading, Signed, StateTone } from "../bits";

function Events() {
  const mine = useMyOrganisers();
  if (mine.isPending) return <Loading />;
  if (mine.isError) return <Failed error={mine.error} />;
  const events = mine.data.flatMap((o) => o.events);
  return (
    <>
      <PageHeader
        title="Events"
        actions={
          <Link href="/team/events/new" className="btn-primary">
            New event
          </Link>
        }
      />
      <Section title={`${events.length} event${events.length === 1 ? "" : "s"}`} flush>
        {events.length ? (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Event</th>
                <th className="th hidden sm:table-cell">Dates</th>
                <th className="th hidden sm:table-cell">Deal Room</th>
                <th className="th">State</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="td">
                    <Link href={`/team/events/${e.id}`} className="font-medium hover:text-coral">
                      {e.name}
                    </Link>
                    <div className="text-[13px] text-slate">{e.city}</div>
                  </td>
                  <td className="td hidden sm:table-cell">
                    {e.startDate} to {e.endDate}
                  </td>
                  <td className="td hidden sm:table-cell">{e.dealRoom.enabled ? "Enabled" : e.dealRoom.requested ? "Asked for" : "—"}</td>
                  <td className="td">
                    <StateTone state={e.state} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No events yet. Create one; it stays a draft until you send it to Algotech.</Empty>
        )}
      </Section>
    </>
  );
}

export default function EventsPage() {
  return (
    <Signed>
      <Events />
    </Signed>
  );
}
