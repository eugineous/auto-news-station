import artists from "@/content/artists.json";
import { notFound } from "next/navigation";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { SectionHeading } from "@/components/SectionHeading";
import { SocialLinks } from "@/components/SocialLinks";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return artists.map((artist) => ({ slug: artist.slug }));
}

export default async function ArtistPage({ params }: Props) {
  const { slug } = await params;
  const artist = artists.find((a) => a.slug === slug);
  if (!artist) return notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6 lg:px-8">
      <SectionHeading eyebrow="Artist" title={artist.name} description={artist.genre} />
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <ImageWithFallback src={artist.image} alt={artist.name} className="h-72 w-full object-cover" />
        <div className="space-y-4 p-6">
          <p className="text-white/80">{artist.bio}</p>
          <SocialLinks socials={artist.socials} />
          {artist.videos.length ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-white">Video highlights</p>
              <div className="grid gap-3 md:grid-cols-2">
                {artist.videos.map((video) => (
                  <iframe
                    key={video}
                    src={video}
                    className="h-48 w-full rounded-2xl border border-white/10 bg-black/40"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title={artist.name}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
