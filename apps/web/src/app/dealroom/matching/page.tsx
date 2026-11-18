import { Suspense } from "react";
import Matching from "./view";

export default function MatchingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <Matching />
    </Suspense>
  );
}
