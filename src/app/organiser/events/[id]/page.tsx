import { Suspense } from "react";
import { seed } from "@/lib/seed";
import { EventWorkspace } from "./workspace";

export function generateStaticParams() {
  return seed.events.map((e) => ({ id: e.id }));
}

export default async function EventPage({ params }: PageProps<"/organiser/events/[id]">) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <EventWorkspace id={id} />
    </Suspense>
  );
}
