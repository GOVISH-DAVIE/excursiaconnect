import { Suspense } from "react";
import { seed } from "@excursia/domain/seed";
import { EventWorkspace } from "./workspace";

export function generateStaticParams() {
  return seed.events.map((e) => ({ id: e.id }));
}

// the params are read inside the Suspense boundary, so the shell around them can render at once
async function Resolved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace id={id} />;
}

export default function EventPage({ params }: PageProps<"/organiser/events/[id]">) {
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <Resolved params={params} />
    </Suspense>
  );
}
