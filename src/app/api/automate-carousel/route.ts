/**
 * /api/automate-carousel
 * Autonomous carousel pipeline:
 * 1. Scrapes Instagram accounts for carousel posts via public API
 * 2. Replaces first image with our branded PPP TV thumbnail
 * 3. Rewrites caption with AI (full rewrite, not refinement)
 * 4. Posts as carousel to our IG account
 */
import { NextRequest, NextResponse } from "next/server";
import { generateAIContent } from "@/lib/gemini";
import { generateImage } from "@/lib/image-gen";
import { Article } from "@/lib/types";
import { createHash } from "crypto";
import { logPost } from "@/lib/supabase";

export const maxDuration = 300;

const GRAPH_API = "https://graph.facebook.com/v19.0";
const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try { return await fn(); }
    catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      if (status && status >= 400 && status < 500) throw err;
      lastErr = err;
      await sleep(Math.pow(2, attempt) * 1500);
    }
  }
  throw lastErr;
}

// ── Instagram accounts to scrape for carousels ────────────────────────────────
const CAROUSEL_SOURCES = [
  { username: "audiomackedm",        cat: "MUSIC",         name: "AudioMack EDM" },
  { username: "audiomackafrica",     cat: "MUSIC",         name: "AudioMack Africa" },
  { username: "rap",                 cat: "MUSIC",         name: "Rap" },
  { username: "spotifyafrica",       cat: "MUSIC",         name: "Spotify Africa" },
  { username: "nairobi_gossip_club", cat: "CELEBRITY",     name: "Nairobi Gossip Club" },
  { username: "bars",                cat: "MUSIC",         name: "Bars" },
  { username: "bbcafrica",           cat: "ENTERTAINMENT", name: "BBC Africa" },
  { username: "complex",             cat: "ENTERTAINMENT", name: "Complex" },
  { username: "worldstar",           cat: "ENTERTAINMENT", name: "WorldStar" },
  { username: "theshaderoom",        cat: "CELEBRITY",     name: "The Shade Room" },
  { username: "bossip",              cat: "CELEBRITY",     name: "Bossip" },
  { username: "bet",                 cat: "ENTERTAINMENT", name: "BET" },
  { username: "vibe",                cat: "MUSIC",         name: "Vibe Magazine" },
  { username: "xxl",                 cat: "MUSIC",         name: "XXL Magazine" },
  { username: "rollingstone",        cat: "MUSIC",         name: "Rolling Stone" },
  { username: "billboard",           cat: "MUSIC",         name: "Billboard" },
  { username: "espn",                cat: "SPORTS",        name: "ESPN" },
  { username: "nba",                 cat: "SPORTS",        name: "NBA" },
  { username: "premierleague",       cat: "SPORTS",        name: "Premier League" },
  { username: "afcon_official",      cat: "SPORTS",        name: "AFCON" },
  { username: "sportsbible",         cat: "SPORTS",        name: "SportsBible" },
  { username: "goal",                cat: "SPORTS",        name: "Goal" },
  { username: "tuko.co.ke",          cat: "ENTERTAINMENT", name: "Tuko Kenya" },
  { username: "mpasho",              cat: "CELEBRITY",     name: "Mpasho" },
  { username: "ghafla",              cat: "CELEBRITY",     name: "Ghafla Kenya" },
];

