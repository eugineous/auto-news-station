import ytdl from "@distube/ytdl-core";

export interface VideoResolution {
  url: string;
  filename?: string;
}

const SUPPORTED = /youtube\.com|youtu\.be|tiktok\.com|twitter\.com|x\.com|instagram\.com/;

export function isVideoSupported(url: string): boolean {
  return SUPPORTED.test(url) || /\.(mp4|mov|webm)(\?|$)/i.test(url);
}

function isYouTube(url: string): boolean {
  return /youtube\.com\/watch|youtu\.be\//.test(url);
}

async function resolveYouTube(url: string): Promise<VideoResolution | null> {
  try {
    const info = await ytdl.getInfo(url);
    // Prefer mp4 720p, then best mp4, then any video format
    const formats = ytdl.filterFormats(info.formats, "videoandaudio");
    const mp4 = formats
      .filter((f) => f.container === "mp4")
      .sort((a, b) => (parseInt(b.qualityLabel || "0") - parseInt(a.qualityLabel || "0")));
    const chosen = mp4[0] || formats[0];
    if (!chosen?.url) return null;
    return { url: chosen.url, filename: `${info.videoDetails.videoId}.mp4` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[video-dl] ytdl error: ${msg}`);
    return null;
  }
}

export async function resolveVideoUrl(sourceUrl: string): Promise<VideoResolution | null> {
  // Direct video file — pass through
  if (/\.(mp4|mov|webm)(\?|$)/i.test(sourceUrl)) {
    return { url: sourceUrl };
  }

  if (isYouTube(sourceUrl)) {
    return resolveYouTube(sourceUrl);
  }

  // For TikTok, Twitter/X, Instagram — return null and let the caller
  // pass the original URL directly to the Graph API (FB/IG can fetch from source)
  return null;
}
