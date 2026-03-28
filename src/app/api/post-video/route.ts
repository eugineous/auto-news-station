import { NextRequest, NextResponse } from "next/server";
import { scrapeUrl } from "@/lib/url-scraper";
import { generateImage } from "@/lib/image-gen";
import { resolveVideoUrl } from "@/lib/video-downloader";
import { Article } from "@/lib/types";
import { createHash } from "crypto";
import ffmpegPath from "ffmpeg-static";
import fs from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { spawn } from "child_process";

export const maxDuration = 180;

const GRAPH_API = "https://graph.facebook.com/v19.0";
const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";
const LOGO_PATH = path.join(process.cwd(), "public", "ppp-logo.png");
const MAX_BYTES = 120 * 1024 * 1024; // 120MB safety

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

// Stage video via Cloudflare Worker → R2 → returns public URL
async function stageVideo(sourceUrl: string): Promise<{ url: string; key: string }> {
  // Resolve platform URLs to direct MP4 first
  const resolved = await resolveVideoUrl(sourceUrl).catch(() => null);
  const fetchUrl = resolved?.url || sourceUrl;

  // Download video
  const resp = await fetch(fetchUrl, { signal: AbortSignal.timeout(120000) });
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  const arr = new Uint8Array(await resp.arrayBuffer());
  if (arr.length > MAX_BYTES) throw new Error("Video too large to process (>120MB)");

  // Write temp files
  const tmpIn = path.join(tmpdir(), `ppp-in-${Date.now()}.mp4`);
  const tmpOut = path.join(tmpdir(), `ppp-out-${Date.now()}.mp4`);
  await fs.writeFile(tmpIn, arr);

  // Ensure logo exists
  const logoBuf = await fs.readFile(LOGO_PATH);
  const tmpLogo = path.join(tmpdir(), `ppp-logo-${Date.now()}.png`);
  await fs.writeFile(tmpLogo, logoBuf);

  // ffmpeg overlay bottom-left with 24px margin, copy audio, keep size
  await new Promise<void>((resolve, reject) => {
    const ff = spawn(ffmpegPath as string, [
      "-i", tmpIn,
      "-i", tmpLogo,
      "-filter_complex", "overlay=24:24",
      "-c:a", "copy",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-movflags", "+faststart",
      tmpOut
    ], { stdio: "ignore" });
    ff.on("error", reject);
    ff.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
  });

  const processed = await fs.readFile(tmpOut);
  await fs.unlink(tmpIn).catch(()=>{});
  await fs.unlink(tmpOut).catch(()=>{});
  await fs.unlink(tmpLogo).catch(()=>{});

  const res = await fetch(WORKER_URL + "/stage-video-upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + WORKER_SECRET,
    },
    body: JSON.stringify({ base64: Buffer.from(processed).toString("base64"), contentType: "video/mp4" }),
    signal: AbortSignal.timeout(150000),
  });
  const data = await res.json() as any;
  if (!res.ok || !data.success) throw new Error(data.error ?? `Stage failed: HTTP ${res.status}`);
  return { url: data.url, key: data.key };
}

async function waitForIGContainer(containerId: string, token: string): Promise<void> {
  for (let i = 0; i < 24; i++) {
    await sleep(5000);
    try {
      const res = await fetch(`${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${token}`);
      const data = await res.json() as any;
      const status = data.status_code || data.status || "";
      console.log(`[ig] container ${containerId} status: ${status}`);
      if (status === "FINISHED") return;
      if (status === "ERROR" || status === "EXPIRED") throw new Error(`IG container failed: ${status}`);
    } catch (err: any) {
      if (err.message.includes("failed:")) throw err;
    }
  }
}

