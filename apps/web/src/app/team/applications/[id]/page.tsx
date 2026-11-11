import { Suspense } from "react";
import { ReviewGate } from "./gate";

// the id is read inside the Suspense boundary, so the shell around it prerenders at once
async function Resolved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewGate id={id} />;
}

export default function ReviewPage({ params }: PageProps<"/team/applications/[id]">) {
  return (
    <Suspense fallback={<p className="text-[14px] text-slate">Loading…</p>}>
      <Resolved params={params} />
    </Suspense>
  );
}
