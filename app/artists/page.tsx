import artists from "@/content/artists.json";
import { SectionHeading } from "@/components/SectionHeading";
import { ArtistCard } from "@/components/ArtistCard";
import Link from "next/link";

export default function ArtistsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Artists"
        title="Featured musicians & DJs"
        description="On rotation across PPP TV playlists and shows."
        cta={
          <Link href="/projects" className="text-sm text-cyan-300 hover:text-white">
            Campaign bookings →
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {artists.map((artist) => (
          <ArtistCard key={artist.slug} artist={artist} />
        ))}
      </div>
    </div>
  );
}
