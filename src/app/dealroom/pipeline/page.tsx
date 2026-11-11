import { Suspense } from "react";
import Pipeline from "./view";

export default function PipelinePage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <Pipeline />
    </Suspense>
  );
}