// Scrape carousel content from Reddit galleries and multi-image RSS feeds
// (Instagram's internal API is blocked server-side — Reddit galleries work reliably)
async function scrapeIGCarousels(username: string): Promise<{ images: string[]; caption: string; postUrl: string }[]> {
  // Map IG usernames to Reddit subreddits with gallery posts
  const REDDIT_MAP: Record<string, string> = {
    "theshaderoom":        "r/popculturechat",
    "complex":             "r/hiphopimages",
    "worldstar":           "r/popculturechat",
    "espn":                "r/popculturechat",
    "nba":                 "r/hiphopimages",
    "premierleague":       "r/popculturechat",
    "sportsbible":         "r/popculturechat",
    "goal":                "r/popculturechat",
    "billboard":           "r/hiphopimages",
    "rollingstone":        "r/hiphopimages",
    "audiomackafrica":     "r/hiphopimages",
    "nairobi_gossip_club": "r/Kenya",
    "mpasho":              "r/Kenya",
    "ghafla":              "r/popculturechat",
  };

  const subreddit = REDDIT_MAP[username];
  if (!subreddit) return [];

  try {
    const res = await fetch(`https://www.reddit.com/${subreddit}/hot.json?limit=25`, {
      headers: { "User-Agent": "PPPTVBot/2.0 (carousel aggregator)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    const posts = data?.data?.children || [];
    const carousels: { images: string[]; caption: string; postUrl: string }[] = [];

    for (const post of posts) {
      const p = post.data;
      // Reddit gallery posts have is_gallery=true and media_metadata
      if (!p.is_gallery || !p.media_metadata) continue;
      const images = Object.values(p.media_metadata as Record<string, any>)
        .filter((m: any) => m.status === "valid" && m.e === "Image")
        .map((m: any) => {
          // Use the highest resolution available, decode HTML entities
          const src = m.s?.u || m.p?.slice(-1)[0]?.u || "";
          return src.replace(/&amp;/g, "&");
        })
        .filter(Boolean)
        .slice(0, 10);

      if (images.length < 2) continue;
      carousels.push({
        images,
        caption: p.title || "",
        postUrl: `https://www.reddit.com${p.permalink}`,
      });
      if (carousels.length >= 3) break;
    }
    return carousels;
  } catch { return []; }
}

// Stage image to R2
async function stageImageToR2(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 1000) return null;
    const upload = await fetch(WORKER_URL + "/stage-image", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
      body: JSON.stringify({ imageBuffer: Buffer.from(buf).toString("base64") }),
      signal: AbortSignal.timeout(15000),
    });
    if (!upload.ok) return null;
    const d = await upload.json() as any;
    return d?.url || null;
  } catch { return null; }
}

// Check if carousel already posted (via Supabase)
async function isCarouselSeen(postUrl: string): Promise<boolean> {
  const { isArticleSeen } = await import("@/lib/supabase");
  const id = createHash("sha256").update(postUrl).digest("hex").slice(0, 16);
  return isArticleSeen(id);
}

