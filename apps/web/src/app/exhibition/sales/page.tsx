import { Suspense } from "react";
import SalesView from "./view";

export default function SalesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <SalesView />
    </Suspense>
  );
}
