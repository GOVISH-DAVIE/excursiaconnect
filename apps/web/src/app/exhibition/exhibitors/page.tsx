import { Suspense } from "react";
import ExhibitorList from "./list";

export default function ExhibitorsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <ExhibitorList />
    </Suspense>
  );
}
