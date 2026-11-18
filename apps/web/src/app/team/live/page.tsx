import { Suspense } from "react";
import { LiveGate } from "./gate";

// ?day= and ?tab= are read inside the Suspense boundary, so the shell around them prerenders at once
export default function LivePage() {
  return (
    <Suspense fallback={<p className="text-[14px] text-slate">Loading…</p>}>
      <LiveGate />
    </Suspense>
  );
}
