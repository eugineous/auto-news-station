/**
 * /api/clipper/[action]
 * analyze  — Gemini watches the video (YouTube URL natively supported) and returns
 *            transcript segments with timestamps + virality scores
 * post     — Takes a staged R2 URL and posts it as an IG Reel + FB video
 */
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const GRAPH_API = "https://graph.facebook.com/v19.0";
const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";

// ── POST /api/clipper/analyze ─────────────────────────────────────────────────
async function handleAnalyze(req: NextRequest) {
  const { url } = await req.json() as { url: string };
  if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });

  const geminiKey = process.env.GEMINI_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!geminiKey && !nvidiaKey) return NextResponse.json({ error: "No AI API key configured (GEMINI_API_KEY or NVIDIA_API_KEY)" }, { status: 500 });

  // Detect if it's a YouTube URL — Gemini supports these natively (no upload needed)
  const isYouTube = /youtube\.com|youtu\.be/.test(url);
  const isTikTok = /tiktok\.com/.test(url);
  const isDirectMp4 = /\.mp4(\?|$)/i.test(url);

  // Build the content parts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let videoPart: any;

  if (isYouTube) {
    // Gemini 2.5 Flash supports YouTube URLs directly
    videoPart = { text: `Video URL (YouTube): ${url}` };
  } else if (isDirectMp4 || isTikTok) {
    // For direct MP4s and TikTok, pass the URL as a file_data part
    // Gemini can fetch publicly accessible video URLs
    videoPart = {
      fileData: {
        mimeType: "video/mp4",
        fileUri: url,
      },
    };
  } else {
    // Generic — try as YouTube-style URL reference
    videoPart = { text: `Video URL: ${url}` };
  }

  const analysisPrompt = `You are an expert viral content editor for PPP TV Kenya — a Kenyan entertainment & sports media brand.

Analyze this video and identify the 4-6 best moments to clip as short-form content (Instagram Reels / TikTok / YouTube Shorts).

For each clip identify:
- startSec: exact start time in seconds (integer)
- endSec: exact end time in seconds (integer, keep clips 15-90 seconds)
- hook: punchy opening line / caption (max 12 words, present tense, no clickbait)
- reason: why this moment is viral (1 sentence — hook type, emotion, value)
- viralScore: 0-100 based on: strong hook (30pts), emotional peak (25pts), complete thought (25pts), shareability (20pts)
- clipType: one of "highlight" | "quote" | "reaction" | "reveal" | "tutorial" | "funny"
- suggestedCaption: 2-3 sentence IG caption for this specific clip

Also provide:
- title: the video's main topic/title
- totalDuration: estimated total video duration in seconds
- bestClipIndex: index (0-based) of the single best clip to post first

CRITICAL: Clips must contain complete thoughts — never cut mid-sentence. Start 1-2 seconds before the key moment. End 1-2 seconds after it resolves.

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "title": "string",
  "totalDuration": 300,
  "bestClipIndex": 0,
  "clips": [
    {
      "startSec": 45,
      "endSec": 105,
      "hook": "He said what nobody else would say",
      "reason": "Unexpected reveal creates strong emotional reaction",
      "viralScore": 88,
      "clipType": "reveal",
      "suggestedCaption": "string"
    }
  ]
}`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let contents: any;

    if (isYouTube) {
      contents = `${analysisPrompt}\n\nYouTube URL to analyze: ${url}`;
    } else {
      contents = [
        { role: "user", parts: [videoPart, { text: analysisPrompt }] },
      ];
    }

    let text = "";

    if (geminiKey) {
      const { GoogleGenAI } = await import("@google/genai");
      const genAI = new GoogleGenAI({ apiKey: geminiKey });
      const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: { temperature: 0.3, maxOutputTokens: 2000 },
      });
      text = (result.text ?? "").trim();
    } else if (nvidiaKey) {
      // NVIDIA fallback — text-only analysis (no native video understanding, uses URL as context)
      const nvidiaPrompt = typeof contents === "string" ? contents : `${analysisPrompt}\n\nVideo URL: ${url}`;
      const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${nvidiaKey}` },
        body: JSON.stringify({
          model: "meta/llama-3.1-8b-instruct",
          messages: [{ role: "user", content: nvidiaPrompt }],
          temperature: 0.3, max_tokens: 2000,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const nd = await res.json() as { choices?: Array<{ message: { content: string } }> };
      text = nd.choices?.[0]?.message?.content?.trim() ?? "";
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Gemini returned no JSON. Response: " + text.slice(0, 200));

    const parsed = JSON.parse(jsonMatch[0]) as {
      title: string;
      totalDuration: number;
      bestClipIndex: number;
      clips: Array<{
        startSec: number; endSec: number; hook: string;
        reason: string; viralScore: number; clipType: string; suggestedCaption: string;
      }>;
    };

    return NextResponse.json({
      title: parsed.title || "Video",
      totalDuration: parsed.totalDuration || 0,
      bestClipIndex: parsed.bestClipIndex ?? 0,
      clips: (parsed.clips || []).slice(0, 6),
      sourceUrl: url,
      isYouTube,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Analysis failed: " + msg }, { status: 500 });
  }
}

// ── POST /api/clipper/post ────────────────────────────────────────────────────
// Receives a staged R2 URL (video already trimmed client-side) and posts to IG + FB
async function handlePost(req: NextRequest) {
  const { stagedUrl, caption, title } = await req.json() as {
    stagedUrl: string;
    caption: string;
    title: string;
  };

  if (!stagedUrl) return NextResponse.json({ error: "stagedUrl required" }, { status: 400 });

  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const fbPageId = process.env.FACEBOOK_PAGE_ID;
  const fbToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!igToken || !igAccountId) {
    return NextResponse.json({ error: "IG credentials not configured" }, { status: 500 });
  }

  const postCaption = caption || title || "Follow @ppptvke for daily entertainment & sports 🔥";
  const igResult = { success: false, postId: "", error: "" };
  const fbResult = { success: false, postId: "", error: "" };

  // Post to Instagram as Reel
  try {
    const containerRes = await fetch(`${GRAPH_API}/${igAccountId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: stagedUrl,
        caption: postCaption,
        access_token: igToken,
      }),
    });
    const container = await containerRes.json() as { id?: string; error?: { message: string } };
    if (!containerRes.ok || container.error) throw new Error(container.error?.message || "Container creation failed");

    // Poll for processing (IG needs time to process the video)
    let ready = false;
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const statusRes = await fetch(
        `${GRAPH_API}/${container.id}?fields=status_code&access_token=${igToken}`
      );
      const status = await statusRes.json() as { status_code?: string };
      if (status.status_code === "FINISHED") { ready = true; break; }
      if (status.status_code === "ERROR") throw new Error("IG video processing failed");
    }
    if (!ready) throw new Error("IG video processing timed out after 60s");

    const publishRes = await fetch(`${GRAPH_API}/${igAccountId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: container.id, access_token: igToken }),
    });
    const published = await publishRes.json() as { id?: string; error?: { message: string } };
    if (!publishRes.ok || published.error) throw new Error(published.error?.message || "Publish failed");
    igResult.success = true;
    igResult.postId = published.id || "";
  } catch (e: unknown) {
    igResult.error = e instanceof Error ? e.message : String(e);
  }

  // Post to Facebook
  if (fbPageId && fbToken) {
    try {
      const fbRes = await fetch(`${GRAPH_API}/${fbPageId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: stagedUrl,
          description: postCaption,
          access_token: fbToken,
        }),
      });
      const fb = await fbRes.json() as { id?: string; error?: { message: string } };
      if (!fbRes.ok || fb.error) throw new Error(fb.error?.message || "FB post failed");
      fbResult.success = true;
      fbResult.postId = fb.id || "";
    } catch (e: unknown) {
      fbResult.error = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({ instagram: igResult, facebook: fbResult });
}

// ── POST /api/clipper/stage ───────────────────────────────────────────────────
// Receives base64 video from client (trimmed by ffmpeg.wasm), stages to R2
async function handleStage(req: NextRequest) {
  const { base64, filename } = await req.json() as { base64: string; filename?: string };
  if (!base64) return NextResponse.json({ error: "base64 required" }, { status: 400 });

  const res = await fetch(WORKER_URL + "/stage-video-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
    body: JSON.stringify({ base64, contentType: "video/mp4" }),
    signal: AbortSignal.timeout(30000),
  }).catch((e: unknown) => { throw new Error("Worker unreachable: " + (e instanceof Error ? e.message : String(e))); });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    return NextResponse.json({ error: "Stage failed: " + err }, { status: 500 });
  }

  const data = await res.json() as { url?: string; key?: string };
  return NextResponse.json({ url: data.url, key: data.key, filename });
}

// ── Router ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action === "analyze") return handleAnalyze(req);
  if (action === "post")    return handlePost(req);
  if (action === "stage")   return handleStage(req);
  return NextResponse.json({ error: "Unknown action: " + action }, { status: 404 });
}
