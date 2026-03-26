import Link from "next/link";
import { Artist } from "@/lib/types";
import { ImageWithFallback } from "./ImageWithFallback";
import { SocialLinks } from "./SocialLinks";

export function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <Link
      href={`/artists/${artist.slug}`}
      className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur transition hover:-translate-y-1 hover:border-emerald-400/60 hover:shadow-2xl hover:shadow-emerald-500/20"
    >
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 overflow-hidden rounded-xl">
          <ImageWithFallback
            src={artist.image}
            alt={artist.name}
            className="h-full w-full transition duration-500 group-hover:scale-105"
          />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white">{artist.name}</h3>
          <p className="text-sm text-emerald-200">{artist.genre}</p>
          <p className="mt-1 text-sm text-white/70 line-clamp-2">{artist.bio}</p>
          <SocialLinks socials={artist.socials} />
        </div>
      </div>
    </Link>
  );
}