export async function POST(req: NextRequest) {
  let body: { url?: string; headline?: string; caption?: string; category?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { url, headline, caption, category = "GENERAL" } = body;
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });
  if (!headline) return NextResponse.json({ error: "headline is required" }, { status: 400 });
  if (!caption) return NextResponse.json({ error: "caption is required" }, { status: 400 });

  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const fbToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const fbPageId = process.env.FACEBOOK_PAGE_ID;

  try {
    const scraped = await scrapeUrl(url);
    const thumbRaw = scraped.videoThumbnailUrl || scraped.imageUrl || "";
    const thumbnailUrl = thumbRaw ? `${WORKER_URL}/img?url=${encodeURIComponent(thumbRaw)}` : "";

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

    // Generate branded thumbnail
    const imageBuffer = await generateImage(article, { isBreaking: false });

    // Stage video on R2 via Cloudflare Worker
    const { url: stagedVideoUrl, key: stagedKey } = await stageVideo(url);

    // Upload thumbnail to FB to get a hosted cover URL for IG Reels
    let coverImageUrl: string | undefined;
    try {
      if (fbToken && fbPageId) {
        const blob = new Blob(
          [imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength) as ArrayBuffer],
          { type: "image/jpeg" }
        );
        const form = new FormData();
        form.append("source", blob, "cover.jpg");
        form.append("published", "false");
        form.append("access_token", fbToken);
        const r = await fetch(`${GRAPH_API}/${fbPageId}/photos`, { method: "POST", body: form });
        const d = await r.json() as any;
        if (r.ok && !d.error) {
          await sleep(3000);
          const pr = await fetch(`${GRAPH_API}/${d.id}?fields=images&access_token=${fbToken}`);
          const pd = await pr.json() as any;
          coverImageUrl = pd.images?.[0]?.source;
        }
      }
    } catch {}

    // ── Post to Instagram as Reel ─────────────────────────────────────────────
    let igResult: { success: boolean; postId?: string; error?: string } = { success: false, error: "skipped" };
    if (igToken && igAccountId) {
      try {
        const containerRes = await withRetry(() =>
          fetch(`${GRAPH_API}/${igAccountId}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              media_type: "REELS",
              video_url: stagedVideoUrl,
              caption,
              share_to_feed: true,
              ...(coverImageUrl ? { cover_url: coverImageUrl } : {}),
              access_token: igToken,
            }),
          })
        );
        const container = await containerRes.json() as any;
        if (!containerRes.ok || container.error) throw new Error(container?.error?.message ?? "IG container failed");

        await waitForIGContainer(container.id, igToken);

        const publishRes = await withRetry(() =>
          fetch(`${GRAPH_API}/${igAccountId}/media_publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ creation_id: container.id, access_token: igToken }),
          })
        );
        const published = await publishRes.json() as any;
        if (!publishRes.ok || published.error) throw new Error(published?.error?.message ?? "IG publish failed");
        igResult = { success: true, postId: published.id };
      } catch (err: any) {
        igResult = { success: false, error: err.message };
      }
    }

    // ── Post to Facebook as video ─────────────────────────────────────────────
    let fbResult: { success: boolean; postId?: string; error?: string } = { success: false, error: "skipped" };
    if (fbToken && fbPageId) {
      try {
        const fbCaption = caption + "\n\n🔗 " + article.url;
        const feedRes = await withRetry(() =>
          fetch(`${GRAPH_API}/${fbPageId}/videos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              file_url: stagedVideoUrl,
              description: fbCaption,
              published: true,
              access_token: fbToken,
            }),
          })
        );
        const feedData = await feedRes.json() as any;
        if (feedRes.ok && !feedData.error) fbResult = { success: true, postId: feedData.id };
        else fbResult = { success: false, error: feedData?.error?.message ?? "FB video post failed" };
      } catch (err: any) {
        fbResult = { success: false, error: err.message };
      }
    }

    // Delete staged video after posting (don't await — fire and forget)
    if (stagedKey) {
      fetch(WORKER_URL + "/delete-video", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
        body: JSON.stringify({ key: stagedKey }),
      }).catch(() => {});
    }

    const anySuccess = igResult.success || fbResult.success;
    if (anySuccess) {
      await logPost({
        articleId: article.id, title: headline, url: article.url,
        category: article.category,
        instagram: igResult, facebook: fbResult,
        postedAt: new Date().toISOString(), manualPost: true, postType: "video",
      });
    }

    return NextResponse.json({ success: anySuccess, thumbnailUrl, instagram: igResult, facebook: fbResult });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
