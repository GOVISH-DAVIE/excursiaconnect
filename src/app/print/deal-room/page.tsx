import { Suspense } from "react";
import { PrintView } from "./print";

export default function PrintPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <PrintView />
    </Suspense>
  );
}
