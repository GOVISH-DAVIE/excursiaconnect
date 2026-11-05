import { Rail } from "@/components/ui";

export default function OrganiserLayout({ children }: LayoutProps<"/organiser">) {
  return (
    <Rail
      persona="Organiser portal"
      who="Epic PR & Events Ltd"
      nav={[
        { href: "/organiser", label: "Events", exact: true },
        { href: "/organiser/events/ev_nairobi_summit", label: "Nairobi Brand & PR Summit" },
        { href: "/organiser/finance", label: "Finance and payouts" },
        { href: "/organiser/team", label: "Team and roles" },
        { href: "/organiser/kyc", label: "KYC" },
      ]}
    >
      {children}
    </Rail>
  );
}
