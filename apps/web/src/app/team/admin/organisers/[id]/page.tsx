import { Suspense } from "react";
import { KycReviewGate } from "./gate";

async function Resolved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KycReviewGate id={id} />;
}

export default function KycReviewPage({ params }: PageProps<"/team/admin/organisers/[id]">) {
  return (
    <Suspense fallback={<p className="text-[14px] text-slate">Loading…</p>}>
      <Resolved params={params} />
    </Suspense>
  );
}
