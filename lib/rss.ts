import Parser from "rss-parser";
import { NewsItem } from "./types";
import { slugify } from "./slugify";

const parser = new Parser();

const defaultFeeds = [
  "https://www.rollingstone.com/music/music-news/feed/",
  "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
];

export async function fetchExternalNews(limit = 20): Promise<NewsItem[]> {
  const feeds =
    process.env.NEWS_FEEDS?.split(",").map((f) => f.trim()).filter(Boolean) ||
    defaultFeeds;

  const results: NewsItem[] = [];

  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed);
      parsed.items.slice(0, limit).forEach((item) => {
        if (!item.link || !item.title) return;
        const enclosure = (item.enclosure as { url?: string } | undefined)?.url;
        results.push({
          slug: slugify(item.link || item.title || ""),
          title: item.title,
          excerpt: item.contentSnippet?.slice(0, 180) || item.title,
          image: enclosure || "",
          tags: ["Syndicated"],
          category: parsed.title || "Syndicated",
          author: item.creator || item.author || "Syndicated",
          sourceUrl: item.link,
          publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
          body:
            item["content:encoded"] ||
            item.content ||
            item.contentSnippet ||
            "",
        });
      });
    } catch (err) {
      console.error("RSS fetch failed", feed, err);
    }
  }

  return results.slice(0, limit);
}
