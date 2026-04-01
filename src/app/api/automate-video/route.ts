/**
 * /api/automate-video
 * Autonomous video pipeline — pulls entertainment videos from 20+ sources.
 * No ffmpeg dependency — streams video directly to R2, uses branded image as cover.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveVideoUrl } from "@/lib/video-downloader";
import { generateAIContent, verifyStory } from "@/lib/gemini";
import { generateImage } from "@/lib/image-gen";
import { fetchAllVideoSources, VideoItem, TIKTOK_ACCOUNTS, buildAttribution } from "@/lib/video-sources";
import { Article } from "@/lib/types";
import { createHash } from "crypto";

export const maxDuration = 300;

const GRAPH_API = "https://graph.facebook.com/v19.0";
const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Dedup via CF KV ───────────────────────────────────────────────────────────
async function isVideoSeen(videoId: string): Promise<boolean> {
  try {
    const res = await fetch(WORKER_URL + "/seen/check", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
      body: JSON.stringify({ ids: [videoId], titles: [] }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const { seen } = await res.json() as { seen: string[] };
    return seen.length > 0;
  } catch { return false; }
}

async function markVideoSeen(videoId: string): Promise<void> {
  try {
    await fetch(WORKER_URL + "/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
      body: JSON.stringify({ ids: [videoId] }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* non-fatal */ }
}

/**
 * Download the resolved MP4 and upload it directly to R2.
 * No ffmpeg — no binary dependency, no ENOENT.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  }
  return dp[m][n];
}

async function stageVideoInR2(videoUrl: string): Promise<{ url: string; key: string } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(videoUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Referer": "https://www.tiktok.com/", "Accept": "video/mp4,video/*,*/*" },
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) { if (attempt === 1) return null; continue; }

      const contentType = res.headers.get("content-type") || "";
      const buf = new Uint8Array(await res.arrayBuffer());

      // Reject HTML (expired URL)
      if (contentType.includes("text/html") || (buf.length > 4 && buf[0] === 0x3c)) {
        console.warn("[stageVideoInR2] Got HTML instead of video — URL expired, re-resolving");
        if (attempt === 1) return null;
        continue;
      }
      if (buf.length < 1000) { if (attempt === 1) return null; continue; }

      const upload = await fetch(WORKER_URL + "/stage-video-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
        body: JSON.stringify({ base64: Buffer.from(buf).toString("base64"), contentType: "video/mp4" }),
        signal: AbortSignal.timeout(150000),
      });
      if (!upload.ok) { if (attempt === 1) return null; continue; }
      const data = await upload.json() as any;
      return data.success ? { url: data.url, key: data.key } : null;
    } catch (err) {
      console.error("[stageVideoInR2]", err instanceof Error ? err.message : String(err));
      if (attempt === 1) return null;
    }
  }
  return null;
}

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

async function waitForIGContainer(containerId: string, token: string): Promise<void> {
  // Poll every 3s for up to 90s — IG typically processes in 15-45s
  for (let i = 0; i < 30; i++) {
    await sleep(3000);
    try {
      const res = await fetch(`${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${token}`);
      const data = await res.json() as any;
      const status = data.status_code || data.status || "";
      if (status === "FINISHED") return;
      if (status === "ERROR" || status === "EXPIRED") throw new Error(`IG container failed: ${status}`);
    } catch (err: any) {
      if (err.message?.includes("failed:")) throw err;
    }
  }
}

