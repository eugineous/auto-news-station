import { NextRequest, NextResponse } from "next/server";
import { scrapeUrl } from "@/lib/url-scraper";
import { generateImage } from "@/lib/image-gen";
import { resolveVideoUrl } from "@/lib/video-downloader";
import { publishStories } from "@/lib/publisher";
import { Article } from "@/lib/types";
import { createHash } from "crypto";

export const maxDuration = 180;

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

async function logPost(entry: object): Promise<void> {
  try {
    await fetch(WORKER_URL + "/post-log", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
      body: JSON.stringify(entry),
      signal: AbortSignal.timeout(5000),
    });
  } catch {}
}

async function stageVideo(sourceUrl: string): Promise<{ url: string; key: string }> {
  const resolved = await resolveVideoUrl(sourceUrl).catch(() => null);
  const fetchUrl = resolved?.url || sourceUrl;

  let videoBytes: Uint8Array | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(fetchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://www.tiktok.com/",
          "Accept": "video/mp4,video/*,*/*",
        },
        signal: AbortSignal.timeout(120000),
      });
      if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
      const contentType = resp.headers.get("content-type") || "";
      const bytes = new Uint8Array(await resp.arrayBuffer());
      if (contentType.includes("text/html") || (bytes.length > 4 && bytes[0] === 0x3c))
        throw new Error("Got HTML instead of video — URL may have expired");
      if (bytes.length < 1000)
        throw new Error(`Downloaded file too small (${bytes.length} bytes)`);
      videoBytes = bytes;
      break;
    } catch (err: any) {
      if (attempt === 1) throw err;
      const retry = await resolveVideoUrl(sourceUrl).catch(() => null);
      if (retry?.url && retry.url !== fetchUrl) {
        const retryResp = await fetch(retry.url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "video/mp4,video/*,*/*" },
          signal: AbortSignal.timeout(120000),
        });
        if (!retryResp.ok) throw new Error(`Retry download failed: ${retryResp.status}`);
        const retryBytes = new Uint8Array(await retryResp.arrayBuffer());
        if (retryBytes.length < 1000) throw new Error("Retry video too small");
        videoBytes = retryBytes;
        break;
      }
      throw err;
    }
  }
  if (!videoBytes) throw new Error("Could not download video");

  const res = await fetch(WORKER_URL + "/stage-video-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
    body: JSON.stringify({ base64: Buffer.from(videoBytes).toString("base64"), contentType: "video/mp4" }),
    signal: AbortSignal.timeout(150000),
  });
  const data = await res.json() as any;
  if (!res.ok || !data.success) throw new Error(data.error ?? `Stage failed: HTTP ${res.status}`);
  return { url: data.url, key: data.key };
}

async function waitForIGContainer(containerId: string, token: string, emit?: (p: number, msg: string) => void): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await sleep(3000);
    try {
      const res = await fetch(`${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${token}`);
      const data = await res.json() as any;
      const status = data.status_code || data.status || "";
      const pct = 65 + Math.min(i * 1, 20); // 65–85%
      emit?.(pct, `IG processing… (${status || "IN_PROGRESS"})`);
      if (status === "FINISHED") return;
      if (status === "ERROR" || status === "EXPIRED") throw new Error(`IG container failed: ${status}`);
    } catch (err: any) {
      if (err.message?.includes("failed:")) throw err;
    }
  }
}

// ── SSE helper ────────────────────────────────────────────────────────────────
function makeSSE() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) { controller = c; },
  });

  function emit(pct: number, step: string, extra?: object) {
    const data = JSON.stringify({ pct, step, ...extra });
    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
  }

  function close() { controller.close(); }

  return { stream, emit, close };
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

  const { stream, emit, close } = makeSSE();

  // Run the pipeline async, stream progress via SSE
  (async () => {
    try {
      emit(5, "Scraping metadata…");
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

      emit(12, "Generating branded thumbnail…");
      const imageBuffer = await generateImage(article, { isBreaking: false });

      emit(20, "Resolving video URL…");
      // stageVideo handles resolve + download + upload
      emit(28, "Downloading video…");
      const { url: stagedVideoUrl, key: stagedKey } = await stageVideo(url);

      emit(50, "Video staged to R2 ✓");

      // Stage cover image
      emit(55, "Staging cover image…");
      let coverImageUrl: string | undefined;
      try {
        const stageImgRes = await fetch(WORKER_URL + "/stage-image", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
          body: JSON.stringify({ imageBuffer: imageBuffer.toString("base64") }),
          signal: AbortSignal.timeout(15000),
        });
        if (stageImgRes.ok) {
          const d = await stageImgRes.json() as any;
          coverImageUrl = d?.url;
        }
      } catch {}

      if (!coverImageUrl && fbToken && fbPageId) {
        try {
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
        } catch {}
      }

      // ── Instagram ────────────────────────────────────────────────────────────
      emit(60, "Submitting to Instagram…");
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

          emit(65, "IG container created — waiting for processing…");
          await waitForIGContainer(container.id, igToken, emit);

          emit(86, "Publishing to Instagram…");
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
          emit(90, "Instagram ✓ published!");
        } catch (err: any) {
          igResult = { success: false, error: err.message };
          emit(90, `Instagram ✗ ${err.message}`);
        }
      }

      // ── Facebook ─────────────────────────────────────────────────────────────
      emit(92, "Posting to Facebook…");
      let fbResult: { success: boolean; postId?: string; error?: string } = { success: false, error: "skipped" };
      if (fbToken && fbPageId) {
        try {
          const fbCaption = caption + "\n\n🔗 " + article.url;
          const feedRes = await withRetry(() =>
            fetch(`${GRAPH_API}/${fbPageId}/videos`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ file_url: stagedVideoUrl, description: fbCaption, published: true, access_token: fbToken }),
            })
          );
          const feedData = await feedRes.json() as any;
          if (feedRes.ok && !feedData.error) {
            fbResult = { success: true, postId: feedData.id };
            emit(96, "Facebook ✓ published!");
          } else {
            fbResult = { success: false, error: feedData?.error?.message ?? "FB video post failed" };
            emit(96, `Facebook ✗ ${fbResult.error}`);
          }
        } catch (err: any) {
          fbResult = { success: false, error: err.message };
          emit(96, `Facebook ✗ ${err.message}`);
        }
      }

      // Cleanup
      if (stagedKey) {
        setTimeout(() => {
          fetch(WORKER_URL + "/delete-video", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
            body: JSON.stringify({ key: stagedKey }),
          }).catch(() => {});
        }, 10 * 60 * 1000);
      }

      const anySuccess = igResult.success || fbResult.success;
      if (anySuccess) {
        publishStories(imageBuffer, WORKER_URL, WORKER_SECRET).catch(() => {});
        await logPost({
          articleId: article.id, title: headline, url: article.url,
          category: article.category, instagram: igResult, facebook: fbResult,
          postedAt: new Date().toISOString(), manualPost: true, postType: "video",
        });
      }

      emit(100, anySuccess ? "Done! ✓" : "Completed with errors", {
        done: true, success: anySuccess,
        instagram: igResult, facebook: fbResult, thumbnailUrl,
      });
    } catch (err: any) {
      emit(100, `Error: ${err.message}`, { done: true, success: false, error: err.message });
    } finally {
      close();
    }
  })();

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
