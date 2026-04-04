/**
 * /api/automate-video
 * Autonomous video pipeline — pulls entertainment videos from 20+ sources.
 * No ffmpeg dependency — streams video directly to R2, uses branded image as cover.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveVideoUrl } from "@/lib/video-downloader";
import { generateAIContent } from "@/lib/gemini";
import { generateImage } from "@/lib/image-gen";
import { fetchAllVideoSources, VideoItem, TIKTOK_ACCOUNTS, buildAttribution } from "@/lib/video-sources";
import { fetchViralTikTokVideos, calculateViralScore, KENYAN_MUSIC_KEYWORDS, isOptimalPostingTime } from "@/lib/viral-intelligence";
import { Article } from "@/lib/types";
import { createHash } from "crypto";
import { logPost, isArticleSeen, markArticleSeen, getBlacklist, getPostLog } from "@/lib/supabase";
import { publishVideoStory } from "@/lib/publisher";

export const maxDuration = 300;

const GRAPH_API = "https://graph.facebook.com/v19.0";
const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Dedup via Supabase ────────────────────────────────────────────────────────
async function isVideoSeen(videoId: string): Promise<boolean> {
  return isArticleSeen(videoId);
}

async function markVideoSeen(videoId: string, title?: string): Promise<void> {
  return markArticleSeen(videoId, title);
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

    // Dry-run: return video candidates without posting (used by Sources tab preview)
    const isDryRun = req.headers.get("X-Dry-Run") === "true";

    if (!isDryRun && (!igToken || !igAccountId || !fbToken || !fbPageId)) {
      return NextResponse.json({ error: "Social credentials not configured" }, { status: 500 });
    }

    // Fetch from all sources + viral TikTok search in parallel
    const [allVideos, viralVideos] = await Promise.all([
      fetchAllVideoSources(),
      // Search for high-view viral videos (1M+ views target)
      fetchViralTikTokVideos(
        [
          ...KENYAN_MUSIC_KEYWORDS.sort(() => Math.random() - 0.5).slice(0, 3),
          "viral video 1 million views",
          "trending video today million views",
          "celebrity viral 2025",
        ]
      ).catch(() => []),
    ]);

    // Merge and deduplicate
    const seenIds = new Set(allVideos.map(v => v.id));
    const mergedVideos = [
      ...allVideos,
      ...viralVideos
        .filter(v => !seenIds.has(v.id))
        // Accept all viral videos regardless of view count
        .map(v => ({
          id: v.id, title: v.title, url: v.url,
          directVideoUrl: v.directVideoUrl, thumbnail: v.thumbnail,
          publishedAt: v.publishedAt, sourceName: v.sourceName,
          sourceType: v.sourceType as any, category: v.category,
          _playCount: v.playCount,
        })),
    ];

    if (mergedVideos.length === 0) {
      return NextResponse.json({ posted: 0, message: "No videos found from any source" });
    }

    // Dry-run: return candidates without posting (Sources tab preview)
    if (isDryRun) {
      return NextResponse.json({
        videos: mergedVideos.slice(0, 30).map(v => ({
          id: v.id, title: v.title, url: v.url,
          thumbnail: v.thumbnail, sourceName: v.sourceName,
          sourceType: v.sourceType, category: v.category,
          publishedAt: v.publishedAt, directVideoUrl: (v as any).directVideoUrl,
        })),
      });
    }

    // ── Blacklist filter (Supabase) ───────────────────────────────────────────
    const blacklistEntries = await getBlacklist();

    const filteredVideos = mergedVideos.filter(v => {
      const domain = (() => { try { return new URL(v.url).hostname.toLowerCase(); } catch { return ""; } })();
      const titleLower = v.title.toLowerCase();
      return !blacklistEntries.some(e => {
        if (e.type === "domain") return domain.includes(e.value.toLowerCase());
        if (e.type === "keyword") return titleLower.includes(e.value.toLowerCase());
        return false;
      });
    });

    // ── Duplicate title detection (Supabase) ─────────────────────────────────
    const recentPosts = await getPostLog(50, 1);
    const recentTitles = recentPosts.map((p: any) => (p.title || "").toLowerCase());

    const dedupedVideos = filteredVideos
      .filter(v => {
        const tl = v.title.toLowerCase();
        return !recentTitles.some(rt => levenshtein(tl.slice(0, 60), rt.slice(0, 60)) < 4);
      })
      .map(v => {
        // Score each video for viral potential
        const { viralScore, recencyScore, engagementScore } = calculateViralScore({
          publishedAt: v.publishedAt,
          title: v.title,
          category: v.category,
        });
        // Kenyan content gets a 25-point boost — we prioritize local content
        const isKenyan = /kenya|nairobi|kenyan|harambee|gor mahia|afc leopard|citizen tv|tuko|mpasho|ghafla|spm buzz/i.test(v.title + " " + v.sourceName);
        const hasDirect = !!v.directVideoUrl;
        // Boost high-view videos: 1M+ gets +40, 200K+ gets +20
        const playCount = (v as any)._playCount || 0;
        const viewBoost = playCount >= 1000000 ? 40 : playCount >= 200000 ? 20 : 0;
        const finalScore = viralScore + (isKenyan ? 25 : 0) + (hasDirect ? 10 : 0) + viewBoost;
        return { ...v, _score: finalScore, _isKenyan: isKenyan };
      })
      .sort((a, b) => {
        // Peak time: boost content matching current hour's optimal category
        const aOptimal = isOptimalPostingTime(a.category) ? 15 : 0;
        const bOptimal = isOptimalPostingTime(b.category) ? 15 : 0;
        return (b._score + bOptimal) - (a._score + aOptimal);
      });

    let target: VideoItem | null = null;
    let directUrl: string | null = null;

    // Try each video until we find one we can resolve
    for (const video of dedupedVideos) {
      if (await isVideoSeen(video.id)) continue;

      // For Reddit native videos: MUST use Cobalt to merge video+audio tracks
      // Reddit stores them separately — fallback_url has no audio
      if (video.id.startsWith("reddit:") || video.sourceType === "reddit") {
        let redditUrl: string | null = null;
        try {
          const cobaltRes = await fetch(`${WORKER_URL}/resolve-cobalt`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
            body: JSON.stringify({ videoUrl: video.url }),
            signal: AbortSignal.timeout(20000),
          });
          if (cobaltRes.ok) {
            const cd = await cobaltRes.json() as any;
            if (cd.success && cd.url) redditUrl = cd.url;
          }
        } catch {}
        // If Cobalt can't merge it, skip — no silent videos
        if (!redditUrl) continue;
        target = video;
        directUrl = redditUrl;
        await markVideoSeen(video.id);
        break;
      }

      // Try to get a direct URL for non-Reddit sources
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
      } else if (video.url.includes("dailymotion.com")) {
        // Dailymotion via worker resolver
        try {
          const dmRes = await fetch(`${WORKER_URL}/resolve-dailymotion`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
            body: JSON.stringify({ videoUrl: video.url }),
            signal: AbortSignal.timeout(15000),
          });
          if (dmRes.ok) {
            const dd = await dmRes.json() as any;
            if (dd.success && dd.url && !dd.url.includes('.m3u8')) url = dd.url;
          }
        } catch {}
      } else if (video.url.includes("twitter.com") || video.url.includes("x.com")) {
        // Twitter/X videos via Cobalt
        try {
          const cobaltRes = await fetch(`${WORKER_URL}/resolve-cobalt`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
            body: JSON.stringify({ videoUrl: video.url }),
            signal: AbortSignal.timeout(20000),
          });
          if (cobaltRes.ok) {
            const cd = await cobaltRes.json() as any;
            if (cd.success && cd.url) url = cd.url;
          }
        } catch {}
      } else if (video.url.includes("facebook.com") || (video as any).sourceType === "facebook") {
        // MutembeiTV Facebook video — resolve via worker's Facebook downloader
        try {
          const fbRes = await fetch(`${WORKER_URL}/resolve-facebook`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
            body: JSON.stringify({ videoUrl: video.url }),
            signal: AbortSignal.timeout(20000),
          });
          if (fbRes.ok) {
            const fd = await fbRes.json() as any;
            if (fd.success && fd.url) url = fd.url;
          }
        } catch {}
        // Fallback: Cobalt
        if (!url) {
          try {
            const cobaltRes = await fetch(`${WORKER_URL}/resolve-cobalt`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
              body: JSON.stringify({ videoUrl: video.url }),
              signal: AbortSignal.timeout(20000),
            });
            if (cobaltRes.ok) {
              const cd = await cobaltRes.json() as any;
              if (cd.success && cd.url) url = cd.url;
            }
          } catch {}
        }
      } else if (video.url.includes("youtube.com") || video.url.includes("youtu.be")) {
        // Try Cobalt API via worker first (most reliable for YouTube)
        try {
          const cobaltRes = await fetch(`${WORKER_URL}/resolve-cobalt`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
            body: JSON.stringify({ videoUrl: video.url }),
            signal: AbortSignal.timeout(20000),
          });
          if (cobaltRes.ok) {
            const cd = await cobaltRes.json() as any;
            if (cd.success && cd.url) url = cd.url;
          }
        } catch {}
        // Fallback: worker YouTube resolver
        if (!url) {
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
        }
        if (!url) {
          const resolved = await resolveVideoUrl(video.url).catch(() => null);
          url = resolved?.url || null;
        }
      } else {      }

      if (url) {
        target = video;
        directUrl = url;
        await markVideoSeen(video.id);
        break;
      }
      // Can't resolve URL — do NOT mark seen, so we can retry next run
    }

    if (!target || !directUrl) {
      return NextResponse.json({ posted: 0, message: "No resolvable videos found from any source" });
    }

    // ── Skip verification entirely — we trust our video sources ─────────────
    console.log(`[video] Processing: "${target.title}" from ${target.sourceName} (${target.category})`);

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

    // For MutembeiTV videos: translate Swahili to English and rewrite caption
    const isMutembei = target.sourceName === "Mutembei TV";
    const captionBody = isMutembei
      ? `${ai.caption}\n\n(Originally from Mutembei TV — translated and rewritten by PPP TV Kenya)`
      : ai.caption;

    const caption = `${captionBody}\n\n${
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
      await logPost({
        article_id: article.id,
        title: target.title,
        url: target.url,
        category: target.category,
        source_name: target.sourceName,
        source_type: target.sourceType,
        thumbnail: target.thumbnail,
        post_type: "video",
        ig_success: igResult.success,
        ig_post_id: igResult.postId,
        ig_error: igResult.error,
        fb_success: fbResult.success,
        fb_post_id: fbResult.postId,
        fb_error: fbResult.error,
        posted_at: new Date().toISOString(),
      });

      // Fire video story — post the same video to IG + FB stories (fire-and-forget)
      publishVideoStory(staged.url, coverUrl).then(s => {
        console.log(`[video-story] IG=${s.igStory.success} FB=${s.fbStory.success}`);
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
