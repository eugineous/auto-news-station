/**
 * breaking-news.ts
 * Monitors RSS feeds for breaking news and viral stories.
 * Called by the automate pipeline to check for urgent content.
 */

import Parser from "rss-parser";

const parser = new Parser({ timeout: 8000 });

const BREAKING_FEEDS = [
  { url: "https://feeds.bbci.co.uk/news/africa/rss.xml",        name: "BBC Africa" },
  { url: "https://nation.africa/kenya/rss.xml",                  name: "Nation Africa" },
  { url: "https://www.standardmedia.co.ke/rss/headlines.php",    name: "Standard Media" },
  { url: "https://www.the-star.co.ke/rss",                       name: "The Star Kenya" },
  { url: "https://tuko.co.ke/rss",                               name: "Tuko" },
];

const BREAKING_KEYWORDS = [
  "breaking", "just in", "urgent", "alert", "developing",
  "confirmed", "killed", "dead", "arrested", "fired", "resigns",
  "explosion", "attack", "crash", "breaking news",
];

export interface BreakingItem {
  title: string;
  url: string;
  source: string;
  publishedAt: Date;
  isBreaking: boolean;
  breakingScore: number;
}

export async function checkBreakingNews(): Promise<BreakingItem[]> {
  const results: BreakingItem[] = [];
  const cutoff = Date.now() - 30 * 60 * 1000; // last 30 minutes

  await Promise.allSettled(
    BREAKING_FEEDS.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        for (const item of (parsed.items || []).slice(0, 10)) {
          const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
          if (pubDate.getTime() < cutoff) continue;

          const text = ((item.title || "") + " " + (item.contentSnippet || "")).toLowerCase();
          const breakingScore = BREAKING_KEYWORDS.filter(k => text.includes(k)).length;

          if (breakingScore > 0 || (Date.now() - pubDate.getTime()) < 10 * 60 * 1000) {
            results.push({
              title: item.title || "",
              url: item.link || "",
              source: feed.name,
              publishedAt: pubDate,
              isBreaking: breakingScore > 0,
              breakingScore,
            });
          }
        }
      } catch { /* feed unavailable — skip */ }
    })
  );

  return results.sort((a, b) => b.breakingScore - a.breakingScore || b.publishedAt.getTime() - a.publishedAt.getTime());
}

export async function getKenyaTrending(): Promise<string[]> {
  try {
    // Google Trends RSS for Kenya
    const parsed = await parser.parseURL(
      "https://trends.google.com/trends/trendingsearches/daily/rss?geo=KE"
    );
    return (parsed.items || []).slice(0, 20).map(i => i.title || "").filter(Boolean);
  } catch { return []; }
}
