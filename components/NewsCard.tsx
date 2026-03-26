import Link from "next/link";
import { NewsItem } from "@/lib/types";
import { formatDate, cn } from "@/lib/utils";
import { ImageWithFallback } from "./ImageWithFallback";

type Props = {
  item: NewsItem;
  variant?: "default" | "hero";
};

export function NewsCard({ item, variant = "default" }: Props) {
  const isHero = variant === "hero";
  return (
    <Link
      href={`/news/${item.slug}`}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur transition hover:-translate-y-1 hover:border-cyan-400/60 hover:shadow-2xl hover:shadow-cyan-500/20",
        isHero ? "col-span-2" : "",
      )}
    >
      <div className="relative h-56 w-full overflow-hidden">
        <ImageWithFallback
          src={item.image}
          alt={item.title}
          className="h-full w-full transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/80">
          <span className="rounded-full bg-white/15 px-3 py-1">{item.category}</span>
          <span className="rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-3 py-1 text-black">
            {item.tags[0] ?? "PPP"}
          </span>
          <span className="ml-auto text-white/70">{formatDate(item.publishedAt)}</span>
        </div>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="text-lg font-semibold text-white">{item.title}</h3>
        <p className="text-sm text-white/70 line-clamp-2">{item.excerpt}</p>
      </div>
    </Link>
  );
}
