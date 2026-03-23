import { NextRequest, NextResponse } from "next/server";
import { scrapeUrl } from "@/lib/url-scraper";
import { generateImage } from "@/lib/image-gen";
import { publish } from "@/lib/publisher";
import { resolveVideoUrl } from "@/lib/video-downloader";
import { Article } from "@/lib/types";
import { isAuthenticated } from "@/lib/auth";
import { createHash } from "crypto";

export const maxDuration = 180;

const GRAPH_API = "https://graph.facebook.com/v19.0";
const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://ppptv-worker.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "";

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

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

async function uploadThumbnailToCDN(imageBuffer: Buffer): Promise<string | undefined> {
  const fbToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const fbPageId = process.env.FACEBOOK_PAGE_ID;
  if (!fbToken || !fbPageId) return undefined;
  try {
    const blob = new Blob(
      [imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength) as ArrayBuffer],
      { type: "image/jpeg" }
    );
    const form = new FormData();
    form.append("source", blob, "cover.jpg");
    form.append("published", "false");
    form.append("access_token", fbToken);
    const res = await fetch(`${GRAPH_API}/${fbPageId}/photos`, { method: "POST", body: form });
    const data = await res.json() as any;
    if (!res.ok || data.error) return undefined;
    await sleep(4000);
    const photoRes = await fetch(`${GRAPH_API}/${data.id}?fields=images&access_token=${fbToken}`);
    const photoData = await photoRes.json() as any;
    return photoData.images?.[0]?.source ?? undefined;
  } catch { return undefined; }
}

export async function POST(req: NextRequest) {
  if (!isAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { url?: string; headline?: string; caption?: string; category?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { url, headline, caption, category = "GENERAL" } = body;
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });
  if (!headline) return NextResponse.json({ error: "headline is required" }, { status: 400 });
  if (!caption) return NextResponse.json({ error: "caption is required" }, { status: 400 });

  try {
    const scraped = await scrapeUrl(url);
    const thumbnailUrl = scraped.videoThumbnailUrl || scraped.imageUrl || "";

    const article: Article = {
      id: createHash("sha256").update(url).digest("hex").slice(0, 16),
      title: headline,
      url: scraped.sourceUrl || url,
      imageUrl: thumbnailUrl,
      summary: caption,
      fullBody: caption,
      sourceName: scraped.sourceName || "PPP TV",
      category: category.toUpperCase(),
      publishedAt: new Date(),
    };

    const imageBuffer = await generateImage(article, { isBreaking: false });
    const coverImageUrl = await uploadThumbnailToCDN(imageBuffer);

    // YouTube: resolved via ytdl-core; direct .mp4: pass through; others: use original URL
    const resolved = await resolveVideoUrl(url).catch(() => null);
    const videoUrl = resolved?.url || scraped.videoUrl || url;

    const igPost = { platform: "instagram" as const, caption, articleUrl: article.url };
    const fbPost = { platform: "facebook" as const, caption, articleUrl: article.url };
    const result = await publish({ ig: igPost, fb: fbPost }, imageBuffer, videoUrl, coverImageUrl);

    const anySuccess = result.facebook.success || result.instagram.success;
    if (anySuccess) {
      await logPost({
        articleId: article.id, title: headline, url: article.url,
        category: article.category, sourceType: scraped.type,
        instagram: result.instagram, facebook: result.facebook,
        postedAt: new Date().toISOString(), manualPost: true, postType: "video",
      });
    }

    return NextResponse.json({ success: anySuccess, thumbnailUrl, instagram: result.instagram, facebook: result.facebook });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}