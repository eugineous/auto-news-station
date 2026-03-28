import ytdl from "@distube/ytdl-core";

export interface VideoResolution {
  url: string;
  filename?: string;
  thumbnail?: string;
  title?: string;
  platform?: string;
}

const SUPPORTED = /youtube\.com|youtu\.be|tiktok\.com|twitter\.com|x\.com|instagram\.com|dailymotion\.com|vimeo\.com|reddit\.com|redd\.it|pinterest\.com|soundcloud\.com|twitch\.tv|bilibili\.com/;

export function isVideoSupported(url: string): boolean {
  return SUPPORTED.test(url) || /\.(mp4|mov|webm)(\?|$)/i.test(url);
}

function isYouTube(url: string): boolean {
  return /youtube\.com\/watch|youtu\.be\//.test(url);
}

function isTikTok(url: string): boolean {
  return /tiktok\.com/i.test(url);
}

function detectPlatform(url: string): string {
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/twitter\.com|x\.com/i.test(url)) return "twitter";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/dailymotion\.com/i.test(url)) return "dailymotion";
  if (/vimeo\.com/i.test(url)) return "vimeo";
  if (/reddit\.com|redd\.it/i.test(url)) return "reddit";
  if (/pinterest\.com/i.test(url)) return "pinterest";
  return "unknown";
}

async function resolveYouTube(url: string): Promise<VideoResolution | null> {
  try {
    const info = await ytdl.getInfo(url);
    const formats = ytdl.filterFormats(info.formats, "videoandaudio");
    const mp4 = formats
      .filter((f) => f.container === "mp4")
      .sort((a, b) => (parseInt(b.qualityLabel || "0") - parseInt(a.qualityLabel || "0")));
    const chosen = mp4[0] || formats[0];
    if (!chosen?.url) return null;
    return {
      url: chosen.url,
      filename: `${info.videoDetails.videoId}.mp4`,
      thumbnail: info.videoDetails.thumbnails?.slice(-1)[0]?.url,
      title: info.videoDetails.title,
      platform: "youtube",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[video-dl] ytdl error: ${msg}`);
    return null;
  }
}

// ── YouTube via yt1s/y2mate style API — fallback when ytdl fails ─────────────
async function resolveYouTubeViaAPI(url: string): Promise<VideoResolution | null> {
  // Try cobalt first for YouTube as a reliable fallback
  try {
    const res = await fetch("https://api.cobalt.tools/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ url, videoQuality: "720", downloadMode: "auto" }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = await res.json() as any;
      if (data.status !== "error" && (data.url || data.tunnel)) {
        return { url: data.url || data.tunnel, platform: "youtube" };
      }
    }
  } catch { /* try next */ }

  // Try y2mate-style API
  try {
    const videoId = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
    if (!videoId) return null;
    const res = await fetch("https://www.y2mate.com/mates/analyzeV2/ajax", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ k_query: url, k_page: "home", hl: "en", q_auto: "0" }).toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const links = data?.links?.mp4;
    if (!links) return null;
    // Pick 720p or best available
    const quality = links["720p"] || links["480p"] || links["360p"] || Object.values(links)[0] as any;
    if (!quality?.k) return null;
    // Convert key to download URL
    const dlRes = await fetch("https://www.y2mate.com/mates/convertV2/index", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ vid: videoId, k: quality.k }).toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!dlRes.ok) return null;
    const dlData = await dlRes.json() as any;
    if (dlData?.dlink) return { url: dlData.dlink, platform: "youtube" };
  } catch { /* fall through */ }

  return null;
}

// ── Instagram via igram.world scrape ─────────────────────────────────────────
async function resolveViaIgram(url: string): Promise<VideoResolution | null> {
  try {
    const pageRes = await fetch("https://igram.world/en1/", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000),
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    // Extract CSRF token
    const csrfMatch = html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/);
    if (!csrfMatch) return null;
    const csrf = csrfMatch[1];

    const formBody = new URLSearchParams({ url, csrfmiddlewaretoken: csrf });
    const submitRes = await fetch("https://igram.world/api/convert", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://igram.world/en1/",
        "X-CSRFToken": csrf,
      },
      body: formBody.toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!submitRes.ok) return null;
    const data = await submitRes.json() as any;
    // igram returns array of media items
    const items = Array.isArray(data) ? data : (data.media || data.items || []);
    const video = items.find((item: any) => item.type === "video" || item.url?.includes(".mp4"));
    if (video?.url) return { url: video.url, thumbnail: video.thumbnail, platform: "instagram" };
  } catch (err: any) {
    console.warn("[igram] error:", err?.message);
  }
  return null;
}

// ── Instagram via SaveIG scrape ───────────────────────────────────────────────
async function resolveViaSaveIG(url: string): Promise<VideoResolution | null> {
  try {
    const pageRes = await fetch("https://saveig.app/en", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000),
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const tokenMatch = html.match(/name="token"\s+value="([^"]+)"/);
    if (!tokenMatch) return null;

    const formBody = new URLSearchParams({ url, token: tokenMatch[1] });
    const submitRes = await fetch("https://saveig.app/api/ajaxSearch", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://saveig.app/en",
      },
      body: formBody.toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!submitRes.ok) return null;
    const result = await submitRes.text();
    const mp4Match = result.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i)
      || result.match(/"(https?:\/\/[^"]*instagram[^"]*\.mp4[^"]*)"/i)
      || result.match(/data-url="(https?:\/\/[^"]+)"/i);
    if (mp4Match) return { url: mp4Match[1], platform: "instagram" };
  } catch (err: any) {
    console.warn("[saveig] error:", err?.message);
  }
  return null;
}

// ── Twitter/X via twitsave.com ────────────────────────────────────────────────
async function resolveViaTwitterSave(url: string): Promise<VideoResolution | null> {
  try {
    const res = await fetch(`https://twitsave.com/info?url=${encodeURIComponent(url)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Extract highest quality MP4 link
    const mp4Matches = Array.from(html.matchAll(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/gi));
    if (mp4Matches.length === 0) return null;
    // Pick the first (highest quality) match
    return { url: mp4Matches[0][1], platform: "twitter" };
  } catch (err: any) {
    console.warn("[twitsave] error:", err?.message);
  }
  return null;
}

// ── Twitter/X via ssstwitter.com ──────────────────────────────────────────────
async function resolveViaSSSTwitter(url: string): Promise<VideoResolution | null> {
  try {
    const pageRes = await fetch("https://ssstwitter.com/en", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000),
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const ttMatch = html.match(/name="tt"\s+value="([^"]+)"/);
    if (!ttMatch) return null;

    const formBody = new URLSearchParams({ id: url, locale: "en", tt: ttMatch[1] });
    const submitRes = await fetch("https://ssstwitter.com/abc?url=dl", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://ssstwitter.com/en",
        "HX-Request": "true",
        "HX-Target": "target",
        "HX-Current-URL": "https://ssstwitter.com/en",
      },
      body: formBody.toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!submitRes.ok) return null;
    const result = await submitRes.text();
    const mp4Match = result.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i)
      || result.match(/href="(https?:\/\/video\.twimg[^"]+)"/i);
    if (mp4Match) return { url: mp4Match[1], platform: "twitter" };
  } catch (err: any) {
    console.warn("[ssstwitter] error:", err?.message);
  }
  return null;
}

