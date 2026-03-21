import { createHash } from "crypto";
import { Article } from "./types";

// ── Pull from PPP TV Kenya's own RSS feed ─────────────────────────────────
// All articles are already scraped, deduplicated, Kenya-filtered, and stored
// on ppptv-v2. Links point to ppptv-v2 article pages — NOT external sources.
const PPPTV_RSS = "https://ppptv-v2.vercel.app/api/rss";

// 24-hour freshness gate
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

// Title fingerprint for deduplication — normalise to lowercase, strip
// punctuation, collapse whitespace, take first 60 chars
function titleFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

// ── XML helpers ───────────────────────────────────────────────────────────
function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "i"));
  return m ? m[1].trim() : "";
}

function extractCdata(raw: string): string {
  const m = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1].trim() : raw.replace(/<[^>]+>/g, "").trim();
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const m = xml.match(new RegExp("<" + tag + "[^>]*\\s" + attr + '="([^"]*)"', "i"));
  return m ? m[1] : "";
}

// ── Parse RSS XML from ppptv-v2 ───────────────────────────────────────────
function parsePPPTVFeed(xml: string): Article[] {
  const articles: Article[] = [];
  const seenTitles = new Set<string>();
  const seenIds    = new Set<string>();

  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const title       = extractCdata(extractTag(block, "title"));
    // link points to ppptv-v2 article page — this is what we post to social
    const link        = extractCdata(extractTag(block, "link")) || extractTag(block, "link");
    const description = extractCdata(extractTag(block, "description"));
    const category    = extractCdata(extractTag(block, "category")) || "GENERAL";
    const pubDate     = extractTag(block, "pubDate");
    const imageUrl    =
      extractAttr(block, "enclosure", "url") ||
      extractAttr(block, "media:content", "url") ||
      "";

    if (!title || !link) continue;

    // Dedup by URL hash
    const id = hashUrl(link);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    // Dedup by title fingerprint — catches same story from multiple feeds
    const fp = titleFingerprint(title);
    if (seenTitles.has(fp)) continue;
    seenTitles.add(fp);

    articles.push({
      id,
      title,
      url: link,          // ppptv-v2 article page URL
      imageUrl,
      summary: description.slice(0, 200),
      fullBody: description,
      sourceName: "PPP TV Kenya",
      category: category.toUpperCase(),
      publishedAt: pubDate ? new Date(pubDate) : new Date(),
    });
  }

  return articles;
}

// ── Main export ───────────────────────────────────────────────────────────
export async function fetchArticles(limit = 50): Promise<Article[]> {
  const res = await fetch(PPPTV_RSS, {
    headers: {
      "User-Agent": "PPPTVAutoPoster/3.0",
      "Accept": "application/rss+xml, application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) throw new Error("PPP TV RSS fetch failed: " + res.status);

  const xml = await res.text();
  const articles = parsePPPTVFeed(xml);

  // Filter: only articles published within the last 24 hours
  const fresh = articles.filter(a => isWithin24h(a.publishedAt));

  // Sort newest first
  fresh.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return fresh.slice(0, limit);
}

export async function fetchLatestArticle(): Promise<Article | null> {
  const articles = await fetchArticles(1);
  return articles[0] ?? null;
}
