import { NextRequest, NextResponse } from "next/server";
import { resolveVideoUrl } from "@/lib/video-downloader";

export const maxDuration = 60;

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";

// ── POST /api/clipper/analyze ─────────────────────────────────────────────────
async function handleAnalyze(req: NextRequest) {
  const { url } = await req.json() as { url: string };
  if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });

  // Resolve to direct video URL
  const resolved = await resolveVideoUrl(url).catch(() => null);
  if (!resolved) return NextResponse.json({ error: "Could not resolve video URL. Try a direct MP4 or TikTok link." }, { status: 422 });

  // Use Gemini to analyze the video and identify best moments
  const { GoogleGenAI } = await import("@google/genai");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });

  const genAI = new GoogleGenAI({ apiKey });

  const prompt = `You are a viral social media expert. Analyze this video URL and identify the 3-5 best moments to clip for Instagram Reels / TikTok.

Video URL: ${resolved}

For each clip, provide:
1. Start time (seconds from beginning)
2. End time (seconds — keep clips 15-60 seconds)
3. Why this moment is viral (hook, emotion, surprise, value)
4. A punchy hook caption (max 10 words)
5. Viral score 0-100

Also estimate the total video duration in seconds.

Respond ONLY with valid JSON in this exact format:
{
  "title": "video title or topic",
  "duration": 180,
  "clips": [
    {
      "startSec": 0,
      "endSec": 45,
      "reason": "Strong opening hook with surprising reveal",
      "hook": "You won't believe what happened next",
      "viralScore": 87
    }
  ]
}`;

  try {
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    const text = result.text?.trim() ?? "";
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]) as {
      title: string;
      duration: number;
      clips: Array<{ startSec: number; endSec: number; reason: string; hook: string; viralScore: number }>;
    };

    return NextResponse.json({
      title: parsed.title || "Video",
      duration: parsed.duration || 0,
      clips: (parsed.clips || []).slice(0, 5),
      videoUrl: resolved,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "AI analysis failed: " + e.message }, { status: 500 });
  }
}

// ── POST /api/clipper/post ────────────────────────────────────────────────────
async function handlePost(req: NextRequest) {
  const { videoUrl, startSec, endSec, title, caption } = await req.json() as {
    videoUrl: string;
    startSec: number;
    endSec: number;
    title: string;
    caption: string;
  };

  if (!videoUrl || startSec === undefined || endSec === undefined) {
    return NextResponse.json({ error: "videoUrl, startSec, endSec required" }, { status: 400 });
  }

  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const fbPageId = process.env.FACEBOOK_PAGE_ID;
  const fbToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!igToken || !igAccountId) {
    return NextResponse.json({ error: "IG credentials not configured" }, { status: 500 });
  }

  // Try byte-range trimming first (works for some CDNs)
  // For TikTok/YouTube CDN URLs, we stage the full video and let IG handle it
  // Stage the video to R2 via the worker
  const stageRes = await fetch(WORKER_URL + "/stage-video-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
    body: JSON.stringify({ videoUrl, startSec, endSec }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => null);

  let stagedUrl: string | null = null;
  if (stageRes?.ok) {
    const d = await stageRes.json() as any;
    stagedUrl = d?.url || null;
  }

  // Fallback: use the raw video URL directly (IG will fetch it)
  const videoSrc = stagedUrl || videoUrl;

  const GRAPH_API = "https://graph.facebook.com/v19.0";
  const igResult = { success: false, postId: "", error: "" };
  const fbResult = { success: false, postId: "", error: "" };

  // Post to Instagram as Reel
  try {
    const containerRes = await fetch(`${GRAPH_API}/${igAccountId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: videoSrc,
        caption: caption || title,
        access_token: igToken,
      }),
    });
    const container = await containerRes.json() as any;
    if (!containerRes.ok || container.error) throw new Error(container.error?.message || "Container failed");

    // Wait for processing
    await new Promise(r => setTimeout(r, 8000));

    const publishRes = await fetch(`${GRAPH_API}/${igAccountId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: container.id, access_token: igToken }),
    });
    const published = await publishRes.json() as any;
    if (!publishRes.ok || published.error) throw new Error(published.error?.message || "Publish failed");
    igResult.success = true;
    igResult.postId = published.id;
  } catch (e: any) {
    igResult.error = e.message;
  }

  // Post to Facebook
  if (fbPageId && fbToken) {
    try {
      const fbRes = await fetch(`${GRAPH_API}/${fbPageId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: videoSrc,
          description: caption || title,
          access_token: fbToken,
        }),
      });
      const fb = await fbRes.json() as any;
      if (!fbRes.ok || fb.error) throw new Error(fb.error?.message || "FB failed");
      fbResult.success = true;
      fbResult.postId = fb.id;
    } catch (e: any) {
      fbResult.error = e.message;
    }
  }

  return NextResponse.json({ instagram: igResult, facebook: fbResult });
}

// ── Router ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action === "analyze") return handleAnalyze(req);
  if (action === "post") return handlePost(req);
  return NextResponse.json({ error: "Unknown action" }, { status: 404 });
}
