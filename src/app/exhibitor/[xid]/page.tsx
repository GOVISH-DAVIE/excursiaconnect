import { Resolve } from "@/components/resolve";
import { ExhibitorPortal } from "./portal";

export default function ExhibitorPortalPage({ params }: PageProps<"/exhibitor/[xid]">) {
  return <Resolve params={params} render={(p) => <ExhibitorPortal id={p.xid} />} />;
}
