import { Suspense } from "react";
import OperationsView from "./view";

export default function OperationsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <OperationsView />
    </Suspense>
  );
}
