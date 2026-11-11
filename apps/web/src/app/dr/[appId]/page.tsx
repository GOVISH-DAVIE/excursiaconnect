import { Resolve } from "@/components/resolve";
import { Portal } from "./portal";

export default function ParticipantPage({ params }: PageProps<"/dr/[appId]">) {
  return <Resolve params={params} render={(p) => <Portal id={p.appId} />} />;
}
