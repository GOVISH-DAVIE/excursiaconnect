import { Suspense } from "react";
import { Queue } from "./queue";

export default function ApplicationsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <Queue />
    </Suspense>
  );
}
