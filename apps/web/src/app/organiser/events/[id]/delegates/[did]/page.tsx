import { Resolve } from "@/components/resolve";
import { DelegateRecord } from "./record";

export default function Page({ params }: PageProps<"/organiser/events/[id]/delegates/[did]">) {
  return <Resolve params={params} render={({ id, did }) => <DelegateRecord eventId={id} delegateId={did} />} />;
}
