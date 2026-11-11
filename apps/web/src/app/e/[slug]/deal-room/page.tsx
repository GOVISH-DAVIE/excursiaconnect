import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { seed } from "@excursia/domain/seed";
import { publishedOrNull } from "@/features/events/server";
import { DealRoomPublic, DealRoomView } from "./public";

export function generateStaticParams() {
  return seed.events.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: PageProps<"/e/[slug]/deal-room">): Promise<Metadata> {
  const event = await publishedOrNull((await params).slug);
  return event?.dealRoom ? { title: `Deal Room · ${event.name}` } : {};
}

// the params are read inside the Suspense boundary, so the shell around them can render at once
async function Resolved({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await publishedOrNull(slug);
  // the demo's events (and any page with no API to ask) stay on the prototype's store
  if (!event) return <DealRoomPublic slug={slug} />;
  if (!event.dealRoom)
    return (
      <div className="p-10">
        The Deal Room for {event.name} isn&apos;t open yet.{" "}
        <Link href={`/e/${slug}`} className="link">
          Back to the event
        </Link>
      </div>
    );
  return <DealRoomView slug={slug} event={{ ...event, live: event.state === "Live" }} organiser={event.organiser.name} dr={event.dealRoom} />;
}

export default function DealRoomPage({ params }: PageProps<"/e/[slug]/deal-room">) {
  return (
    <Suspense fallback={<div className="p-10 text-slate">Loading…</div>}>
      <Resolved params={params} />
    </Suspense>
  );
}
