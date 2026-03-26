import news from "@/content/news.json";
import { NewsCard } from "@/components/NewsCard";
import { SectionHeading } from "@/components/SectionHeading";
import { AdSlot } from "@/components/AdSlot";

const categories = Array.from(new Set(news.map((n) => n.category)));

export default function NewsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 lg:px-8">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-r from-white/10 via-white/5 to-transparent p-6 shadow-glow">
        <SectionHeading
          eyebrow="News"
          title="Full stories with original images"
          description="External feeds are enriched via readable extraction—no blank cards, no missing hero shots. Use ?force=1 to bust cache."
          cta={
            <a
              href="/api/news?limit=200&force=1"
              className="text-sm text-cyan-300 hover:text-white"
            >
              Refresh now →
            </a>
          }
        />
        <div className="flex flex-wrap gap-2 text-xs text-white/70">
          {categories.map((cat) => (
            <span key={cat} className="rounded-full bg-white/10 px-3 py-1">
              {cat}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {news.map((item) => (
          <NewsCard key={item.slug} item={item} />
        ))}
      </div>
      <div className="mt-8">
        <AdSlot />
      </div>
    </div>
  );
}
