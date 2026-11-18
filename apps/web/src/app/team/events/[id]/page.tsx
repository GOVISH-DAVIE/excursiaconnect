import { Suspense } from "react";
import { EventGate } from "./gate";

// the id is read inside the Suspense boundary, so the shell around it prerenders at once
async function Resolved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventGate id={id} />;
}

export default function EventPage({ params }: PageProps<"/team/events/[id]">) {
  return (
    <Suspense fallback={<p className="text-[14px] text-slate">Loading…</p>}>
      <Resolved params={params} />
    </Suspense>
  );
}
