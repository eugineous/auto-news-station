/**
 * /api/automate-sports-news
 * Sports desk — pulls SPORTS articles from PPP TV site RSS feed only.
 * Articles come with images from the site. Posts as branded image cards.
 */
import { NextRequest, NextResponse } from "next/server";
import { generateAIContent } from "@/lib/gemini";
import { generateImage } from "@/lib/image-gen";
import { publish } from "@/lib/publisher";
import { Article } from "@/lib/types";
import { createHash } from "crypto";
import { logPost, isArticleSeen, markArticleSeen } from "@/lib/supabase";

export const maxDuration = 120;

const PPPTV_RSS = "https://ppp-tv-site-final.vercel.app/api/rss";

function decodeXML(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

const SPORTS_KEYWORDS = /\bsport|football|soccer|basketball|tennis|cricket|rugby|athletics|marathon|boxing|ufc|mma|nba|nfl|premier league|champions league|la liga|serie a|bundesliga|fifa|afcon|harambee|gor mahia|afc leopard|tusker fc|kenya rugby|kenya cricket|formula 1|f1|golf|swimming|olympics|world cup|euro|copa|transfer|signing|goal|match|fixture|result|score|league|tournament|championship|cup|final|semifinal|quarterfinal|playoff|draft|trade|injury|suspension|ban|coach|manager|squad|lineup|tactics\b/i;

async function fetchSportsFromPPPTV(): Promise<Article[]> {
  // Use `since` to only fetch last 6 hours — fresh sports content
  const since = new Date(Date.now() - 6 * 3600000).toISOString();
  const url = `${PPPTV_RSS}?since=${encodeURIComponent(since)}&limit=50`;

  const res = await fetch(url, {
    headers: { "User-Agent": "PPPTVSportsDesk/1.0", "Accept": "application/rss+xml,*/*" },
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
    const title = decodeXML(rawTitle).trim();
    if (!title || title.length < 5) continue;

    const fp = title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);
    if (seenTitles.has(fp)) continue;
    seenTitles.add(fp);

    const link = decodeXML((e.match(/<link>(.*?)<\/link>/) || e.match(/<guid[^>]*isPermaLink="true"[^>]*>(.*?)<\/guid>/) || e.match(/<guid[^>]*>(.*?)<\/guid>/) || [])[1] || "").trim();
    const pubDate = (e.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || "";
    const desc = (e.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || e.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "";
    const excerpt = decodeXML(desc).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 500);
    const category = decodeXML((e.match(/<category><!\[CDATA\[([\s\S]*?)\]\]><\/category>/) || e.match(/<category>([\s\S]*?)<\/category>/) || [])[1] || "").trim().toUpperCase();

    // Image from enclosure or media:content
    const imgMatch = e.match(/<enclosure[^>]+url="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/)
      || e.match(/<media:content[^>]+url="([^"]+)"/)
      || e.match(/<media:thumbnail[^>]+url="([^"]+)"/);
    const imageUrl = imgMatch?.[1] || "";

    if (!link) continue;
    const id = createHash("sha256").update(link).digest("hex").slice(0, 16);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    // Only SPORTS category or sports keywords in title
    const isSports = category === "SPORTS" || SPORTS_KEYWORDS.test(title);
    if (!isSports) continue;

    articles.push({
      id, title, url: link, imageUrl,
      summary: excerpt, fullBody: excerpt,
      sourceName: "PPP TV Kenya", category: "SPORTS",
      publishedAt: pubDate ? new Date(pubDate) : new Date(),
    });
  }

  return articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const validSecrets = [
      "Bearer " + process.env.AUTOMATE_SECRET,
      "Bearer " + process.env.WORKER_SECRET,
      "Bearer ppptvWorker2024",
    ].filter(Boolean);
    if (!validSecrets.includes(auth || "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch sports articles from PPP TV site
    let articles: Article[] = [];
    try {
      articles = await fetchSportsFromPPPTV();
    } catch (err: any) {
      console.warn("[sports-news] RSS fetch failed:", err.message);
      return NextResponse.json({ posted: 0, message: "PPP TV RSS unavailable: " + err.message });
    }

    if (articles.length === 0) {
      return NextResponse.json({ posted: 0, message: "No sports articles in PPP TV RSS right now" });
    }

    // Find first unseen article
    let target: Article | null = null;
    for (const a of articles) {
      if (await isArticleSeen(a.id)) continue;
      target = a;
      break;
    }

    if (!target) return NextResponse.json({ posted: 0, message: "All sports articles already posted" });

    // Mark seen immediately to prevent double-posting
    await markArticleSeen(target.id, target.title);

    // Generate paraphrased caption
    const ai = await generateAIContent(target).catch(() => ({
      clickbaitTitle: target!.title.toUpperCase(),
      caption: `${target!.title}\n\nFollow @ppptvke for sports updates ⚽🏆\n\nSource: PPP TV Kenya`,
      firstComment: "#Sports #Football #PPPTVKenya #KenyaSports #PremierLeague #ChampionsLeague",
      engagementType: "tag" as const,
    }));

    // Generate branded thumbnail — uses article imageUrl as background if available
    const imageBuffer = await generateImage(
      { ...target, title: ai.clickbaitTitle },
      { isBreaking: false }
    );

    const igPost = { platform: "instagram" as const, caption: ai.caption, articleUrl: target.url, firstComment: ai.firstComment };
    const fbPost = { platform: "facebook" as const, caption: ai.caption, articleUrl: target.url, firstComment: ai.firstComment };
    const result = await publish({ ig: igPost, fb: fbPost }, imageBuffer);

    if (result.instagram.success || result.facebook.success) {
      await logPost({
        article_id: target.id,
        title: ai.clickbaitTitle,
        url: target.url,
        category: "SPORTS",
        source_name: "PPP TV Kenya",
        post_type: "image",
        ig_success: result.instagram.success,
        ig_post_id: result.instagram.postId,
        ig_error: result.instagram.error,
        fb_success: result.facebook.success,
        fb_post_id: result.facebook.postId,
        fb_error: result.facebook.error,
        posted_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      posted: (result.instagram.success || result.facebook.success) ? 1 : 0,
      article: { title: target.title, source: "PPP TV Kenya", url: target.url, imageUrl: target.imageUrl },
      instagram: result.instagram,
      facebook: result.facebook,
    });
  } catch (e: any) {
    console.error("[automate-sports-news]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
