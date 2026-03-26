import hosts from "@/content/hosts.json";
import { SectionHeading } from "@/components/SectionHeading";
import { HostCard } from "@/components/HostCard";
import Link from "next/link";

export default function HostsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Talent"
        title="Hosts & Editors"
        description="People powering PPP TV’s shows, news desk, and music sets."
        cta={
          <Link href="/shows" className="text-sm text-cyan-300 hover:text-white">
            See their shows →
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {hosts.map((host) => (
          <HostCard key={host.slug} host={host} />
        ))}
      </div>
    </div>
  );
}
