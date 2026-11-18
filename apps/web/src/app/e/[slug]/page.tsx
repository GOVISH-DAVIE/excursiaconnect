import type { Metadata } from "next";
import { Suspense } from "react";
import { seed } from "@excursia/domain/seed";
import { publishedOrNull } from "@/features/events/server";
import { EventLive } from "./event-live";
import { DealRoomView } from "./deal-room/public";
import { EventPublic } from "./event-public";

export function generateStaticParams() {
  return seed.events.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: PageProps<"/e/[slug]">): Promise<Metadata> {
  const event = await publishedOrNull((await params).slug);
  return event ? { title: `${event.name} · ${event.organiser.name}`, description: event.tagline || undefined } : {};
}

/**
 * A published event comes from the API; anything else (the demo's events, or no API reachable) is the prototype's
 * page, from this browser's store.
 */
async function Resolved({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await publishedOrNull(slug);
  if (!event) return <EventPublic slug={slug} />;
  // a Deal Room on its own: its page is the Deal Room's
  // (until its lead has set it up, the event's own page: dates, venue, organiser, and that applications open soon)
  if (event.kind === "dealroom" && event.dealRoom) return <DealRoomView slug={slug} event={{ ...event, live: event.state === "Live" }} organiser={event.organiser.name} dr={event.dealRoom} />;
  return <EventLive event={event} />;
}

export default function EventPage({ params }: PageProps<"/e/[slug]">) {
  return (
    <Suspense fallback={<div className="p-10 text-slate">Loading…</div>}>
      <Resolved params={params} />
    </Suspense>
  );
}
