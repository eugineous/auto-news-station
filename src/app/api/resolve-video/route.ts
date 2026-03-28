/**
 * /api/resolve-video
 * Universal video resolver — accepts any social media URL (TikTok, Instagram,
 * Twitter/X, YouTube, Reddit, Dailymotion, Vimeo, etc.) and returns a direct
 * downloadable MP4 URL using Cobalt (open-source, same tech as ssstik.io/igram.world).
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveVideoUrl, isVideoSupported } from "@/lib/video-downloader";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { url } = body;
  if (!url?.trim()) return NextResponse.json({ error: "url is required" }, { status: 400 });

  if (!isVideoSupported(url)) {
    return NextResponse.json({ error: "URL not supported. Paste a TikTok, Instagram, Twitter/X, YouTube, Reddit, or direct .mp4 URL." }, { status: 400 });
  }

  const resolved = await resolveVideoUrl(url);
  if (!resolved) {
    return NextResponse.json({ error: "Could not extract video from this URL. The video may be private or the platform may be blocking access." }, { status: 422 });
  }

  return NextResponse.json({
    success: true,
    videoUrl: resolved.url,
    filename: resolved.filename,
    thumbnail: resolved.thumbnail,
    title: resolved.title,
    platform: resolved.platform,
  });
}
