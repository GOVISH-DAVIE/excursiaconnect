import { Suspense } from "react";
import Opportunities from "./list";

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <Opportunities />
    </Suspense>
  );
}
