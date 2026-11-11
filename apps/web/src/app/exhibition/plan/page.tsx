import { Suspense } from "react";
import PlanView from "./view";

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <PlanView />
    </Suspense>
  );
}
