import { Suspense } from "react";
import { MatchingGate } from "./gate";

// ?who= is read inside the Suspense boundary, so the shell around it prerenders at once
export default function MatchingPage() {
  return (
    <Suspense fallback={<p className="text-[14px] text-slate">Loading…</p>}>
      <MatchingGate />
    </Suspense>
  );
}
