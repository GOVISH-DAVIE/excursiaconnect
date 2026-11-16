import { Suspense } from "react";
import { MatchGate } from "./gate";

// the id is read inside the Suspense boundary, so the shell around it prerenders at once
async function Resolved({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return <MatchGate matchId={matchId} />;
}

export default function MatchPage({ params }: PageProps<"/team/matching/[matchId]">) {
  return (
    <Suspense fallback={<p className="text-[14px] text-slate">Loading…</p>}>
      <Resolved params={params} />
    </Suspense>
  );
}
