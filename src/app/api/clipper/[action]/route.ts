/**
 * /api/clipper/[action]
 *
 * Real pipeline (Opus Clip-style):
 * 1. analyze  — fetch YouTube transcript (Innertube API, free, no auth)
 *               → NVIDIA scores each segment for virality
 *               → Gemini selects best clips with exact timestamps + captions
 * 2. stage    — receives base64 trimmed video from client, stores in R2
 * 3. post     — posts staged R2 URL to IG Reels + FB with status polling
 */
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const GRAPH_API = "https://graph.facebook.com/v19.0";
const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TranscriptSegment { text: string; start: number; end: number; }

// ── YouTube Transcript via Innertube API (free, no auth) ──────────────────────
async function fetchYouTubeTranscript(videoId: string): Promise<TranscriptSegment[]> {
  // Step 1: Get Innertube API key from video page
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  const html = await pageRes.text();

  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  if (!apiKeyMatch) throw new Error("Could not find Innertube API key");
  const apiKey = apiKeyMatch[1];

  // Step 2: Call player API as Android client
  const playerRes = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
      videoId,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const playerData = await playerRes.json() as {
    videoDetails?: { title?: string; lengthSeconds?: string };
    captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Array<{ languageCode: string; baseUrl: string }> } };
  };

  const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks?.length) throw new Error("No captions available for this video");

  // Prefer English, fall back to first available
  const track = tracks.find(t => t.languageCode === "en") || tracks[0];
  const baseUrl = track.baseUrl.replace(/&fmt=\w+$/, "");

  // Step 3: Fetch and parse caption XML
  const xmlRes = await fetch(baseUrl, { signal: AbortSignal.timeout(10000) });
  const xml = await xmlRes.text();

  // Parse XML manually (no xml2js dependency)
  const segments: TranscriptSegment[] = [];
  const regex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const dur = parseFloat(match[2]);
    const text = match[3]
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, "").trim();
    if (text) segments.push({ text, start, end: start + dur });
  }

  return segments;
}

