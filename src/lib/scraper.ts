import { createHash } from "crypto";
import { Article } from "./types";

// PPP TV Cloudflare Worker /feed endpoint — real-time, image-verified articles
const PPPTV_FEED_URL = (process.env.PPPTV_WORKER_URL || "https://ppp-tv-worker.euginemicah.workers.dev") + "/feed";

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

function isWithin24h(pubDate: string | Date | undefined): boolean {
  if (!pubDate) return true;
  try {
    const d = typeof pubDate === "string" ? new Date(pubDate) : pubDate;
    return Date.now() - d.getTime() <= TWENTY_FOUR_HOURS;
  } catch { return true; }
}

function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

function titleFingerprint(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}

interface WorkerFeedItem {
  slug: string;
  title: string;
  excerpt: string;
  content?: string;
  category: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
  articleUrl: string;
  imageUrl: string;
  imageUrlDirect: string;
  twitterCaption: string;
  facebookCaption: string;
  instagramCaption: string;
  videoUrl?: string;       // direct video URL if present
  videoEmbedUrl?: string;  // YouTube/Vimeo embed URL
}

interface WorkerFeedResponse {
  articles: WorkerFeedItem[];
  total: number;
  generatedAt: string;
}

function parseWorkerFeed(data: WorkerFeedResponse): Article[] {
  const articles: Article[] = [];
  const seenTitles = new Set<string>();
  const seenIds = new Set<string>();

  for (const item of data.articles || []) {
    if (!item.title || !item.sourceUrl) continue;

    const id = hashUrl(item.sourceUrl);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const fp = titleFingerprint(item.title);
    if (seenTitles.has(fp)) continue;
    seenTitles.add(fp);

    const fullBody = item.content || item.excerpt || "";

    articles.push({
      id,
      title: item.title,
      url: item.articleUrl || item.sourceUrl,
      imageUrl: item.imageUrl || item.imageUrlDirect || "",
      summary: item.excerpt || "",
      fullBody,
      sourceName: item.sourceName || "PPP TV Kenya",
      category: (item.category || "GENERAL").toUpperCase(),
      publishedAt: item.publishedAt ? new Date(item.publishedAt) : new Date(),
      videoUrl: item.videoUrl || item.videoEmbedUrl || undefined,
      isVideo: !!(item.videoUrl || item.videoEmbedUrl),
    });
  }

  return articles;
}

export async function fetchArticles(limit = 50): Promise<Article[]> {
  const url = `${PPPTV_FEED_URL}?limit=${limit}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "PPPTVAutoPoster/4.0" },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });

  if (!res.ok) throw new Error("PPP TV Worker feed fetch failed: " + res.status);

  const data = await res.json() as WorkerFeedResponse;
  const articles = parseWorkerFeed(data);

  // Only articles from last 24h
  const fresh = articles.filter(a => isWithin24h(a.publishedAt));

  // Sort newest first
  fresh.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return fresh.slice(0, limit);
}

export async function fetchLatestArticle(): Promise<Article | null> {
  const articles = await fetchArticles(1);
  return articles[0] ?? null;
}
