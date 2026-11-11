import { Suspense } from "react";
import LogisticsView from "./view";

export default function LogisticsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <LogisticsView />
    </Suspense>
  );
}
