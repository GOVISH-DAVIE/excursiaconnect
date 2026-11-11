import { Resolve } from "@/components/resolve";
import { SessionDetail } from "@/components/session-detail";

export default function Page({ params }: PageProps<"/organiser/events/[id]/sessions/[sid]">) {
  return <Resolve params={params} render={({ sid }) => <SessionDetail sessionId={sid} mode="organiser" />} />;
}
