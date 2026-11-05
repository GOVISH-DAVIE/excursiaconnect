import { Resolve } from "@/components/resolve";
import { TierDetail } from "./tier";

export default function Page({ params }: PageProps<"/organiser/events/[id]/tiers/[tid]">) {
  return <Resolve params={params} render={({ id, tid }) => <TierDetail eventId={id} tierId={tid} />} />;
}
