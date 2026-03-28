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

// ── Cobalt API — handles TikTok, Instagram, Twitter/X, Dailymotion, Vimeo, Reddit, etc.
// Cobalt is open-source (github.com/imputnet/cobalt) — same tech as ssstik.io/igram.world
// Uses the public instance — for production, self-host your own instance
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

      // Cobalt returns { status: "stream"|"redirect"|"tunnel"|"picker", url, ... }
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

  // YouTube — use ytdl (more reliable for YT)
  if (isYouTube(sourceUrl)) {
    const yt = await resolveYouTube(sourceUrl);
    if (yt) return yt;
    // Fall through to Cobalt if ytdl fails
  }

  // TikTok, Instagram, Twitter/X, Dailymotion, Vimeo, Reddit, etc. — use Cobalt
  if (SUPPORTED.test(sourceUrl)) {
    return resolveViaCobalt(sourceUrl);
  }

  return null;
}