// ── Score segments with NVIDIA (virality scoring) ─────────────────────────────
async function scoreSegmentsWithNvidia(
  segments: TranscriptSegment[],
  nvidiaKey: string
): Promise<Array<TranscriptSegment & { score: number }>> {
  // Group segments into ~30-second windows for scoring
  const windows: Array<{ segments: TranscriptSegment[]; startSec: number; endSec: number; text: string }> = [];
  let current: TranscriptSegment[] = [];
  let windowStart = segments[0]?.start ?? 0;

  for (const seg of segments) {
    current.push(seg);
    const windowDuration = seg.end - windowStart;
    if (windowDuration >= 25) {
      windows.push({
        segments: [...current],
        startSec: windowStart,
        endSec: seg.end,
        text: current.map(s => s.text).join(" "),
      });
      current = [];
      windowStart = seg.end;
    }
  }
  if (current.length > 0) {
    windows.push({
      segments: current,
      startSec: windowStart,
      endSec: current[current.length - 1].end,
      text: current.map(s => s.text).join(" "),
    });
  }

  if (!windows.length) return [];

  // Score all windows in one NVIDIA call
  const windowList = windows.map((w, i) =>
    `[${i}] ${fmtSec(w.startSec)}-${fmtSec(w.endSec)}: "${w.text.slice(0, 200)}"`
  ).join("\n");

  const prompt = `You are a viral content expert. Score each video segment 0-100 for short-form virality.

Scoring criteria:
- Hook strength (30pts): Does it open with a surprising fact, strong opinion, or emotional moment?
- Complete thought (25pts): Is it a self-contained idea that makes sense without context?
- Emotional peak (25pts): Does it contain humor, shock, inspiration, controversy, or relatability?
- Shareability (20pts): Would someone send this to a friend?

Segments:
${windowList}

Respond ONLY with JSON array of scores in order: [score0, score1, score2, ...]
No explanation, just the array.`;

  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${nvidiaKey}` },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1, max_tokens: 500,
      }),
      signal: AbortSignal.timeout(25000),
    });
    const data = await res.json() as { choices?: Array<{ message: { content: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    const arrMatch = text.match(/\[[\d,\s]+\]/);
    if (arrMatch) {
      const scores = JSON.parse(arrMatch[0]) as number[];
      return windows.map((w, i) => ({
        ...w.segments[0],
        start: w.startSec,
        end: w.endSec,
        text: w.text,
        score: scores[i] ?? 50,
      }));
    }
  } catch { /* fall through to default scores */ }

  // Fallback: return windows with default score
  return windows.map(w => ({ ...w.segments[0], start: w.startSec, end: w.endSec, text: w.text, score: 50 }));
}

// ── Select best clips with Gemini ─────────────────────────────────────────────
async function selectClipsWithGemini(
  transcript: TranscriptSegment[],
  topWindows: Array<TranscriptSegment & { score: number }>,
  geminiKey: string,
  videoTitle: string
): Promise<ClipResult> {
  const { GoogleGenAI } = await import("@google/genai");
  const genAI = new GoogleGenAI({ apiKey: geminiKey });

  const transcriptText = transcript.map(s => `[${fmtSec(s.start)}] ${s.text}`).join("\n");
  const topWindowsText = topWindows
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(w => `Score ${w.score}: ${fmtSec(w.start)}-${fmtSec(w.end)} — "${w.text.slice(0, 150)}"`)
    .join("\n");

  const prompt = `You are an expert viral content editor for PPP TV Kenya (Kenyan entertainment & sports media).

VIDEO TITLE: "${videoTitle}"

TOP SCORING SEGMENTS (pre-scored by virality AI):
${topWindowsText}

FULL TRANSCRIPT WITH TIMESTAMPS:
${transcriptText.slice(0, 8000)}

Select the 4-6 BEST clips for Instagram Reels / TikTok / YouTube Shorts.

RULES:
- Each clip must be 15-90 seconds long
- NEVER cut mid-sentence — use exact sentence boundaries from the transcript
- Start 1-2 seconds BEFORE the hook word
- End 1-2 seconds AFTER the last word of the complete thought
- Prioritize the top-scored segments but adjust boundaries for clean cuts
- No two clips should overlap

For each clip provide:
- startSec: integer seconds
- endSec: integer seconds  
- hook: punchy 1-line caption (max 12 words, present tense)
- reason: why this is viral (1 sentence)
- viralScore: 0-100
- clipType: "highlight" | "quote" | "reaction" | "reveal" | "tutorial" | "funny"
- suggestedCaption: 2-3 sentence IG caption with emoji, ends with "Follow @ppptvke 🔥"

Respond ONLY with valid JSON:
{
  "clips": [
    {
      "startSec": 45,
      "endSec": 105,
      "hook": "string",
      "reason": "string",
      "viralScore": 88,
      "clipType": "reveal",
      "suggestedCaption": "string"
    }
  ],
  "bestClipIndex": 0
}`;

  const result = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { temperature: 0.2, maxOutputTokens: 8000 },
  });

  const text = (result.text ?? "").trim();
  const jsonStr = extractJSON(text);
  if (!jsonStr) throw new Error("Gemini returned no JSON. Raw: " + text.slice(0, 300));
  return JSON.parse(jsonStr);
}

// ── NVIDIA-only fallback (no Gemini) ──────────────────────────────────────────
async function selectClipsWithNvidia(
  topWindows: Array<TranscriptSegment & { score: number }>,
  nvidiaKey: string,
  videoTitle: string
): Promise<ClipResult> {
  const top = topWindows.sort((a, b) => b.score - a.score).slice(0, 6);

  const prompt = `You are a viral content editor. Select the best clips from these pre-scored segments.

VIDEO: "${videoTitle}"

SEGMENTS (sorted by virality score):
${top.map((w, i) => `[${i}] Score ${w.score}: ${fmtSec(w.start)}-${fmtSec(w.end)} — "${w.text.slice(0, 200)}"`).join("\n")}

For each segment, output a clip. Adjust start/end to clean sentence boundaries (±3 seconds).
Keep clips 15-90 seconds. No overlaps.

Respond ONLY with valid JSON:
{
  "clips": [
    {
      "startSec": 45,
      "endSec": 105,
      "hook": "string (max 12 words)",
      "reason": "string (1 sentence)",
      "viralScore": 88,
      "clipType": "highlight",
      "suggestedCaption": "string (2-3 sentences + Follow @ppptvke 🔥)"
    }
  ],
  "bestClipIndex": 0
}`;

  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${nvidiaKey}` },
    body: JSON.stringify({
      model: "meta/llama-3.1-8b-instruct",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2, max_tokens: 2000,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json() as { choices?: Array<{ message: { content: string } }> };
  const nvidiaText = data.choices?.[0]?.message?.content?.trim() ?? "";
  const nvidiaJson = extractJSON(nvidiaText);
  if (!nvidiaJson) throw new Error("NVIDIA returned no JSON");
  return JSON.parse(nvidiaJson);
}

// ── Gemini-only fallback (no transcript, for non-YouTube) ─────────────────────
async function analyzeWithGeminiDirect(url: string, geminiKey: string): Promise<ClipResult> {
  const { GoogleGenAI } = await import("@google/genai");
  const genAI = new GoogleGenAI({ apiKey: geminiKey });

  const isYouTube = /youtube\.com|youtu\.be/.test(url);
  const prompt = `You are an expert viral content editor for PPP TV Kenya.

Analyze this video and identify the 4-6 best moments to clip for Instagram Reels / TikTok.

${isYouTube ? `YouTube URL: ${url}` : `Video URL: ${url}`}

For each clip:
- startSec: exact start in seconds (integer)
- endSec: exact end in seconds (integer, 15-90s clips)
- hook: punchy caption max 12 words
- reason: why viral (1 sentence)
- viralScore: 0-100
- clipType: "highlight"|"quote"|"reaction"|"reveal"|"tutorial"|"funny"
- suggestedCaption: 2-3 sentence IG caption + "Follow @ppptvke 🔥"

CRITICAL: Never cut mid-sentence. Start before the hook, end after the complete thought.

Respond ONLY with valid JSON:
{"clips":[...],"bestClipIndex":0}`;

  const result = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    contents: isYouTube ? prompt : [{ role: "user", parts: [{ fileData: { mimeType: "video/mp4", fileUri: url } }, { text: prompt }] }],
    config: { temperature: 0.2, maxOutputTokens: 8000 },
  });

  const rawText = (result.text ?? "").trim();
  const jsonStr2 = extractJSON(rawText);
  if (!jsonStr2) throw new Error("Gemini returned no JSON. Raw: " + rawText.slice(0, 300));
  return JSON.parse(jsonStr2);
}