// ── TikWM — primary TikTok resolver (tikwm.com public API, no key needed) ────
// Returns no-watermark MP4 directly from TikTok CDN
async function resolveViaTikWM(url: string): Promise<VideoResolution | null> {
  try {
    const body = new URLSearchParams({ url, hd: "1" });
    const res = await fetch("https://www.tikwm.com/api/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/1.0)",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (data.code !== 0 || !data.data) return null;
    const d = data.data;
    // Prefer HD no-watermark, fall back to standard no-watermark
    const videoUrl = d.hdplay || d.play;
    if (!videoUrl) return null;
    return {
      url: videoUrl,
      filename: `${d.id || "tiktok"}.mp4`,
      thumbnail: d.cover || d.origin_cover,
      title: d.title,
      platform: "tiktok",
    };
  } catch (err: any) {
    console.warn("[tikwm] error:", err?.message);
    return null;
  }
}

// ── SnapTik — secondary TikTok resolver (snaptik.app scrape) ─────────────────
async function resolveViaSnapTik(url: string): Promise<VideoResolution | null> {
  try {
    // Step 1: get the token from the page
    const pageRes = await fetch("https://snaptik.app/en2", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000),
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const tokenMatch = html.match(/name="token"\s+value="([^"]+)"/);
    if (!tokenMatch) return null;
    const token = tokenMatch[1];

    // Step 2: submit the form
    const formBody = new URLSearchParams({ url, token });
    const submitRes = await fetch("https://snaptik.app/abc2.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://snaptik.app/en2",
      },
      body: formBody.toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!submitRes.ok) return null;
    const result = await submitRes.text();

    // Step 3: extract MP4 URL from response HTML
    const mp4Match = result.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i)
      || result.match(/data-url="(https?:\/\/[^"]+)"/i)
      || result.match(/"(https?:\/\/[^"]*tiktok[^"]*\.mp4[^"]*)"/i);
    if (!mp4Match) return null;
    return { url: mp4Match[1], platform: "tiktok" };
  } catch (err: any) {
    console.warn("[snaptik] error:", err?.message);
    return null;
  }
}

