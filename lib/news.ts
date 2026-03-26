import localNews from "@/content/news.json";
import { fetchExternalNews } from "./rss";
import { NewsItem } from "./types";
import { slugify } from "./slugify";
import { fetchReadable } from "./extract";

const FALLBACK_BASE =
  process.env.FALLBACK_BASE || "https://r.jina.ai/http://";

export function getLocalNews(): NewsItem[] {
  return [...localNews].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export async function getAllNews(options?: {
  includeExternal?: boolean;
  limit?: number;
}): Promise<NewsItem[]> {
  const local = getLocalNews();
  if (!options?.includeExternal) return local;

  // fetch external with full content + images
  const externalRaw = await fetchExternalNews(options.limit || 20);
  const enriched = await Promise.all(
    externalRaw.map(async (item) => {
      if (!item.sourceUrl) return item;
      const readable = await fetchReadable(item.sourceUrl);
      return {
        ...item,
        body: readable?.content || item.body || item.excerpt,
        image: readable?.image || item.image || "",
        author: readable?.author || item.author,
        title: readable?.title || item.title,
        publishedAt: readable?.published || item.publishedAt,
      };
    }),
  );

  const merged = [...local, ...enriched].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  return merged.slice(0, options.limit || 50);
}

export async function getNewsBySlug(slug: string): Promise<NewsItem | undefined> {
  const local = getLocalNews().find((n) => n.slug === slug);
  if (local) return local;

  // Try to fetch external via jina.ai readable view
  try {
    const url = slug.startsWith("http") ? slug : `https://${slug}`;
    const readable = await fetchReadable(url);
    if (readable) {
      return {
        slug: slugify(slug),
        title: readable.title || slug,
        excerpt: (readable.content || "").slice(0, 180),
        image: readable.image || "",
        tags: ["Syndicated"],
        category: "Syndicated",
        author: readable.author || "Syndicated",
        publishedAt: readable.published || new Date().toISOString(),
        body: readable.content || "",
        sourceUrl: url,
      };
    }
    const res = await fetch(`${FALLBACK_BASE}${url}`);
    if (!res.ok) return undefined;
    const text = await res.text();
    return {
      slug: slugify(slug),
      title: slug,
      excerpt: text.slice(0, 180),
      image: "",
      tags: ["Syndicated"],
      category: "Syndicated",
      author: "Syndicated",
      publishedAt: new Date().toISOString(),
      body: text,
      sourceUrl: url,
    };
  } catch (err) {
    console.error("fallback fetch failed", err);
    return undefined;
  }
}
