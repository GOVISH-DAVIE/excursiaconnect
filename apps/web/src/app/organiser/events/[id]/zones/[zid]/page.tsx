import { Resolve } from "@/components/resolve";
import { ZoneDetail } from "./zone";

export default function Page({ params }: PageProps<"/organiser/events/[id]/zones/[zid]">) {
  return <Resolve params={params} render={({ id, zid }) => <ZoneDetail eventId={id} zoneId={zid} />} />;
}
