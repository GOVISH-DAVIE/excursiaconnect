import { Suspense } from "react";
import ServicesView from "./view";

export default function ServicesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <ServicesView />
    </Suspense>
  );
}