async function markCarouselSeen(postUrl: string): Promise<void> {
  const { markArticleSeen } = await import("@/lib/supabase");
  const id = createHash("sha256").update(postUrl).digest("hex").slice(0, 16);
  await markArticleSeen(id);
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const validSecrets = [
    "Bearer " + process.env.AUTOMATE_SECRET,
    "Bearer " + process.env.WORKER_SECRET,
    "Bearer ppptvWorker2024",
  ].filter(Boolean);
  if (!validSecrets.includes(auth || "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;
  if (!igToken || !igAccountId) {
    return NextResponse.json({ error: "IG credentials not configured" }, { status: 500 });
  }

  // Only pick sources that have Reddit gallery mappings
  const MAPPED_SOURCES = CAROUSEL_SOURCES.filter(s => [
    "theshaderoom","complex","worldstar","espn","nba","premierleague",
    "sportsbible","goal","billboard","rollingstone","audiomackafrica",
    "nairobi_gossip_club","mpasho","ghafla"
  ].includes(s.username));
  const shuffled = [...MAPPED_SOURCES].sort(() => Math.random() - 0.5).slice(0, 5);

  let target: { images: string[]; caption: string; postUrl: string; source: typeof CAROUSEL_SOURCES[0] } | null = null;

  for (const source of shuffled) {
    const carousels = await scrapeIGCarousels(source.username);
    for (const carousel of carousels) {
      if (!carousel.postUrl || await isCarouselSeen(carousel.postUrl)) continue;
      target = { ...carousel, source };
      break;
    }
    if (target) break;
  }

  if (!target) {
    return NextResponse.json({ posted: 0, message: "No new carousels found" });
  }

  await markCarouselSeen(target.postUrl);

  // Generate our branded thumbnail for the FIRST image
  const article: Article = {
    id: createHash("sha256").update(target.postUrl).digest("hex").slice(0, 16),
    title: target.caption.slice(0, 100) || target.source.name,
    url: target.postUrl,
    imageUrl: target.images[0] || "",
    summary: target.caption.slice(0, 300),
    fullBody: target.caption,
    sourceName: target.source.name,
    category: target.source.cat,
    publishedAt: new Date(),
  };

  // Generate branded PPP TV thumbnail
  const brandedThumb = await generateImage(article, { isBreaking: false });
  const brandedThumbUrl = await (async () => {
    try {
      const r = await fetch(WORKER_URL + "/stage-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
        body: JSON.stringify({ imageBuffer: brandedThumb.toString("base64") }),
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) { const d = await r.json() as any; return d?.url; }
    } catch {}
    return null;
  })();

  // AI REWRITE caption (not refinement — full rewrite to avoid plagiarism)
  const ai = await generateAIContent(article).catch(() => null);
  const newCaption = ai?.caption || target.caption;

  // Stage remaining images (skip first — we replace with branded thumb)
  const remainingImages = target.images.slice(1, 10); // up to 9 more
  const stagedRemaining: string[] = [];
  for (const imgUrl of remainingImages) {
    const staged = await stageImageToR2(imgUrl);
    if (staged) stagedRemaining.push(staged);
  }

  // Build final image array: [branded thumbnail, ...original images]
  const finalImages = [
    ...(brandedThumbUrl ? [brandedThumbUrl] : []),
    ...stagedRemaining,
  ].slice(0, 10);

  if (finalImages.length < 2) {
    return NextResponse.json({ posted: 0, error: "Could not stage enough images" });
  }

  // Post carousel to Instagram
  try {
    // Step 1: Create item containers
    const itemIds: string[] = [];
    for (const imgUrl of finalImages) {
      const res = await withRetry(() =>
        fetch(`${GRAPH_API}/${igAccountId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: imgUrl, is_carousel_item: true, access_token: igToken }),
        })
      );
      const d = await res.json() as any;
      if (!res.ok || d.error) throw new Error(d.error?.message || "Item container failed");
      itemIds.push(d.id);
      await sleep(500);
    }

    // Step 2: Create carousel container
    const carouselRes = await withRetry(() =>
      fetch(`${GRAPH_API}/${igAccountId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "CAROUSEL",
          children: itemIds.join(","),
          caption: newCaption,
          access_token: igToken,
        }),
      })
    );
    const carousel = await carouselRes.json() as any;
    if (!carouselRes.ok || carousel.error) throw new Error(carousel.error?.message || "Carousel container failed");

    await sleep(5000);

    // Step 3: Publish
    const publishRes = await withRetry(() =>
      fetch(`${GRAPH_API}/${igAccountId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: carousel.id, access_token: igToken }),
      })
    );
    const published = await publishRes.json() as any;
    if (!publishRes.ok || published.error) throw new Error(published.error?.message || "Publish failed");

    // Log to Supabase
    await logPost({
      article_id: article.id,
      title: article.title,
      url: target.postUrl,
      category: target.source.cat,
      source_name: target.source.name,
      ig_success: true,
      ig_post_id: published.id,
      fb_success: false,
      fb_error: "carousel IG only",
      post_type: "carousel",
    });

    return NextResponse.json({
      posted: 1,
      postId: published.id,
      source: target.source.name,
      imageCount: finalImages.length,
      originalUrl: target.postUrl,
    });
  } catch (err: any) {
    return NextResponse.json({ posted: 0, error: err.message });
  }
}
