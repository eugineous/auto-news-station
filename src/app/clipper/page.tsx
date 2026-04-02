"use client";
import { useState, useRef, useCallback } from "react";
import Shell from "@/app/shell";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Clip {
  startSec: number; endSec: number; hook: string;
  reason: string; viralScore: number; clipType: string; suggestedCaption: string;
}
interface AnalysisResult {
  title: string; totalDuration: number; bestClipIndex: number;
  clips: Clip[]; sourceUrl: string; isYouTube: boolean;
}
type ClipState = "idle" | "trimming" | "uploading" | "posting" | "done" | "error";
interface ClipStatus { state: ClipState; progress: number; stagedUrl?: string; igPostId?: string; fbPostId?: string; error?: string; }

// ── Theme ─────────────────────────────────────────────────────────────────────
const C = { bg: "#050505", card: "#0f0f0f", border: "#1a1a1a", green: "#22c55e", red: "#ef4444", cyan: "#06b6d4", purple: "#a855f7", yellow: "#f59e0b", blue: "#3b82f6" };

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(s: number) { const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`; }
function scoreColor(n: number) { return n >= 80 ? C.green : n >= 60 ? C.cyan : n >= 40 ? C.yellow : C.red; }
const CLIP_ICONS: Record<string, string> = { highlight: "⚡", quote: "💬", reaction: "😮", reveal: "🎯", tutorial: "📚", funny: "😂" };

function Spinner({ size = 16 }: { size?: number }) {
  return <span style={{ display: "inline-block", width: size, height: size, border: `2px solid #333`, borderTopColor: C.green, borderRadius: "50%", animation: "spin .7s linear infinite" }} />;
}

function ScoreBar({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 3, background: "#1a1a1a", borderRadius: 2 }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 2, transition: "width .5s" }} />
      </div>
      <span style={{ fontSize: 10, color, fontWeight: 700, minWidth: 28 }}>{score}</span>
    </div>
  );
}

// ── Client-side ffmpeg trim ───────────────────────────────────────────────────
// Loads ffmpeg.wasm from CDN at runtime — not bundled, runs entirely in browser
async function trimVideoClientSide(
  sourceUrl: string,
  startSec: number,
  endSec: number,
  onProgress: (pct: number) => void
): Promise<Blob | null> {
  try {
    // Load ffmpeg.wasm from CDN via script tags (avoids npm bundling)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;

    if (!w.__ffmpegLoaded) {
      await new Promise<void>((resolve, reject) => {
        const s1 = document.createElement("script");
        s1.src = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js";
        s1.onload = () => {
          const s2 = document.createElement("script");
          s2.src = "https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js";
          s2.onload = () => { w.__ffmpegLoaded = true; resolve(); };
          s2.onerror = reject;
          document.head.appendChild(s2);
        };
        s1.onerror = reject;
        document.head.appendChild(s1);
      });
    }

    const { FFmpeg } = w.FFmpegWASM || w.FFmpeg || {};
    const { fetchFile, toBlobURL } = w.FFmpegUtil || {};
    if (!FFmpeg || !fetchFile || !toBlobURL) throw new Error("ffmpeg.wasm not available");

    const ffmpeg = new FFmpeg();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ffmpeg.on("progress", ({ progress }: any) => onProgress(Math.round(10 + progress * 70)));

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    onProgress(15);
    const videoData = await fetchFile(sourceUrl);
    await ffmpeg.writeFile("input.mp4", videoData);
    onProgress(35);

    await ffmpeg.exec([
      "-ss", String(startSec), "-i", "input.mp4",
      "-t", String(endSec - startSec),
      "-c", "copy", "-avoid_negative_ts", "make_zero",
      "output.mp4",
    ]);
    onProgress(85);

    const data = await ffmpeg.readFile("output.mp4") as Uint8Array;
    return new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" });
  } catch (err) {
    console.error("[ffmpeg.wasm] trim failed:", err);
    return null;
  }
}

