/**
 * /api/proxy-video
 * Streams a remote video through the server so the browser can play it
 * without CORS issues. Used by the composer preview player.
 */
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  // Only allow video CDN domains
  let parsed: URL;
  try { parsed = new URL(url); } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  const allowed = [
    "video.twimg.com", "pbs.twimg.com",
    "v19-webapp.tiktok.com", "v19.tiktokcdn.com", "v16-webapp.tiktok.com",
    "tikcdn.io", "tikwm.com",
    "rr1---sn", // YouTube CDN pattern
    "googlevideo.com",
    "cdninstagram.com", "instagram.com",
    "dailymotion.com", "cdn.dailymotion.com",
    "vimeo.com", "vimeocdn.com",
    "reddit.com", "redd.it", "v.redd.it",
    "r2.dev", // your own R2 bucket
  ];

  const isAllowed = allowed.some(d => parsed.hostname.includes(d));
  if (!isAllowed) {
    return NextResponse.json({ error: "domain not allowed" }, { status: 403 });
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": parsed.hostname.includes("tiktok") ? "https://www.tiktok.com/" :
                   parsed.hostname.includes("twimg") ? "https://twitter.com/" : url,
        "Accept": "video/mp4,video/*,*/*",
        // Forward range header for seeking support
        ...(req.headers.get("range") ? { "Range": req.headers.get("range")! } : {}),
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") || "video/mp4";
    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    };
    if (contentLength) headers["Content-Length"] = contentLength;
    if (contentRange) headers["Content-Range"] = contentRange;

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
