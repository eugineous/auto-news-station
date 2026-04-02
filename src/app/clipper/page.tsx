"use client";
import { useState } from "react";
import Shell from "@/app/shell";

const GREEN = "#22c55e";
const RED = "#ef4444";
const CYAN = "#06b6d4";
const PURPLE = "#a855f7";
const BG = "#050505";
const CARD = "#0f0f0f";
const BORDER = "#1a1a1a";

interface Clip {
  startSec: number;
  endSec: number;
  reason: string;
  viralScore: number;
  hook: string;
}

interface ClipResult {
  clips: Clip[];
  title: string;
  duration: number;
  videoUrl: string;
}

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size,
      border: `2px solid #333`, borderTopColor: GREEN,
      borderRadius: "50%", animation: "spin 0.7s linear infinite",
    }} />
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? GREEN : score >= 60 ? CYAN : score >= 40 ? "#f59e0b" : RED;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: "#1a1a1a", borderRadius: 2 }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 2, transition: "width .5s" }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700, minWidth: 32 }}>{score}</span>
    </div>
  );
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ClipperPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClipResult | null>(null);
  const [error, setError] = useState("");
  const [posting, setPosting] = useState<number | null>(null);
  const [posted, setPosted] = useState<Record<number, { ig?: boolean; fb?: boolean }>>({});

  async function analyze() {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const r = await fetch("/api/clipper/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const d = await r.json() as any;
      if (!r.ok || d.error) throw new Error(d.error || "Analysis failed");
      setResult(d);
    } catch (e: any) {
      setError(e.message || "Failed to analyze video");
    } finally {
      setLoading(false);
    }
  }

  async function postClip(clip: Clip, idx: number) {
    if (!result) return;
    setPosting(idx);
    try {
      const r = await fetch("/api/clipper/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: result.videoUrl,
          startSec: clip.startSec,
          endSec: clip.endSec,
          title: clip.hook,
          caption: `${clip.hook}\n\nFollow @ppptvke for daily entertainment & sports 🔥`,
        }),
      });
      const d = await r.json() as any;
      setPosted(prev => ({ ...prev, [idx]: { ig: d.instagram?.success, fb: d.facebook?.success } }));
    } catch {
      setPosted(prev => ({ ...prev, [idx]: { ig: false, fb: false } }));
    } finally {
      setPosting(null);
    }
  }

  return (
    <Shell>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ padding: "24px 20px", maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 32, letterSpacing: 3, color: "#fff" }}>
            ✂️ CLIPPER
          </div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
            Paste any long video URL → AI identifies the best viral moments → Post as Reels
          </div>
        </div>

        {/* URL Input */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>
            Video URL
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && analyze()}
              placeholder="https://www.youtube.com/watch?v=... or TikTok, MP4..."
              style={{
                flex: 1, background: "#0a0a0a", border: `1px solid ${BORDER}`,
                borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13,
                outline: "none",
              }}
            />
            <button
              onClick={analyze}
              disabled={loading || !url.trim()}
              style={{
                background: loading ? "#1a1a1a" : `linear-gradient(135deg, ${GREEN}, #16a34a)`,
                border: "none", borderRadius: 8, padding: "10px 20px",
                color: "#fff", fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
              }}
            >
              {loading ? <><Spinner size={14} /> Analyzing...</> : "✂️ Analyze"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#444", marginTop: 8 }}>
            Supports: YouTube, TikTok, Twitter/X, direct MP4 URLs
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "#1a0a0a", border: `1px solid ${RED}44`, borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: RED, fontSize: 12 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div>
            {/* Video info */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>{result.title}</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>
                    Duration: {fmtTime(result.duration)} · {result.clips.length} clips identified
                  </div>
                </div>
                <div style={{ fontSize: 10, color: GREEN, background: "#0a1a0a", border: `1px solid ${GREEN}44`, borderRadius: 6, padding: "4px 10px" }}>
                  ✓ Analyzed
                </div>
              </div>
            </div>

            {/* Clips */}
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
              Best Moments ({result.clips.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {result.clips.map((clip, idx) => (
                <div key={idx} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 18, color: CYAN }}>
                          {fmtTime(clip.startSec)} → {fmtTime(clip.endSec)}
                        </span>
                        <span style={{ fontSize: 10, color: "#555", background: "#111", borderRadius: 4, padding: "2px 6px" }}>
                          {clip.endSec - clip.startSec}s
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#fff", fontWeight: 600, marginBottom: 4 }}>{clip.hook}</div>
                      <div style={{ fontSize: 11, color: "#666" }}>{clip.reason}</div>
                    </div>
                    <div style={{ marginLeft: 16, minWidth: 80 }}>
                      <div style={{ fontSize: 9, color: "#444", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Viral Score</div>
                      <ScoreBar score={clip.viralScore} />
                    </div>
                  </div>

                  {/* Post result */}
                  {posted[idx] && (
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 10, color: posted[idx].ig ? GREEN : RED }}>
                        {posted[idx].ig ? "✓ IG" : "✗ IG"}
                      </span>
                      <span style={{ fontSize: 10, color: posted[idx].fb ? GREEN : RED }}>
                        {posted[idx].fb ? "✓ FB" : "✗ FB"}
                      </span>
                    </div>
                  )}

                  <button
                    onClick={() => postClip(clip, idx)}
                    disabled={posting === idx || !!posted[idx]}
                    style={{
                      background: posted[idx] ? "#0a1a0a" : posting === idx ? "#1a1a1a" : `linear-gradient(135deg, ${PURPLE}, #7c3aed)`,
                      border: `1px solid ${posted[idx] ? GREEN + "44" : PURPLE + "44"}`,
                      borderRadius: 6, padding: "7px 16px", color: "#fff",
                      fontSize: 11, fontWeight: 700, cursor: posting === idx || !!posted[idx] ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    {posting === idx ? <><Spinner size={12} /> Posting...</> :
                     posted[idx] ? "✓ Posted" : "🎬 Cut & Post to IG + FB"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How it works */}
        {!result && !loading && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 14 }}>
              How Clipper Works
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { icon: "🔗", text: "Paste any video URL — YouTube, TikTok, Twitter, or direct MP4" },
                { icon: "🤖", text: "Gemini AI watches the video and identifies 3-5 viral moments with timestamps" },
                { icon: "📊", text: "Each clip gets a virality score based on hook strength, pacing, and topic heat" },
                { icon: "✂️", text: "Click 'Cut & Post' — the clip is trimmed and posted to IG + FB as a Reel" },
                { icon: "🎯", text: "Best for: interviews, highlights, speeches, music videos, event footage" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
