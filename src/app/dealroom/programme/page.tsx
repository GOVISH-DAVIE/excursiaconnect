import { Suspense } from "react";
import Programme from "./view";

export default function ProgrammePage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <Programme />
    </Suspense>
  );
}
