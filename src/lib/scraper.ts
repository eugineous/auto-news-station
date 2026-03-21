import Parser from "rss-parser";
import { createHash } from "crypto";
import { Article } from "./types";

// Use dynamic import for cheerio to avoid ESM/undici bundling issues
async function loadCheerio() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("cheerio") as typeof import("cheerio");
}

const RSS_URL = "https://ppptv-v2.vercel.app/api/rss";
const BASE_URL = "https://ppptv-v2.vercel.app";

const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: false }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: false }],
    ],
  },
});

function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

async function fetchFullBody(articlePageUrl: string): Promise<string> {
  try {
    const res = await fetch(articlePageUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return "";
    const data = await res.text();
    const cheerio = await loadCheerio();
    const $ = cheerio.load(data);
    const paragraphs: string[] = [];
    $("article p, main p, .prose p, .content p").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20) paragraphs.push(text);
    });
    if (paragraphs.length === 0) {
      $("p").each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 20) paragraphs.push(text);
      });
    }
    return paragraphs.join("\n\n");
  } catch {
    return "";
  }
}

export async function fetchArticles(): Promise<Article[]> {
  const feed = await parser.parseURL(RSS_URL);
  const results: Article[] = [];

  for (const item of feed.items) {
    const title = (item.title ?? "").trim();
    const rawLink = item.link ?? "";
    if (!title || !rawLink) continue;

    const detailUrl = rawLink.startsWith("http")
      ? rawLink
      : `${BASE_URL}${rawLink}`;

    const imageUrl: string =
      (item as any).mediaContent?.$.url ??
      (item as any).mediaThumbnail?.$.url ??
      item.enclosure?.url ??
      "";

    const summary = (item.contentSnippet ?? item.summary ?? "").trim();
    const sourceName = (item.creator ?? (item as any).author ?? "PPP TV").trim();
    const category = ((item.categories?.[0] ?? "GENERAL") as string).toUpperCase();
    const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();

    const slugMatch = detailUrl.match(/\/news\/([A-Za-z0-9+/=_-]+)$/);
    let canonicalUrl = detailUrl;
    if (slugMatch) {
      try {
        canonicalUrl = Buffer.from(slugMatch[1], "base64").toString("utf-8");
      } catch {
        canonicalUrl = detailUrl;
      }
    }

    const id = hashUrl(canonicalUrl);
    const fullBody = await fetchFullBody(detailUrl);

    results.push({
      id,
      title,
      url: canonicalUrl,
      imageUrl,
      summary,
      fullBody: fullBody || summary,
      sourceName,
      category,
      publishedAt,
    });
  }

  return results;
}
