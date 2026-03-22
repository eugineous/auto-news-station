export interface VideoResolution {
  url: string;
  filename?: string;
}

const COBALT_API = process.env.COBALT_API_URL || "https://api.cobalt.tools";
const SUPPORTED = /youtube\.com|youtu\.be|tiktok\.com|twitter\.com|x\.com|instagram\.com/;

export function isVideoSupported(url: string): boolean {
  return SUPPORTED.test(url);
}

export async function resolveVideoUrl(sourceUrl: string): Promise<VideoResolution | null> {
  if (!isVideoSupported(sourceUrl)) return null;

  try {
    const res = await fetch(`${COBALT_API}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        url: sourceUrl,
        videoQuality: "720",
        filenameStyle: "basic",
        tiktokFullAudio: true,
        tiktokH265: false,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.error(`[video-dl] Cobalt HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      status: string;
      url?: string;
      filename?: string;
      error?: { code?: string };
      picker?: { type?: string; url: string }[];
    };

    if (data.status === "error") {
      console.error(`[video-dl] Cobalt error: ${data.error?.code || "unknown"}`);
      return null;
    }

    if ((data.status === "redirect" || data.status === "tunnel") && data.url) {
      return { url: data.url, filename: data.filename };
    }

    if (data.status === "picker" && data.picker?.length) {
      const video = data.picker.find((p) => p.type === "video") || data.picker[0];
      return { url: video.url, filename: data.filename };
    }

    return null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[video-dl] Failed: ${msg}`);
    return null;
  }
}
