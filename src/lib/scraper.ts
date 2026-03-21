import { createHash } from "crypto";
import { Article } from "./types";

const PPPTV_RSS = "https://ppptv-v2.vercel.app/api/rss";
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

// Strip HTML tags and clean up whitespace for plain text
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePPPTVFeed(xml: string): Article[] {
  const articles: Article[] = [];
  const seenTitles = new Set<string>();
  const seenIds = new Set<string>();

  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const title = extractCdata(extractTag(block, "title"));
    const link = extractCdata(extractTag(block, "link")) || extractTag(block, "link");
    const rawDescription = extractTag(block, "description");
    const description = stripHtml(extractCdata(rawDescription) || rawDescription);
    const category = extractCdata(extractTag(block, "category")) || "GENERAL";
    const pubDate = extractTag(block, "pubDate");
    const imageUrl =
      extractAttr(block, "enclosure", "url") ||
      extractAttr(block, "media:content", "url") ||
      "";

    if (!title || !link) continue;

    const id = hashUrl(link);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const fp = titleFingerprint(title);
    if (seenTitles.has(fp)) continue;
    seenTitles.add(fp);

    // Use up to 600 chars of description as summary — gives Gemini enough context
    const summary = description.slice(0, 600);

    articles.push({
      id,
      title,
      url: link,
      imageUrl,
      summary,
      fullBody: description,
      sourceName: "PPP TV Kenya",
      category: category.toUpperCase(),
      publishedAt: pubDate ? new Date(pubDate) : new Date(),
    });
  }

  return articles;
}

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
