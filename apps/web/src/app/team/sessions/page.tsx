import { Suspense } from "react";
import { SessionsGate } from "./gate";

// ?day= and ?s= are read inside the Suspense boundary, so the shell around them prerenders at once
export default function SessionsPage() {
  return (
    <Suspense fallback={<p className="text-[14px] text-slate">Loading…</p>}>
      <SessionsGate />
    </Suspense>
  );
}