async function postReelToIG(
  stagedUrl: string, caption: string, coverUrl: string | undefined,
  token: string, accountId: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    const containerRes = await withRetry(() =>
      fetch(`${GRAPH_API}/${accountId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "REELS",
          video_url: stagedUrl,
          caption,
          share_to_feed: true,
          ...(coverUrl ? { cover_url: coverUrl } : {}),
          access_token: token,
        }),
      })
    );
    const container = await containerRes.json() as any;
    if (!containerRes.ok || container.error) throw new Error(container?.error?.message ?? "IG container failed");

    await waitForIGContainer(container.id, token);

    const publishRes = await withRetry(() =>
      fetch(`${GRAPH_API}/${accountId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: container.id, access_token: token }),
      })
    );
    const published = await publishRes.json() as any;
    if (!publishRes.ok || published.error) throw new Error(published?.error?.message ?? "IG publish failed");

    if (published.id) {
      await sleep(2000);
      await fetch(`${GRAPH_API}/${published.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "#KenyaEntertainment #PPPTVKenya #KenyaNews #NairobiLife #EastAfrica #KenyaMusic #NairobiEntertainment #Viral #Trending",
          access_token: token,
        }),
        signal: AbortSignal.timeout(10000),
      }).catch(() => {});
    }

    return { success: true, postId: published.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function postVideoToFB(
  stagedUrl: string, caption: string, token: string, pageId: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    const res = await withRetry(() =>
      fetch(`${GRAPH_API}/${pageId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_url: stagedUrl, description: caption, published: true, access_token: token }),
      })
    );
    const data = await res.json() as any;
    if (!res.ok || data.error) throw new Error(data?.error?.message ?? "FB video failed");
    return { success: true, postId: data.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const validSecrets = [
      "Bearer " + process.env.AUTOMATE_SECRET,
      "Bearer " + process.env.WORKER_SECRET,
      "Bearer ppptvWorker2024", // CF Worker fallback
    ].filter(Boolean);
    if (!validSecrets.includes(auth || "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;
    const fbToken = process.env.FACEBOOK_ACCESS_TOKEN;
    const fbPageId = process.env.FACEBOOK_PAGE_ID;

    if (!igToken || !igAccountId || !fbToken || !fbPageId) {
      return NextResponse.json({ error: "Social credentials not configured" }, { status: 500 });
    }

    const allVideos = await fetchAllVideoSources();
    if (allVideos.length === 0) {
      return NextResponse.json({ posted: 0, message: "No videos found from any source" });
    }

    // ── Blacklist filter ──────────────────────────────────────────────────────
    let blacklistEntries: { type: string; value: string }[] = [];
    try {
      const blRes = await fetch(WORKER_URL + "/blacklist", {
        headers: { Authorization: "Bearer " + WORKER_SECRET },
        signal: AbortSignal.timeout(5000),
      });
      if (blRes.ok) {
        const blData = await blRes.json() as any;
        blacklistEntries = blData.blacklist || [];
      }
    } catch { /* non-fatal */ }

    const filteredVideos = allVideos.filter(v => {
      const domain = (() => { try { return new URL(v.url).hostname.toLowerCase(); } catch { return ""; } })();
      const titleLower = v.title.toLowerCase();
      return !blacklistEntries.some(e => {
        if (e.type === "domain") return domain.includes(e.value.toLowerCase());
        if (e.type === "keyword") return titleLower.includes(e.value.toLowerCase());
        return false;
      });
    });

    // ── Duplicate title detection (Levenshtein distance) ─────────────────────
    let recentTitles: string[] = [];
    try {
      const logRes = await fetch(WORKER_URL + "/post-log?limit=50", {
        headers: { Authorization: "Bearer " + WORKER_SECRET },
        signal: AbortSignal.timeout(5000),
      });
      if (logRes.ok) {
        const logData = await logRes.json() as any;
        const cutoff = Date.now() - 24 * 3600 * 1000;
        recentTitles = (logData.log || [])
          .filter((e: any) => new Date(e.postedAt).getTime() > cutoff)
          .map((e: any) => (e.title || "").toLowerCase());
      }
    } catch { /* non-fatal */ }

    const dedupedVideos = filteredVideos.filter(v => {
      const tl = v.title.toLowerCase();
      return !recentTitles.some(rt => levenshtein(tl.slice(0, 60), rt.slice(0, 60)) < 10);
    });

    let target: VideoItem | null = null;
    let directUrl: string | null = null;

    // Try each video until we find one we can resolve
    for (const video of dedupedVideos) {
      if (await isVideoSeen(video.id)) continue;

      // Try to get a direct URL
      let url: string | null = null;
      const isCdnUrl = (u: string) => /\.(mp4|mov|webm)/i.test(u) ||
        /v\d+-webapp\.tiktok\.com|tikcdn\.io|tiktokcdn\.com|v16-webapp|v19-webapp|v26-webapp/i.test(u) ||
        /googlevideo\.com|cdninstagram\.com|video\.twimg\.com|redd\.it|v\.redd\.it/i.test(u);

      if (video.directVideoUrl && isCdnUrl(video.directVideoUrl)) {
        url = video.directVideoUrl;
      } else if (video.url.includes("tiktok.com")) {
        try {
          const tikwmBody = new URLSearchParams({ url: video.url, hd: "1" });
          const tikwmRes = await fetch("https://www.tikwm.com/api/", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/1.0)" },
            body: tikwmBody.toString(),
            signal: AbortSignal.timeout(12000),
          });
          if (tikwmRes.ok) {
            const d = await tikwmRes.json() as any;
            if (d.code === 0 && d.data) url = d.data.hdplay || d.data.play || null;
          }
        } catch {}
        if (!url) {
          const resolved = await resolveVideoUrl(video.url).catch(() => null);
          url = resolved?.url || null;
        }
      } else if (video.directVideoUrl) {
        url = video.directVideoUrl;
      } else if (video.url.includes("youtube.com") || video.url.includes("youtu.be")) {
      // For YouTube, try worker resolver first (bypasses Vercel restrictions)
      const videoId = video.url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
      if (videoId) {
        try {
          const wRes = await fetch(`${WORKER_URL}/resolve-youtube`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
            body: JSON.stringify({ videoId }),
            signal: AbortSignal.timeout(20000),
          });
          if (wRes.ok) {
            const wd = await wRes.json() as any;
            if (wd.success && wd.url) url = wd.url;
          }
        } catch {}
      }
      if (!url) {
        const resolved = await resolveVideoUrl(video.url).catch(() => null);
        url = resolved?.url || null;
      }
    } else {
        const resolved = await resolveVideoUrl(video.url).catch(() => null);
        url = resolved?.url || null;
      }

      if (url) {
        target = video;
        directUrl = url;
        await markVideoSeen(video.id);
        break;
      }
      // Can't resolve this one — mark seen and try next
      await markVideoSeen(video.id);
    }

    if (!target || !directUrl) {
      return NextResponse.json({ posted: 0, message: "No resolvable videos found from any source" });
    }

    // ── Story verification — cross-reference against credible sources ─────────
    const verification = await verifyStory(target.title, target.url);
    if (!verification.verified) {
      console.warn(`[verify] BLOCKED: "${target.title}" — ${verification.reason} (confidence: ${verification.confidence})`);
      // Log the blocked story
      await fetch(WORKER_URL + "/post-log", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
        body: JSON.stringify({
          articleId: createHash("sha256").update(target.id).digest("hex").slice(0, 16),
          title: target.title, url: target.url,
          category: target.category, sourceName: target.sourceName,
          blocked: true, blockReason: verification.reason,
          postedAt: new Date().toISOString(), postType: "video",
        }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
      return NextResponse.json({ posted: 0, message: `Story blocked: ${verification.reason}`, blocked: true });
    }
    if (verification.confidence < 40) {
      console.warn(`[verify] LOW CONFIDENCE: "${target.title}" — ${verification.reason} (${verification.confidence}%) — skipping`);
      return NextResponse.json({ posted: 0, message: `Low confidence story skipped (${verification.confidence}%)`, blocked: true });
    }
    console.log(`[verify] APPROVED: "${target.title}" — ${verification.reason} (${verification.confidence}%)`);

    const staged = await stageVideoInR2(directUrl);
    if (!staged) {
      return NextResponse.json({ posted: 0, error: "Video staging failed", source: target.sourceName });
    }

    const thumbRaw = target.thumbnail || "";
    const thumbUrl = thumbRaw ? `${WORKER_URL}/img?url=${encodeURIComponent(thumbRaw)}` : "";
    const article: Article = {
      id: createHash("sha256").update(target.id).digest("hex").slice(0, 16),
      title: target.title,
      url: target.url,
      imageUrl: thumbUrl,
      summary: target.title,
      fullBody: target.title,
      sourceName: target.sourceName,
      category: target.category,
      publishedAt: target.publishedAt,
      isVideo: true,
      videoUrl: target.url,
    };

    const ai = await generateAIContent(article).catch(() => ({
      clickbaitTitle: (target as VideoItem).title.toUpperCase(),
      caption: `${(target as VideoItem).title}\n\nTag someone who needs to see this.`,
      firstComment: "#KenyaEntertainment #PPPTVKenya",
      engagementType: "tag" as const,
    }));

    const caption = `${ai.caption}\n\n${
      target.sourceType === "direct-mp4" && target.url.includes("tiktok.com")
        ? (() => {
            const acct = TIKTOK_ACCOUNTS.find(a => (target as VideoItem).url.includes(a.username));
            return acct ? buildAttribution(acct, target.url) : `Credit: ${(target as VideoItem).sourceName} | ${(target as VideoItem).url}`;
          })()
        : `Credit: ${target.sourceName} | ${target.url}`
    }`;

    // Generate branded PPP TV cover image and stage it to R2
    let coverUrl: string | undefined;
    try {
      const imageBuffer = await generateImage(article, { isBreaking: false });
      const stageRes = await fetch(WORKER_URL + "/stage-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
        body: JSON.stringify({ imageBuffer: imageBuffer.toString("base64") }),
        signal: AbortSignal.timeout(15000),
      });
      if (stageRes.ok) {
        const d = await stageRes.json() as any;
        coverUrl = d?.url;
      }
    } catch { /* cover is optional */ }

    const [igResult, fbResult] = await Promise.all([
      postReelToIG(staged.url, caption, coverUrl, igToken, igAccountId),
      postVideoToFB(staged.url, caption, fbToken, fbPageId),
    ]);

    // R2 cleanup with retry
    const cleanupVideo = async (retries = 3) => {
      for (let i = 0; i < retries; i++) {
        try {
          const r = await fetch(WORKER_URL + "/delete-video", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
            body: JSON.stringify({ key: staged.key }),
            signal: AbortSignal.timeout(10000),
          });
          if (r.ok) return;
        } catch {}
        await sleep(5000);
      }
    };
    setTimeout(() => cleanupVideo(), 10 * 60 * 1000);

    // X posting
    let xResult: { success: boolean; postId?: string; error?: string } = { success: false, error: "skipped" };
    try {
      const { postToX, buildTweetText } = await import("@/lib/x-poster");
      const tweetText = buildTweetText(target.title, target.url, target.category);
      xResult = await postToX(tweetText);
    } catch (err: any) { xResult = { success: false, error: err.message }; }

    if (igResult.success || fbResult.success) {
      await fetch(WORKER_URL + "/post-log", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
        body: JSON.stringify({
          articleId: article.id, title: target.title, url: target.url,
          category: target.category, sourceName: target.sourceName,
          sourceType: target.sourceType, thumbnail: target.thumbnail,
          instagram: igResult, facebook: fbResult, twitter: xResult,
          postedAt: new Date().toISOString(), postType: "video",
        }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }

    return NextResponse.json({
      posted: (igResult.success || fbResult.success) ? 1 : 0,
      video: { title: target.title, source: target.sourceName, type: target.sourceType, url: target.url },
      instagram: igResult, facebook: fbResult, twitter: xResult,
    });
  } catch (error: any) {
    console.error("[automate-video] Critical Error:", error);
    return NextResponse.json({ error: error.message || "Unknown error" }, { status: 500 });
  }
}
