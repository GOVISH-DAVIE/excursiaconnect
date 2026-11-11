import type { Metadata } from "next";
import { Suspense } from "react";
import { seed } from "@excursia/domain/seed";
import { publishedOrNull } from "@/features/events/server";
import { EventLive } from "./event-live";
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
  return event ? <EventLive event={event} /> : <EventPublic slug={slug} />;
}

export default function EventPage({ params }: PageProps<"/e/[slug]">) {
  return (
    <Suspense fallback={<div className="p-10 text-slate">Loading…</div>}>
      <Resolved params={params} />
    </Suspense>
  );
}
