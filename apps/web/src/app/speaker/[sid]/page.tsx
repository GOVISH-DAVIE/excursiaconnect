import { Resolve } from "@/components/resolve";
import { SessionDetail } from "@/components/session-detail";
import { Rail } from "@/components/ui";

export default function Page({ params }: PageProps<"/speaker/[sid]">) {
  return (
    <Rail persona="Facilitator" who="Esther Njeri" nav={[{ href: "/speaker/s3", label: "My session" }, { href: "/badge/d_demo", label: "My badge" }]}>
      <Resolve params={params} render={({ sid }) => <SessionDetail sessionId={sid} mode="facilitator" />} />
    </Rail>
  );
}
