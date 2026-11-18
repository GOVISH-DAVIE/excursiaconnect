import { Rail } from "@/components/ui";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Rail
      persona="Platform admin"
      who="Algotech Labs"
      accent="coral"
      nav={[
        { href: "/admin", label: "Approval queue", exact: true },
        { href: "/admin/performance", label: "Performance" },
        { href: "/admin/organisers", label: "Organisers" },
        { href: "/admin/finance", label: "Commission and payouts" },
        { href: "/admin/deal-room", label: "Deal Room" },
      ]}
    >
      {children}
    </Rail>
  );
}
