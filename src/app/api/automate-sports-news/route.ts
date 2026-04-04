/**
 * /api/automate-sports-news
 * Dedicated sports news desk — scrapes sports articles and posts as image cards.
 * Runs independently from the main automate pipeline.
 */
import { NextRequest, NextResponse } from "next/server";
import { generateAIContent } from "@/lib/gemini";
import { generateImage } from "@/lib/image-gen";
import { publish } from "@/lib/publisher";
import { Article } from "@/lib/types";
import { createHash } from "crypto";
import { logPost, isArticleSeen, markArticleSeen } from "@/lib/supabase";

export const maxDuration = 120;

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";

// ── Sports RSS feeds ──────────────────────────────────────────────────────────
const SPORTS_RSS_FEEDS = [
  { url: "https://www.tuko.co.ke/rss/sports.xml",                name: "Tuko Sports",           cat: "SPORTS" },
  { url: "https://www.pulselive.co.ke/rss/sports",               name: "Pulse Live Sports",     cat: "SPORTS" },
  { url: "https://www.kenyans.co.ke/feeds/sports",               name: "Kenyans Sports",        cat: "SPORTS" },
  { url: "https://www.standardmedia.co.ke/rss/sports",           name: "Standard Sports",       cat: "SPORTS" },
  { url: "https://www.goal.com/feeds/en/news",                   name: "Goal Football",         cat: "SPORTS" },
  { url: "https://www.skysports.com/rss/12040",                  name: "Sky Sports Football",   cat: "SPORTS" },
  { url: "https://www.espn.com/espn/rss/news",                   name: "ESPN",                  cat: "SPORTS" },
  { url: "https://feeds.bbci.co.uk/sport/rss.xml",               name: "BBC Sport",             cat: "SPORTS" },
  { url: "https://www.skysports.com/rss/0,20514,11661,00.xml",   name: "Sky Sports Cricket",    cat: "SPORTS" },
  { url: "https://ppp-tv-site-final.vercel.app/api/rss?since=" + new Date(Date.now() - 2 * 3600000).toISOString() + "&limit=20", name: "PPP TV Sports", cat: "SPORTS" },
];

function decodeXML(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

async function fetchSportsArticles(): Promise<Article[]> {
  const articles: Article[] = [];
  const seenIds = new Set<string>();

  await Promise.allSettled(SPORTS_RSS_FEEDS.map(async feed => {
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "PPPTVSportsDesk/1.0", "Accept": "application/rss+xml,*/*" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;
      const xml = await res.text();
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(xml)) !== null) {
        const e = match[1];
        const rawTitle = (e.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
        const title = decodeXML(rawTitle).trim();
        if (!title || title.length < 5) continue;

        const link = decodeXML((e.match(/<link>(.*?)<\/link>/) || e.match(/<guid[^>]*>(.*?)<\/guid>/) || [])[1] || "").trim();
        const pubDate = (e.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || "";
        const desc = (e.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || e.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "";
        const excerpt = decodeXML(desc).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 500);
        const imgMatch = e.match(/<media:content[^>]+url="([^"]+)"/) || e.match(/<media:thumbnail[^>]+url="([^"]+)"/);
        const imageUrl = imgMatch?.[1] || "";

        if (!link) continue;
        const id = createHash("sha256").update(link).digest("hex").slice(0, 16);
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        // Only last 24h
        if (pubDate) {
          const age = Date.now() - new Date(pubDate).getTime();
          if (age > 24 * 3600000) continue;
        }

        articles.push({
          id, title, url: link, imageUrl,
          summary: excerpt, fullBody: excerpt,
          sourceName: feed.name, category: "SPORTS",
          publishedAt: pubDate ? new Date(pubDate) : new Date(),
        });
      }
    } catch {}
  }));

  // Sort newest first, deduplicate by title fingerprint
  const seenTitles = new Set<string>();
  return articles
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .filter(a => {
      const fp = a.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);
      if (seenTitles.has(fp)) return false;
      seenTitles.add(fp);
      return true;
    });
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const validSecrets = ["Bearer " + process.env.AUTOMATE_SECRET, "Bearer " + process.env.WORKER_SECRET, "Bearer ppptvWorker2024"].filter(Boolean);
    if (!validSecrets.includes(auth || "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const articles = await fetchSportsArticles();
    if (articles.length === 0) return NextResponse.json({ posted: 0, message: "No sports articles found" });

    // Find first unseen article
    let target: Article | null = null;
    for (const a of articles) {
      if (await isArticleSeen(a.id)) continue;
      target = a;
      break;
    }

    if (!target) return NextResponse.json({ posted: 0, message: "All sports articles already seen" });

    // Mark seen immediately
    await markArticleSeen(target.id, target.title);

    const ai = await generateAIContent(target).catch(() => ({
      clickbaitTitle: target!.title.toUpperCase(),
      caption: `${target!.title}\n\nFollow @ppptvke for sports updates ⚽🏆`,
      firstComment: "#Sports #Football #PPPTVKenya #KenyaSports #PremierLeague",
      engagementType: "tag" as const,
    }));

    const imageBuffer = await generateImage({ ...target, title: ai.clickbaitTitle }, { isBreaking: false });

    const igPost = { platform: "instagram" as const, caption: ai.caption, articleUrl: target.url, firstComment: ai.firstComment };
    const fbPost = { platform: "facebook" as const, caption: ai.caption, articleUrl: target.url, firstComment: ai.firstComment };
    const result = await publish({ ig: igPost, fb: fbPost }, imageBuffer);

    if (result.instagram.success || result.facebook.success) {
      await logPost({
        article_id: target.id, title: ai.clickbaitTitle, url: target.url,
        category: "SPORTS", source_name: target.sourceName, post_type: "image",
        ig_success: result.instagram.success, ig_post_id: result.instagram.postId, ig_error: result.instagram.error,
        fb_success: result.facebook.success, fb_post_id: result.facebook.postId, fb_error: result.facebook.error,
        posted_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      posted: (result.instagram.success || result.facebook.success) ? 1 : 0,
      article: { title: target.title, source: target.sourceName, url: target.url },
      instagram: result.instagram, facebook: result.facebook,
    });
  } catch (e: any) {
    console.error("[automate-sports-news]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
