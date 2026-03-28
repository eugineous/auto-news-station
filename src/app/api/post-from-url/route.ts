import { NextRequest, NextResponse } from "next/server";
import { scrapeUrl } from "@/lib/url-scraper";
import { generateAIContent } from "@/lib/gemini";
import { generateImage } from "@/lib/image-gen";
import { publish, publishStories } from "@/lib/publisher";
import { Article } from "@/lib/types";
import { createHash } from "crypto";

export const maxDuration = 120;

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";

async function logPost(entry: object): Promise<void> {
  if (!WORKER_SECRET) return;
  try {
    await fetch(WORKER_URL + "/post-log", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
      body: JSON.stringify(entry),
      signal: AbortSignal.timeout(5000),
    });
  } catch {}
}

function typeToCategory(type: string, title: string): string {
  const t = title.toLowerCase();
  if (type === "youtube" || type === "tiktok") return "TV & FILM";
  if (type === "twitter") return "CELEBRITY";
  if (t.includes("music") || t.includes("song") || t.includes("album")) return "MUSIC";
  if (t.includes("fashion") || t.includes("style")) return "FASHION";
  if (t.includes("award") || t.includes("nomination")) return "AWARDS";
  if (t.includes("event") || t.includes("concert")) return "EVENTS";
  return "GENERAL";
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.AUTOMATE_SECRET;
  // If secret is configured, enforce it. If not configured, allow through (dev/unconfigured env)
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { url?: string; category?: string; dryRun?: boolean; manualTitle?: string; manualCaption?: string; imageBase64?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { url, category, dryRun = false, manualTitle, manualCaption, imageBase64: previewImageBase64 } = body;
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  try {
    let article: Article;
    let isVideo = false;
    let videoType = "";

    // If both manualTitle and manualCaption are provided, skip scraping entirely
    // This is the fast path used by the Compose UI (content already generated at preview time)
    if (manualTitle && manualCaption && !/instagram\.com/.test(url)) {
      article = {
        id: createHash("sha256").update(url).digest("hex").slice(0, 16),
        title: manualTitle,
        url,
        imageUrl: "",
        summary: manualCaption,
        fullBody: manualCaption,
        sourceName: new URL(url).hostname.replace("www.", ""),
        category: category || "GENERAL",
        publishedAt: new Date(),
      };
      // Try to get image quickly without blocking
      try {
        const scraped = await Promise.race([
          scrapeUrl(url),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
        ]) as any;
        if (scraped?.imageUrl) article.imageUrl = scraped.imageUrl;
        if (scraped?.videoThumbnailUrl && !article.imageUrl) article.imageUrl = scraped.videoThumbnailUrl;
        if (scraped?.isVideo) { isVideo = true; videoType = scraped.type; }
        if (scraped?.sourceName) article.sourceName = scraped.sourceName;
      } catch { /* use what we have */ }
    } else if (/instagram\.com/.test(url) && manualTitle && manualCaption) {
      article = {
        id: createHash("sha256").update(url).digest("hex").slice(0, 16),
        title: manualTitle,
        url,
        imageUrl: "",
        summary: manualCaption,
        fullBody: manualCaption,
        sourceName: "Instagram",
        category: category || "CELEBRITY",
        publishedAt: new Date(),
      };
    } else {
      const scraped = await scrapeUrl(url);
      if (!scraped.title) return NextResponse.json({ error: "Could not extract content from URL" }, { status: 422 });
      isVideo = scraped.isVideo;
      videoType = scraped.type;
      article = {
        id: createHash("sha256").update(url).digest("hex").slice(0, 16),
        title: manualTitle || scraped.title,
        url: scraped.sourceUrl,
        imageUrl: scraped.imageUrl || scraped.videoThumbnailUrl || "",
        summary: manualCaption || scraped.description,
        fullBody: manualCaption || scraped.bodyText || scraped.description,
        sourceName: scraped.sourceName,
        category: category || typeToCategory(scraped.type, scraped.title),
        publishedAt: new Date(),
      };
    }

    // Use pre-generated image from preview if available (skips regeneration)
    let imageBuffer: Buffer;
    if (previewImageBase64) {
      const b64 = previewImageBase64.replace(/^data:image\/\w+;base64,/, "");
      imageBuffer = Buffer.from(b64, "base64");
    } else {
      const thumbnailTitle = manualTitle || article.title;
      imageBuffer = await generateImage({ ...article, title: thumbnailTitle }, { isBreaking: false });
    }

    // Generate AI content for caption/firstComment (use manualCaption if provided)
    const ai = await generateAIContent(article, { isVideo, videoType });

    if (dryRun) {
      return NextResponse.json({ article, ai, imageBase64: imageBuffer.toString("base64"), message: "Dry run" });
    }

    // Use manualCaption directly if provided (already AI-generated at preview time)
    const finalCaption = manualCaption || ai.caption;
    const igPost = { platform: "instagram" as const, caption: finalCaption, articleUrl: article.url, firstComment: ai.firstComment };
    const fbPost = { platform: "facebook" as const, caption: finalCaption, articleUrl: article.url, firstComment: ai.firstComment };

    const result = await publish({ ig: igPost, fb: fbPost }, imageBuffer);

    const anySuccess = result.facebook.success || result.instagram.success;
    if (anySuccess) {
      await logPost({
        articleId: article.id,
        title: ai.clickbaitTitle,
        url: article.url,
        category: article.category,
        sourceType: videoType || (/instagram\.com/.test(url) ? "instagram" : "article"),
        instagram: result.instagram,
        facebook: result.facebook,
        postedAt: new Date().toISOString(),
        manualPost: true,
      });

      // Fire stories on every successful post — no limit, stories bypass the algorithm
      publishStories(imageBuffer, WORKER_URL, WORKER_SECRET).catch(() => {});
    }

    // Always return detailed per-platform results so the UI can show real errors
    return NextResponse.json({
      success: anySuccess,
      ai: { clickbaitTitle: ai.clickbaitTitle },
      instagram: result.instagram,
      facebook: result.facebook,
      // Surface errors at top level if both failed
      ...(!anySuccess && {
        error: [
          result.instagram.error && `IG: ${result.instagram.error}`,
          result.facebook.error && `FB: ${result.facebook.error}`,
        ].filter(Boolean).join(" | "),
      }),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
