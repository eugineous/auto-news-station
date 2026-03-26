import hosts from "@/content/hosts.json";
import shows from "@/content/shows.json";
import { notFound } from "next/navigation";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { SectionHeading } from "@/components/SectionHeading";
import Link from "next/link";
import { SocialLinks } from "@/components/SocialLinks";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return hosts.map((host) => ({ slug: host.slug }));
}

export default async function HostPage({ params }: Props) {
  const { slug } = await params;
  const host = hosts.find((h) => h.slug === slug);
  if (!host) return notFound();
  const hostShows = shows.filter((s) => host.shows.includes(s.slug));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6 lg:px-8">
      <SectionHeading eyebrow="Host" title={host.name} description={host.role} />
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <ImageWithFallback src={host.image} alt={host.name} className="h-72 w-full object-cover" />
        <div className="space-y-4 p-6">
          <p className="text-white/80">{host.bio}</p>
          <SocialLinks socials={host.socials} />
          {hostShows.length ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-white">Shows</p>
              <div className="flex flex-wrap gap-2 text-sm text-cyan-200">
                {hostShows.map((show) => (
                  <Link key={show.slug} href={`/shows/${show.slug}`} className="underline underline-offset-4">
                    {show.title}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
