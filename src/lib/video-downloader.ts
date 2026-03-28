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

  // YouTube — use ytdl (most reliable for YT)
  if (isYouTube(sourceUrl)) {
    const yt = await resolveYouTube(sourceUrl);
    if (yt) return yt;
    // Fall through to Cobalt if ytdl fails
    return resolveViaCobalt(sourceUrl);
  }

  // TikTok — try TikWM first (most reliable), then SnapTik, then SSStiK, then Cobalt
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

  // Instagram, Twitter/X, Reddit, Dailymotion, Vimeo, etc. — use Cobalt
  if (SUPPORTED.test(sourceUrl)) {
    return resolveViaCobalt(sourceUrl);
  }

  return null;
}
