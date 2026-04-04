import { createHash } from "crypto";
import { Article } from "./types";

// PPP TV site — primary source (correct final URL)
const PPPTV_SITE_URL = process.env.PPPTV_SITE_URL || "https://ppp-tv-site-final.vercel.app";
const PPPTV_RSS_BASE = PPPTV_SITE_URL + "/api/rss";

// Worker feed fallback — external RSS feeds (Tuko, Mpasho, etc.)
const PPPTV_FEED_URL = (process.env.PPPTV_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev") + "/feed";

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

// ── Parse PPP TV site RSS feed directly ──────────────────────────────────────
async function fetchFromPPPTVSite(limit: number): Promise<Article[]> {
  // Use `since` param to only fetch articles newer than last 2 hours — efficient polling
  const since = new Date(Date.now() - 2 * 3600000).toISOString();
  const url = `${PPPTV_RSS_BASE}?since=${encodeURIComponent(since)}&limit=${limit}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "PPPTVAutoPoster/5.0", "Accept": "application/rss+xml, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PPP TV RSS ${res.status}`);
  const xml = await res.text();

  const articles: Article[] = [];
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const e = match[1];
    const rawTitle = (e.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
    const title = rawTitle.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]+>/g, "").trim();
    if (!title || title.length < 5) continue;

    const fp = titleFingerprint(title);
    if (seenTitles.has(fp)) continue;
    seenTitles.add(fp);

    const link = (e.match(/<link>(.*?)<\/link>/) || e.match(/<guid[^>]*isPermaLink="true"[^>]*>(.*?)<\/guid>/) || e.match(/<guid[^>]*>(.*?)<\/guid>/) || [])[1]?.trim() || "";
    const pubDate = (e.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || "";
    const desc = (e.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || e.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "";
    const excerpt = desc.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim().slice(0, 500);
    const category = (e.match(/<category><!\[CDATA\[([\s\S]*?)\]\]><\/category>/) || e.match(/<category>([\s\S]*?)<\/category>/) || [])[1]?.trim().toUpperCase() || "ENTERTAINMENT";
    const imgMatch = e.match(/<media:content[^>]+url="([^"]+)"/) || e.match(/<media:thumbnail[^>]+url="([^"]+)"/) || e.match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)[^"'<>\s]*/);
    const imageUrl = imgMatch ? (imgMatch[1] || imgMatch[0]) : "";
    const videoUrl = (e.match(/<enclosure[^>]+url="([^"]+\.mp4[^"]*)"/) || [])[1] || undefined;

    const articleUrl = link || `${PPPTV_SITE_URL}`;
    const id = hashUrl(articleUrl);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    if (pubDate && !isWithin24h(pubDate)) continue;

    articles.push({
      id,
      title,
      url: articleUrl,
      imageUrl,
      summary: excerpt,
      fullBody: excerpt,
      sourceName: "PPP TV Kenya",
      category,
      publishedAt: pubDate ? new Date(pubDate) : new Date(),
      videoUrl,
      isVideo: !!videoUrl,
    });

    if (articles.length >= limit) break;
  }

  return articles;
}

export async function fetchArticles(limit = 50): Promise<Article[]> {
  // 1. PRIMARY: Pull directly from PPP TV site RSS
  try {
    const siteArticles = await fetchFromPPPTVSite(limit);
    if (siteArticles.length > 0) {
      siteArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      console.log(`[scraper] PPP TV site RSS: ${siteArticles.length} articles`);
      return siteArticles.slice(0, limit);
    }
  } catch (err: any) {
    console.warn("[scraper] PPP TV site RSS failed:", err.message);
  }

  // 2. SECONDARY: ingest_queue — articles pushed directly from PPP TV site
  try {
    const since = new Date(Date.now() - 24 * 3600000).toISOString();
    const { data: queued } = await (await import("@/lib/supabase")).supabaseAdmin
      .from("ingest_queue")
      .select("*")
      .eq("posted", false)
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .limit(limit);

    if (queued && queued.length > 0) {
      const articles: Article[] = queued.map((item: any) => ({
        id: item.id,
        title: item.title,
        url: item.article_url || item.source_url,
        imageUrl: item.image_url || item.image_url_direct || "",
        summary: item.excerpt || "",
        fullBody: item.content || item.excerpt || "",
        sourceName: item.source_name || "PPP TV Kenya",
        category: (item.category || "ENTERTAINMENT").toUpperCase(),
        publishedAt: new Date(item.published_at),
        videoUrl: item.video_url || item.video_embed_url || undefined,
        isVideo: !!(item.video_url || item.video_embed_url),
        isBreaking: item.is_breaking || false,
      }));
      articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      console.log(`[scraper] ingest_queue: ${articles.length} articles`);
      return articles.slice(0, limit);
    }
  } catch { /* fall through */ }

  // 3. FALLBACK: external RSS feeds via worker
  const url = `${PPPTV_FEED_URL}?limit=${limit}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "PPPTVAutoPoster/4.0" },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Worker feed fetch failed: " + res.status);
  const data = await res.json() as WorkerFeedResponse;
  const articles = parseWorkerFeed(data).filter(a => isWithin24h(a.publishedAt));
  articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  console.log(`[scraper] worker RSS fallback: ${articles.length} articles`);
  return articles.slice(0, limit);
}

export async function fetchLatestArticle(): Promise<Article | null> {
  const articles = await fetchArticles(1);
  return articles[0] ?? null;
}
