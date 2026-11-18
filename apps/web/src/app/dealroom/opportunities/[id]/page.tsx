import { Resolve } from "@/components/resolve";
import { OpportunityDetail } from "./opp";

export default function OpportunityPage({ params }: PageProps<"/dealroom/opportunities/[id]">) {
  return <Resolve params={params} render={(p) => <OpportunityDetail id={p.id} />} />;
}
