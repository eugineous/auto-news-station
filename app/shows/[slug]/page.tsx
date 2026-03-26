import shows from "@/content/shows.json";
import hosts from "@/content/hosts.json";
import { notFound } from "next/navigation";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { SectionHeading } from "@/components/SectionHeading";
import Link from "next/link";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return shows.map((show) => ({ slug: show.slug }));
}

export default async function ShowPage({ params }: Props) {
  const { slug } = await params;
  const show = shows.find((s) => s.slug === slug);
  if (!show) return notFound();
  const showHosts = hosts.filter((h) => show.hosts.includes(h.slug));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Show"
        title={show.title}
        description={`${show.schedule} | ${show.tags.join(" | ")}`}
      />
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <ImageWithFallback src={show.image} alt={show.title} className="h-72 w-full object-cover" />
        <div className="space-y-4 p-6">
          <p className="text-white/80">{show.description}</p>
          <div className="flex flex-wrap gap-2 text-xs text-white/70">
            {show.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-white/10 px-3 py-1">
                {tag}
              </span>
            ))}
          </div>
          {showHosts.length ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-white">Hosts</p>
              <div className="flex flex-wrap gap-2 text-sm text-cyan-200">
                {showHosts.map((h) => (
                  <Link key={h.slug} href={`/hosts/${h.slug}`} className="underline underline-offset-4">
                    {h.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          {show.clips.length ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-white">Clips</p>
              <div className="grid gap-3 md:grid-cols-2">
                {show.clips.map((clip) => (
                  <div key={clip} className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                    <iframe
                      src={clip}
                      className="h-48 w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title={show.title}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
