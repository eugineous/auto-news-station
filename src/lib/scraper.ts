import { createHash } from "crypto";
import { Article } from "./types";

const RSS_URL = "https://ppptv-v2.vercel.app/api/rss";

const KENYA_KEYWORDS = [
  "kenya","nairobi","kenyan","mombasa","kisumu","nakuru","eldoret",
  "kiswahili","swahili","safaricom","mpesa","m-pesa",
  "east africa","east african","ugali","matatu",
  "citizen tv","ntv kenya","kbc","k24","standard media","nation media",
  "ppp tv","ppptv",
  "bahati","willy paul","otile brown","sauti sol","khaligraph","nyashinski",
  "akothee","vera sidika","huddah","eric omondi","jalango","andrew kibe",
  "betty kyallo","lillian muli","jackie maribe","kambua","size 8",
  "raila","ruto","uhuru","kalonzo","mudavadi","wetangula","gachagua",
];

function isKenyanStory(article: Article): boolean {
  const hay = (article.title + " " + article.summary + " " + article.fullBody + " " + article.sourceName).toLowerCase();
  return KENYA_KEYWORDS.some(kw => hay.includes(kw));
}

function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
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

async function fetchFullBody(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return "";
    const html = await res.text();
    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([sS]*?)<\/p>/gi;
    let m: RegExpExecArray | null;
    while ((m = pRegex.exec(html)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, "").trim();
      if (text.length > 30) paragraphs.push(text);
    }
    return paragraphs.slice(0, 20).join("\n\n");
  } catch { return ""; }
}

export async function fetchLatestArticle(): Promise<Article | null> {
  const articles = await fetchArticles(1);
  return articles[0] ?? null;
}

export async function fetchArticles(limit = 50): Promise<Article[]> {
  const res = await fetch(RSS_URL, {
    headers: { "User-Agent": "PPPTVAutoPoster/2.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("RSS fetch failed: " + res.status);

  const xml = await res.text();
  const items: Article[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractCdata(extractTag(block, "title"));
    const link = extractCdata(extractTag(block, "link")) || extractTag(block, "link");
    const description = extractCdata(extractTag(block, "description"));
    const category = extractCdata(extractTag(block, "category")) || "GENERAL";
    const pubDate = extractTag(block, "pubDate");
    if (!title || !link) continue;

    const imageUrl = extractAttr(block, "enclosure", "url") || extractAttr(block, "media:content", "url") || "";

    const slugMatch = link.match(/\/news\/([A-Za-z0-9+/=_-]+)$/);
    let canonicalUrl = link;
    if (slugMatch) {
      try { canonicalUrl = Buffer.from(slugMatch[1], "base64").toString("utf-8"); }
      catch { canonicalUrl = link; }
    }

    const fullBody = await fetchFullBody(link);
    const article: Article = {
      id: hashUrl(canonicalUrl),
      title,
      url: canonicalUrl,
      imageUrl,
      summary: description.slice(0, 200),
      fullBody: fullBody || description,
      sourceName: "PPP TV",
      category: category.toUpperCase(),
      publishedAt: pubDate ? new Date(pubDate) : new Date(),
    };

    if (isKenyanStory(article)) {
      items.push(article);
      if (items.length >= limit) break;
    }
  }

  return items;
}
