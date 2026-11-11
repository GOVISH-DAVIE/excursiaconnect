import { Suspense } from "react";
import Reports from "./view";

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <Reports />
    </Suspense>
  );
}
