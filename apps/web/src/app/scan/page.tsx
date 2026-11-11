import { Suspense } from "react";
import { Scanner } from "./scanner";

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ink" />}>
      <Scanner />
    </Suspense>
  );
}