// ── SSStiK — tertiary TikTok resolver ────────────────────────────────────────
async function resolveViaSSStiK(url: string): Promise<VideoResolution | null> {
  try {
    const pageRes = await fetch("https://ssstik.io/en", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000),
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const tokenMatch = html.match(/name="tt"\s+value="([^"]+)"/);
    if (!tokenMatch) return null;
    const tt = tokenMatch[1];

    const formBody = new URLSearchParams({ id: url, locale: "en", tt });
    const submitRes = await fetch("https://ssstik.io/abc?url=dl", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://ssstik.io/en",
        "HX-Request": "true",
        "HX-Target": "target",
        "HX-Current-URL": "https://ssstik.io/en",
      },
      body: formBody.toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!submitRes.ok) return null;
    const result = await submitRes.text();

    // Extract no-watermark download link
    const noWmMatch = result.match(/href="(https?:\/\/[^"]+)"[^>]*>\s*(?:Without watermark|No watermark|Download)/i)
      || result.match(/class="[^"]*without[^"]*"[^>]*href="(https?:\/\/[^"]+)"/i)
      || result.match(/href="(https?:\/\/tikcdn[^"]+)"/i)
      || result.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i);
    if (!noWmMatch) return null;
    return { url: noWmMatch[1], platform: "tiktok" };
  } catch (err: any) {
    console.warn("[ssstik] error:", err?.message);
    return null;
  }
}

// ── Cobalt API — handles Instagram, Twitter/X, Dailymotion, Vimeo, Reddit, etc.
const COBALT_INSTANCES = [
  "https://api.cobalt.tools",
  "https://cobalt.api.timelessnesses.me",
  "https://cobalt.ggtyler.dev",
];

async function resolveViaCobalt(url: string): Promise<VideoResolution | null> {
  for (const instance of COBALT_INSTANCES) {
    try {
      const res = await fetch(`${instance}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          url,
          videoQuality: "720",
          downloadMode: "auto",
          filenameStyle: "basic",
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) continue;
      const data = await res.json() as any;
      if (data.status === "error") continue;
      const videoUrl = data.url || data.tunnel;
      if (!videoUrl) continue;

      return {
        url: videoUrl,
        filename: data.filename || "video.mp4",
        platform: detectPlatform(url),
      };
    } catch { continue; }
  }
  return null;
}

export async function resolveVideoUrl(sourceUrl: string): Promise<VideoResolution | null> {
  // Direct MP4 — no resolution needed
  if (/\.(mp4|mov|webm)(\?|$)/i.test(sourceUrl)) {
    return { url: sourceUrl, platform: "direct" };
  }

  // YouTube — ytdl first, then API fallback, then Cobalt
  if (isYouTube(sourceUrl)) {
    const yt = await resolveYouTube(sourceUrl);
    if (yt) return yt;
    console.warn("[video-dl] ytdl failed, trying YouTube API fallback...");
    const ytApi = await resolveYouTubeViaAPI(sourceUrl);
    if (ytApi) return ytApi;
    return resolveViaCobalt(sourceUrl);
  }

  // TikTok — TikWM → SnapTik → SSStiK → Cobalt
  if (isTikTok(sourceUrl)) {
    const tikwm = await resolveViaTikWM(sourceUrl);
    if (tikwm) return tikwm;
    console.warn("[video-dl] TikWM failed, trying SnapTik...");
    const snap = await resolveViaSnapTik(sourceUrl);
    if (snap) return snap;
    console.warn("[video-dl] SnapTik failed, trying SSStiK...");
    const sss = await resolveViaSSStiK(sourceUrl);
    if (sss) return sss;
    console.warn("[video-dl] SSStiK failed, trying Cobalt...");
    return resolveViaCobalt(sourceUrl);
  }

  // Instagram — igram.world → SaveIG → Cobalt
  if (/instagram\.com/i.test(sourceUrl)) {
    const igram = await resolveViaIgram(sourceUrl);
    if (igram) return igram;
    console.warn("[video-dl] igram failed, trying SaveIG...");
    const saveig = await resolveViaSaveIG(sourceUrl);
    if (saveig) return saveig;
    console.warn("[video-dl] SaveIG failed, trying Cobalt...");
    return resolveViaCobalt(sourceUrl);
  }

  // Twitter/X — twitsave → ssstwitter → Cobalt
  if (/twitter\.com|x\.com/i.test(sourceUrl)) {
    const twit = await resolveViaTwitterSave(sourceUrl);
    if (twit) return twit;
    console.warn("[video-dl] twitsave failed, trying ssstwitter...");
    const ssst = await resolveViaSSSTwitter(sourceUrl);
    if (ssst) return ssst;
    console.warn("[video-dl] ssstwitter failed, trying Cobalt...");
    return resolveViaCobalt(sourceUrl);
  }

  // Reddit, Dailymotion, Vimeo, etc. — Cobalt
  if (SUPPORTED.test(sourceUrl)) {
    return resolveViaCobalt(sourceUrl);
  }

  return null;
}