// Strip thinking tags and markdown code fences, then extract JSON
function extractJSON(raw: string): string | null {
  // Remove thinking blocks
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  // Remove ALL markdown code fences anywhere in the string
  text = text.replace(/```(?:json)?/gi, "").trim();
  // Find the outermost JSON object - use a greedy match from first { to last }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function fmtSec(s: number) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`; }
function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

interface ClipResult {
  clips: Array<{
    startSec: number; endSec: number; hook: string;
    reason: string; viralScore: number; clipType: string; suggestedCaption: string;
  }>;
  bestClipIndex: number;
}

// ── POST /api/clipper/analyze ─────────────────────────────────────────────────
async function handleAnalyze(req: NextRequest) {
  const { url } = await req.json() as { url: string };
  if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });

  const geminiKey = process.env.GEMINI_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!geminiKey && !nvidiaKey) {
    return NextResponse.json({ error: "No AI key configured" }, { status: 500 });
  }

  const videoId = extractYouTubeId(url);
  const isYouTube = !!videoId;

  try {
    let clipsResult: ClipResult;
    let totalDuration = 0;
    let videoTitle = "Video";

    if (isYouTube) {
      // Full pipeline: transcript → NVIDIA scoring → Gemini/NVIDIA selection
      let transcript: TranscriptSegment[] = [];
      try {
        transcript = await fetchYouTubeTranscript(videoId);
      } catch (e: unknown) {
        console.warn("[clipper] transcript fetch failed:", (e as Error).message);
      }

      if (transcript.length > 0) {
        totalDuration = transcript[transcript.length - 1].end;

        // Score segments with NVIDIA
        let topWindows: Array<TranscriptSegment & { score: number }> = [];
        if (nvidiaKey) {
          topWindows = await scoreSegmentsWithNvidia(transcript, nvidiaKey);
        } else {
          // No NVIDIA — create windows with default scores
          let i = 0;
          while (i < transcript.length) {
            const windowSegs: TranscriptSegment[] = [];
            const windowStart = transcript[i].start;
            while (i < transcript.length && transcript[i].end - windowStart < 30) {
              windowSegs.push(transcript[i++]);
            }
            if (windowSegs.length) {
              topWindows.push({ ...windowSegs[0], start: windowStart, end: windowSegs[windowSegs.length - 1].end, text: windowSegs.map(s => s.text).join(" "), score: 50 });
            }
          }
        }

        // Select clips
        if (geminiKey) {
          clipsResult = await selectClipsWithGemini(transcript, topWindows, geminiKey, videoTitle) as unknown as ClipResult;
        } else if (nvidiaKey) {
          clipsResult = await selectClipsWithNvidia(topWindows, nvidiaKey, videoTitle);
        } else {
          throw new Error("No AI key available");
        }
      } else {
        // No transcript — fall back to direct Gemini analysis
        if (geminiKey) {
          clipsResult = await analyzeWithGeminiDirect(url, geminiKey);
        } else {
          throw new Error("No transcript available and no Gemini key for fallback");
        }
      }
    } else {
      // Non-YouTube: use Gemini direct video analysis
      if (geminiKey) {
        clipsResult = await analyzeWithGeminiDirect(url, geminiKey);
      } else {
        return NextResponse.json({ error: "Non-YouTube videos require GEMINI_API_KEY" }, { status: 400 });
      }
    }

    const result = clipsResult as unknown as { clips: ClipResult["clips"]; bestClipIndex: number; title?: string; totalDuration?: number };

    return NextResponse.json({
      title: result.title || videoTitle,
      totalDuration: result.totalDuration || totalDuration,
      bestClipIndex: result.bestClipIndex ?? 0,
      clips: (result.clips || []).slice(0, 6),
      sourceUrl: url,
      isYouTube,
      videoId: videoId || null,
      pipeline: isYouTube ? "transcript+ai" : "gemini-direct",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Analysis failed: " + msg }, { status: 500 });
  }
}

// ── POST /api/clipper/stage ───────────────────────────────────────────────────
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

// ── POST /api/clipper/post ────────────────────────────────────────────────────
async function handlePost(req: NextRequest) {
  const { stagedUrl, caption, title } = await req.json() as { stagedUrl: string; caption: string; title: string };
  if (!stagedUrl) return NextResponse.json({ error: "stagedUrl required" }, { status: 400 });

  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const fbPageId = process.env.FACEBOOK_PAGE_ID;
  const fbToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!igToken || !igAccountId) return NextResponse.json({ error: "IG credentials not configured" }, { status: 500 });

  const postCaption = caption || title || "Follow @ppptvke for daily entertainment & sports 🔥";
  const igResult = { success: false, postId: "", error: "" };
  const fbResult = { success: false, postId: "", error: "" };

  // Instagram Reel
  try {
    const containerRes = await fetch(`${GRAPH_API}/${igAccountId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_type: "REELS", video_url: stagedUrl, caption: postCaption, access_token: igToken }),
    });
    const container = await containerRes.json() as { id?: string; error?: { message: string } };
    if (!containerRes.ok || container.error) throw new Error(container.error?.message || "Container failed");

    // Poll for processing (up to 60s)
    let ready = false;
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const statusRes = await fetch(`${GRAPH_API}/${container.id}?fields=status_code&access_token=${igToken}`);
      const status = await statusRes.json() as { status_code?: string };
      if (status.status_code === "FINISHED") { ready = true; break; }
      if (status.status_code === "ERROR") throw new Error("IG video processing failed");
    }
    if (!ready) throw new Error("IG processing timed out");

    const publishRes = await fetch(`${GRAPH_API}/${igAccountId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: container.id, access_token: igToken }),
    });
    const published = await publishRes.json() as { id?: string; error?: { message: string } };
    if (!publishRes.ok || published.error) throw new Error(published.error?.message || "Publish failed");
    igResult.success = true;
    igResult.postId = published.id || "";
  } catch (e: unknown) { igResult.error = e instanceof Error ? e.message : String(e); }

  // Facebook
  if (fbPageId && fbToken) {
    try {
      const fbRes = await fetch(`${GRAPH_API}/${fbPageId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_url: stagedUrl, description: postCaption, access_token: fbToken }),
      });
      const fb = await fbRes.json() as { id?: string; error?: { message: string } };
      if (!fbRes.ok || fb.error) throw new Error(fb.error?.message || "FB failed");
      fbResult.success = true;
      fbResult.postId = fb.id || "";
    } catch (e: unknown) { fbResult.error = e instanceof Error ? e.message : String(e); }
  }

  return NextResponse.json({ instagram: igResult, facebook: fbResult });
}

// ── Router ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action === "analyze") return handleAnalyze(req);
  if (action === "stage")   return handleStage(req);
  if (action === "post")    return handlePost(req);
  return NextResponse.json({ error: "Unknown action: " + action }, { status: 404 });
}