// Fallback: byte-range fetch (works for some CDN-hosted MP4s)
async function trimViaByteRange(
  sourceUrl: string,
  startSec: number,
  endSec: number,
  totalDuration: number
): Promise<Blob | null> {
  try {
    // Estimate byte range from duration ratio (rough but works for CBR videos)
    const headRes = await fetch(sourceUrl, { method: "HEAD" });
    const contentLength = parseInt(headRes.headers.get("content-length") || "0");
    if (!contentLength) return null;

    const startByte = Math.floor((startSec / totalDuration) * contentLength);
    const endByte = Math.floor((endSec / totalDuration) * contentLength);

    const res = await fetch(sourceUrl, {
      headers: { Range: `bytes=${startByte}-${endByte}` },
    });
    if (!res.ok && res.status !== 206) return null;
    return await res.blob();
  } catch { return null; }
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ClipperPage() {
  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [clipStates, setClipStates] = useState<Record<number, ClipStatus>>({});
  const [editingCaption, setEditingCaption] = useState<Record<number, string>>({});
  const abortRef = useRef<AbortController | null>(null);

  const setClipState = useCallback((idx: number, patch: Partial<ClipStatus>) => {
    setClipStates(prev => ({ ...prev, [idx]: { ...({ state: "idle", progress: 0 } as ClipStatus), ...prev[idx], ...patch } }));
  }, []);

  async function analyze() {
    if (!url.trim()) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setAnalyzing(true); setError(""); setResult(null); setClipStates({});
    try {
      const r = await fetch("/api/clipper/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
        signal: abortRef.current.signal,
      });
      const d = await r.json() as AnalysisResult & { error?: string };
      if (!r.ok || d.error) throw new Error(d.error || "Analysis failed");
      setResult(d);
      // Pre-fill captions
      const caps: Record<number, string> = {};
      d.clips.forEach((c, i) => { caps[i] = c.suggestedCaption; });
      setEditingCaption(caps);
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message || "Analysis failed");
    } finally { setAnalyzing(false); }
  }

  async function processAndPost(clip: Clip, idx: number) {
    if (!result) return;
    setClipState(idx, { state: "trimming", progress: 5 });

    let videoBlob: Blob | null = null;

    // Step 1: Try ffmpeg.wasm client-side trim
    try {
      videoBlob = await trimVideoClientSide(
        result.sourceUrl,
        clip.startSec,
        clip.endSec,
        (pct) => setClipState(idx, { state: "trimming", progress: pct })
      );
    } catch { /* fall through */ }

    // Step 2: Fallback — byte-range trim
    if (!videoBlob && result.totalDuration > 0) {
      setClipState(idx, { state: "trimming", progress: 50 });
      videoBlob = await trimViaByteRange(result.sourceUrl, clip.startSec, clip.endSec, result.totalDuration);
    }

    // Step 3: Fallback — use full video URL (IG will fetch it, no trim)
    let stagedUrl: string | null = null;
    if (videoBlob) {
      setClipState(idx, { state: "uploading", progress: 88 });
      // Convert blob to base64 and stage to R2
      const arrayBuf = await videoBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const stageRes = await fetch("/api/clipper/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, filename: `clip-${idx}-${Date.now()}.mp4` }),
      });
      if (stageRes.ok) {
        const sd = await stageRes.json() as { url?: string };
        stagedUrl = sd.url || null;
      }
    }

    // If staging failed, use the raw source URL (IG fetches it directly)
    if (!stagedUrl) stagedUrl = result.sourceUrl;

    setClipState(idx, { state: "posting", progress: 95 });

    const caption = editingCaption[idx] || clip.suggestedCaption;
    const postRes = await fetch("/api/clipper/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stagedUrl, caption, title: clip.hook }),
    });
    const pd = await postRes.json() as { instagram?: { success: boolean; postId: string; error: string }; facebook?: { success: boolean; postId: string; error: string }; error?: string };

    if (pd.error) {
      setClipState(idx, { state: "error", progress: 0, error: pd.error });
      return;
    }

    setClipState(idx, {
      state: "done", progress: 100,
      stagedUrl: stagedUrl || undefined,
      igPostId: pd.instagram?.postId,
      fbPostId: pd.facebook?.postId,
      error: pd.instagram?.error || pd.facebook?.error || undefined,
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Shell>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ padding: "24px 20px", maxWidth: 860, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 30, letterSpacing: 3, color: "#fff" }}>✂️ CLIPPER</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>Paste a YouTube, TikTok, or MP4 URL → AI finds viral moments → Trim & post as Reels</div>
        </div>

        {/* URL Input */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && analyze()}
              placeholder="https://youtube.com/watch?v=... or TikTok, direct MP4..."
              style={{ flex: 1, background: "#0a0a0a", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13, outline: "none" }}
            />
            <button onClick={analyze} disabled={analyzing || !url.trim()} style={{ background: analyzing ? "#1a1a1a" : `linear-gradient(135deg,${C.green},#16a34a)`, border: "none", borderRadius: 8, padding: "10px 22px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: analyzing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              {analyzing ? <><Spinner size={14} /> Analyzing...</> : "🔍 Analyze"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#444", marginTop: 8 }}>Supports: YouTube (native), TikTok, Twitter/X, direct MP4 · Trimming runs in your browser via ffmpeg.wasm</div>
        </div>

        {/* Error */}
        {error && <div style={{ background: "#1a0a0a", border: `1px solid ${C.red}44`, borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: C.red, fontSize: 12 }}>⚠️ {error}</div>}

        {/* Results */}
        {result && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            {/* Video meta */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{result.title}</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>Duration: {fmtTime(result.totalDuration)} · {result.clips.length} clips found · Best: #{result.bestClipIndex + 1}</div>
              </div>
              <div style={{ fontSize: 10, color: C.green, background: "#0a1a0a", border: `1px solid ${C.green}44`, borderRadius: 6, padding: "4px 10px" }}>✓ Analyzed</div>
            </div>

            {/* Clips */}
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
              Viral Moments ({result.clips.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {result.clips.map((clip, idx) => {
                const cs = clipStates[idx] || { state: "idle", progress: 0 };
                const isBest = idx === result.bestClipIndex;
                return (
                  <div key={idx} style={{ background: C.card, border: `1px solid ${isBest ? C.purple + "66" : C.border}`, borderRadius: 12, padding: 18, position: "relative" }}>
                    {isBest && <div style={{ position: "absolute", top: -1, right: 14, background: C.purple, color: "#fff", fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: "3px 8px", borderRadius: "0 0 6px 6px", textTransform: "uppercase" }}>Best Clip</div>}

                    {/* Clip header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 20, color: C.cyan }}>{fmtTime(clip.startSec)} → {fmtTime(clip.endSec)}</span>
                          <span style={{ fontSize: 10, color: "#555", background: "#111", borderRadius: 4, padding: "2px 6px" }}>{clip.endSec - clip.startSec}s</span>
                          <span style={{ fontSize: 11 }}>{CLIP_ICONS[clip.clipType] || "🎬"} <span style={{ color: "#666", fontSize: 10 }}>{clip.clipType}</span></span>
                        </div>
                        <div style={{ fontSize: 13, color: "#fff", fontWeight: 600, marginBottom: 4 }}>{clip.hook}</div>
                        <div style={{ fontSize: 11, color: "#666" }}>{clip.reason}</div>
                      </div>
                      <div style={{ marginLeft: 16, minWidth: 90 }}>
                        <div style={{ fontSize: 9, color: "#444", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Viral Score</div>
                        <ScoreBar score={clip.viralScore} />
                      </div>
                    </div>

                    {/* Editable caption */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 9, color: "#444", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Caption (editable)</div>
                      <textarea
                        value={editingCaption[idx] || ""}
                        onChange={e => setEditingCaption(prev => ({ ...prev, [idx]: e.target.value }))}
                        rows={3}
                        style={{ width: "100%", background: "#0a0a0a", border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", color: "#ccc", fontSize: 11, outline: "none", resize: "vertical", fontFamily: "inherit" }}
                      />
                    </div>

                    {/* Progress bar */}
                    {cs.state !== "idle" && cs.state !== "done" && cs.state !== "error" && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: "#666" }}>
                            {cs.state === "trimming" ? "✂️ Trimming in browser..." : cs.state === "uploading" ? "☁️ Uploading to R2..." : "📤 Posting to IG + FB..."}
                          </span>
                          <span style={{ fontSize: 10, color: C.cyan }}>{cs.progress}%</span>
                        </div>
                        <div style={{ height: 3, background: "#1a1a1a", borderRadius: 2 }}>
                          <div style={{ width: `${cs.progress}%`, height: "100%", background: `linear-gradient(90deg,${C.purple},${C.cyan})`, borderRadius: 2, transition: "width .3s" }} />
                        </div>
                      </div>
                    )}

                    {/* Result */}
                    {cs.state === "done" && (
                      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                        {cs.igPostId && <span style={{ fontSize: 10, color: C.green, background: "#0a1a0a", border: `1px solid ${C.green}33`, borderRadius: 4, padding: "3px 8px" }}>✓ IG Posted</span>}
                        {cs.fbPostId && <span style={{ fontSize: 10, color: C.blue, background: "#0a0f1a", border: `1px solid ${C.blue}33`, borderRadius: 4, padding: "3px 8px" }}>✓ FB Posted</span>}
                        {cs.stagedUrl && <a href={cs.stagedUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: C.cyan, textDecoration: "none" }}>▶ Preview clip</a>}
                        {cs.error && <span style={{ fontSize: 10, color: C.yellow }}>⚠️ {cs.error}</span>}
                      </div>
                    )}
                    {cs.state === "error" && <div style={{ fontSize: 11, color: C.red, marginBottom: 10 }}>✗ {cs.error}</div>}

                    {/* Action button */}
                    <button
                      onClick={() => processAndPost(clip, idx)}
                      disabled={cs.state !== "idle" && cs.state !== "error" && cs.state !== "done"}
                      style={{
                        background: cs.state === "done" ? "#0a1a0a" : cs.state === "error" ? "#1a0a0a" : `linear-gradient(135deg,${C.purple},#7c3aed)`,
                        border: `1px solid ${cs.state === "done" ? C.green + "44" : cs.state === "error" ? C.red + "44" : C.purple + "44"}`,
                        borderRadius: 7, padding: "8px 18px", color: "#fff", fontSize: 12, fontWeight: 700,
                        cursor: (cs.state !== "idle" && cs.state !== "error") ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center", gap: 7, opacity: (cs.state !== "idle" && cs.state !== "error" && cs.state !== "done") ? 0.7 : 1,
                      }}
                    >
                      {cs.state === "trimming" || cs.state === "uploading" || cs.state === "posting"
                        ? <><Spinner size={12} /> Processing...</>
                        : cs.state === "done" ? "✓ Posted"
                        : cs.state === "error" ? "↺ Retry"
                        : "🎬 Trim & Post to IG + FB"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !analyzing && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24 }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 16 }}>How It Works</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                ["🔗", "Paste any YouTube, TikTok, Twitter/X, or direct MP4 URL"],
                ["🤖", "Gemini AI analyzes the full video — transcript, pacing, emotion — and scores each moment"],
                ["✂️", "ffmpeg.wasm trims the clip directly in your browser — no upload, no server cost"],
                ["☁️", "Trimmed clip is staged to Cloudflare R2 and posted as an IG Reel + FB video"],
                ["📊", "Each clip gets a virality score (0–100) based on hook strength, emotion, and shareability"],
              ].map(([icon, text], i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
                  <span style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
