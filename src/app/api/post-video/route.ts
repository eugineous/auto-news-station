import { NextRequest, NextResponse } from "next/server";
import { scrapeUrl } from "@/lib/url-scraper";
import { generateImage } from "@/lib/image-gen";
import { publish } from "@/lib/publisher";
import { resolveVideoUrl } from "@/lib/video-downloader";
import { Article } from "@/lib/types";
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

// Upload thumbnail to FB CDN (unpublished) and return hosted URL for IG cover_url
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
    await sleep(4000); // wait for CDN propagation
    const photoRes = await fetch(`${GRAPH_API}/${data.id}?fields=images&access_token=${fbToken}`);
    const photoData = await photoRes.json() as any;
    return photoData.images?.[0]?.source ?? undefined;
  } catch { return undefined; }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== "Bearer " + process.env.AUTOMATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { url?: string; headline?: string; caption?: string; category?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { url, headline, caption, category = "GENERAL" } = body;
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });
  if (!headline) return NextResponse.json({ error: "headline is required" }, { status: 400 });
  if (!caption) return NextResponse.json({ error: "caption is required" }, { status: 400 });

  try {
    // 1. Scrape to get the video existing thumbnail
    const scraped = await scrapeUrl(url);
    const thumbnailUrl = scraped.videoThumbnailUrl || scraped.imageUrl || "";

    // 2. Build article — uses video own thumbnail, smart-cropped to 4:5 (1080x1350)
    //    sharp uses position:"attention" which detects faces/subjects automatically
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

    // 3. Generate 4:5 thumbnail with headline overlay (face/subject-aware crop)
    const imageBuffer = await generateImage(article, { isBreaking: false });

    // 4. Upload thumbnail to FB CDN so IG can use it as cover_url for the Reel
    const coverImageUrl = await uploadThumbnailToCDN(imageBuffer);

    // 5. Resolve the actual video download URL
    //    - YouTube: resolved via ytdl-core (direct stream URL)
    //    - Direct .mp4: passed through
    //    - TikTok/Twitter/Instagram: use original URL (Graph API can fetch from source)
    const resolved = await resolveVideoUrl(url).catch(() => null);
    const videoUrl = resolved?.url || scraped.videoUrl || url;

    // 6. Post: video to IG Reel (with cover) + FB video
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

    return NextResponse.json({
      success: anySuccess,
      thumbnailUrl,
      instagram: result.instagram,
      facebook: result.facebook,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
