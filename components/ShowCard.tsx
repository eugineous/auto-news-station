import Link from "next/link";
import { Show } from "@/lib/types";
import { ImageWithFallback } from "./ImageWithFallback";
import { cn } from "@/lib/utils";

export function ShowCard({ show }: { show: Show }) {
  return (
    <Link
      href={`/shows/${show.slug}`}
      className={cn(
        "group overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur transition hover:-translate-y-1 hover:border-fuchsia-400/60 hover:shadow-2xl hover:shadow-fuchsia-500/20",
      )}
    >
      <div className="relative h-44 w-full overflow-hidden">
        <ImageWithFallback
          src={show.image}
          alt={show.title}
          className="h-full w-full transition duration-500 group-hover:scale-105"
        />
        <div className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
          {show.schedule}
        </div>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="text-lg font-semibold text-white">{show.title}</h3>
        <p className="text-sm text-white/70 line-clamp-2">{show.description}</p>
        <div className="flex flex-wrap gap-2 text-xs text-white/70">
          {show.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-white/10 px-2 py-1">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
