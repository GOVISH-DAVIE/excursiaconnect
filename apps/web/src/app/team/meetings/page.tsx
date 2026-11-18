import { Suspense } from "react";
import { MeetingsGate } from "./gate";

// ?tab= and ?meeting= are read inside the Suspense boundary, so the shell around them prerenders at once
export default function MeetingsPage() {
  return (
    <Suspense fallback={<p className="text-[14px] text-slate">Loading…</p>}>
      <MeetingsGate />
    </Suspense>
  );
}
