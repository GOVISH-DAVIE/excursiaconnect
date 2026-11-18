import { Suspense } from "react";
import Meetings from "./view";

export default function MeetingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate text-sm">Loading…</div>}>
      <Meetings />
    </Suspense>
  );
}
