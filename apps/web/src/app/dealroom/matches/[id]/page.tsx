import { Resolve } from "@/components/resolve";
import { MatchDetail } from "./match";

export default function MatchPage({ params }: PageProps<"/dealroom/matches/[id]">) {
  return <Resolve params={params} render={(p) => <MatchDetail id={p.id} />} />;
}
