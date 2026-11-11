import { Resolve } from "@/components/resolve";
import { ExhibitorRecord } from "./record";

export default function ExhibitorPage({ params }: PageProps<"/exhibition/exhibitors/[xid]">) {
  return <Resolve params={params} render={(p) => <ExhibitorRecord id={p.xid} />} />;
}
