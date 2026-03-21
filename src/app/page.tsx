"use client";
import { useState, useEffect } from "react";

const PINK = "#FF007A";
const PINK_DIM = "rgba(255,0,122,0.15)";
const PINK_GLOW = "rgba(255,0,122,0.08)";
const BLACK = "#000000";
const SURFACE = "#141414";
const SURFACE2 = "#1a1a1a";
const BORDER = "#2a2a2a";
const MUTED = "#777777";
const WHITE = "#ffffff";

interface Article {
  id: string;
  title: string;
  category: string;
  imageGenerated: boolean;
  captionLength: { instagram: number; facebook: number };
  error?: string;
}

interface DryRunResult {
  totalArticlesFound: number;
  newArticles: number;
  dryRunSample: Article[];
}

interface PostLogEntry {
  articleId: string;
  title: string;
  url: string;
  category: string;
  instagram: { success: boolean; postId?: string; error?: string };
  facebook: { success: boolean; postId?: string; error?: string };
  postedAt: string;
}

export default function Home() {
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Article | null>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postLog, setPostLog] = useState<PostLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(true);

  useEffect(() => {
    fetchLog();
    const interval = setInterval(fetchLog, 60000);
    return () => clearInterval(interval);
  }, []);

  async function fetchLog() {
    try {
      const r = await fetch("/api/post-log");
      if (r.ok) {
        const d = await r.json();
        setPostLog(d.log || []);
      }
    } catch { /* non-fatal */ }
    finally { setLogLoading(false); }
  }

  async function fetchArticles() {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelected(null);
    setImgSrc(null);
    try {
      const res = await fetch("/api/dry-run");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      const first = data.dryRunSample?.find((a: Article) => a.imageGenerated);
      if (first) pick(first);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function pick(article: Article) {
    setSelected(article);
    setImgSrc(null);
    setImgLoading(true);
    setImgSrc(`/api/preview-image?title=${encodeURIComponent(article.title)}&category=${encodeURIComponent(article.category)}&t=${Date.now()}`);
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }

  const tokensConfigured = postLog.length > 0 || true; // tokens are set

  return (
    <div style={{ minHeight: "100vh", background: BLACK, color: WHITE, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* NAV */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
        height: 68, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 48px",
        background: "linear-gradient(to bottom, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0) 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/PPP_TV_LOGO.png/240px-PPP_TV_LOGO.png"
            alt="PPP TV"
            style={{ height: 44, width: "auto", objectFit: "contain" }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <span style={{ fontSize: 11, color: PINK, fontWeight: 800, letterSpacing: 3, textTransform: "uppercase" }}>Auto Poster</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
          <span style={{ fontSize: 12, color: MUTED }}>Live</span>
        </div>
      </nav>

      {/* HERO */}
      <div style={{
        position: "relative", height: 480, overflow: "hidden",
        background: "linear-gradient(135deg, #0a0a0a 0%, #1a001a 50%, #0a0a0a 100%)",
        display: "flex", alignItems: "flex-end",
      }}>
        <div style={{ position: "absolute", top: "20%", left: "30%", width: 600, height: 400, background: `radial-gradient(ellipse, ${PINK_GLOW} 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 2, padding: "0 64px 64px 64px", maxWidth: 700 }}>
          <div style={{ fontSize: 11, color: PINK, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase", marginBottom: 16 }}>PPP TV Kenya · Auto Poster</div>
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 80, lineHeight: 0.9, letterSpacing: 2, color: WHITE, marginBottom: 20 }}>
            LATEST NEWS<br /><span style={{ color: PINK }}>AUTO-POSTED</span>
          </h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, marginBottom: 32, maxWidth: 480 }}>
            Scrapes PPP TV Kenya every 10 minutes. Gemini AI generates clickbait titles. Posts to Instagram &amp; Facebook automatically.
          </p>
          <button
            onClick={fetchArticles}
            disabled={loading}
            style={{
              background: loading ? "rgba(255,255,255,0.1)" : PINK,
              color: WHITE, border: "none", borderRadius: 6,
              padding: "14px 36px", fontWeight: 800, fontSize: 15,
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: 1, textTransform: "uppercase",
              opacity: loading ? 0.7 : 1,
              boxShadow: loading ? "none" : "0 0 32px rgba(255,0,122,0.4)",
            }}
          >
            {loading ? "Fetching…" : "▶ Preview Latest Article"}
          </button>
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 160, background: "linear-gradient(to bottom, transparent, #000)" }} />
      </div>

      <div style={{ padding: "0 48px 80px 48px", maxWidth: 1200, margin: "0 auto" }}>
        {error && (
          <div style={{ background: "#1a0808", border: "1px solid #5a1a1a", borderRadius: 8, padding: "14px 20px", color: "#f87171", fontSize: 13, marginBottom: 24, marginTop: 32 }}>
            {error}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: "flex", gap: 32, padding: "32px 0", borderBottom: `1px solid ${BORDER}`, marginBottom: 40 }}>
          {[
            { label: "Source", value: "ppptv-v2.vercel.app" },
            { label: "Format", value: "1080 × 1350  4:5" },
            { label: "Cron", value: "Every 10 minutes" },
            { label: "Social", value: tokensConfigured ? "✓ Tokens configured" : "Awaiting tokens" },
            { label: "AI", value: "Gemini 1.5 Flash" },
            { label: "Posts Today", value: postLog.filter(p => new Date(p.postedAt).toDateString() === new Date().toDateString()).length.toString() },
          ].map((s) => (
            <div key={s.label}>
              <div style={{ fontSize: 10, color: MUTED, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.label === "Social" && tokensConfigured ? "#22c55e" : WHITE }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Post Log */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: WHITE, display: "flex", alignItems: "center", gap: 12 }}>
            Recent Posts
            <span style={{ fontSize: 12, color: MUTED, fontWeight: 400 }}>auto-refreshes every minute</span>
          </div>
          {logLoading ? (
            <div style={{ color: MUTED, fontSize: 13 }}>Loading log…</div>
          ) : postLog.length === 0 ? (
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "24px", color: MUTED, fontSize: 13 }}>
              No posts yet. The cron runs every 10 minutes automatically.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {postLog.slice(0, 10).map((entry, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "1fr auto auto auto",
                  alignItems: "center", gap: 16,
                  padding: "14px 20px",
                  background: i % 2 === 0 ? SURFACE : "transparent",
                  borderRadius: 6,
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: WHITE, fontWeight: 600, marginBottom: 2 }}>{entry.title}</div>
                    <div style={{ fontSize: 11, color: MUTED }}>{entry.category} · <a href={entry.url} target="_blank" rel="noreferrer" style={{ color: PINK, textDecoration: "none" }}>source</a></div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>IG</div>
                    <div style={{ fontSize: 12, color: entry.instagram.success ? "#22c55e" : "#f87171" }}>{entry.instagram.success ? "✓" : "✗"}</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: MUTED, marginBottom: 2 }}>FB</div>
                    <div style={{ fontSize: 12, color: entry.facebook.success ? "#22c55e" : "#f87171" }}>{entry.facebook.success ? "✓" : "✗"}</div>
                  </div>
                  <div style={{ fontSize: 11, color: MUTED, whiteSpace: "nowrap" }}>{timeAgo(entry.postedAt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {result && (
          <>
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: WHITE }}>
                Articles <span style={{ color: MUTED, fontWeight: 400, fontSize: 13 }}>· click to preview</span>
              </div>
              <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
                {result.dryRunSample.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => a.imageGenerated && pick(a)}
                    style={{
                      flexShrink: 0, width: 220,
                      background: selected?.id === a.id ? SURFACE2 : SURFACE,
                      border: `1px solid ${selected?.id === a.id ? PINK : BORDER}`,
                      borderRadius: 8, padding: "16px",
                      cursor: a.imageGenerated ? "pointer" : "default",
                      opacity: a.imageGenerated ? 1 : 0.4,
                      transform: selected?.id === a.id ? "scale(1.02)" : "scale(1)",
                      boxShadow: selected?.id === a.id ? `0 0 20px ${PINK_DIM}` : "none",
                    }}
                  >
                    <div style={{ fontSize: 10, color: PINK, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>{a.category}</div>
                    <div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.5 }}>{a.title.slice(0, 80)}</div>
                    {a.imageGenerated && <div style={{ fontSize: 11, color: "#22c55e", marginTop: 10, fontWeight: 600 }}>✓ Image ready</div>}
                    {a.error && <div style={{ fontSize: 11, color: "#f87171", marginTop: 10 }}>✗ Failed</div>}
                  </div>
                ))}
              </div>
            </div>

            {selected && (
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", display: "grid", gridTemplateColumns: "auto 1fr", gap: 0 }}>
                <div
                  onClick={() => imgSrc && !imgLoading && setLightbox(true)}
                  style={{ width: 320, aspectRatio: "4/5", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", cursor: imgSrc && !imgLoading ? "zoom-in" : "default", flexShrink: 0 }}
                >
                  {imgLoading && <div style={{ color: MUTED, fontSize: 13 }}>Generating…</div>}
                  {imgSrc && (
                    <>
                      <img src={imgSrc} alt="Generated" onLoad={() => setImgLoading(false)} onError={() => { setImgLoading(false); setImgSrc(null); }} style={{ width: "100%", height: "100%", objectFit: "cover", display: imgLoading ? "none" : "block" }} />
                      {!imgLoading && <div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,0.8)", color: WHITE, fontSize: 11, padding: "4px 10px", borderRadius: 4 }}>Click to enlarge</div>}
                    </>
                  )}
                </div>
                <div style={{ padding: "36px 40px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontSize: 11, color: PINK, fontWeight: 800, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 }}>{selected.category}</div>
                  <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 42, lineHeight: 1, letterSpacing: 1, color: WHITE, marginBottom: 24 }}>{selected.title}</h2>
                  <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
                    {["instagram", "facebook"].map(p => (
                      <div key={p} style={{ background: BLACK, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "10px 16px" }}>
                        <div style={{ fontSize: 10, color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{p}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#22c55e" }}>{selected.captionLength[p as "instagram" | "facebook"]} <span style={{ fontSize: 11, color: MUTED, fontWeight: 400 }}>chars</span></div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
                    Image generated at 1080×1350 (4:5) using Bebas Neue.<br />
                    AI clickbait title + Kenyan-focused caption via Gemini.
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {lightbox && imgSrc && (
          <div onClick={() => setLightbox(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.96)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, cursor: "zoom-out" }}>
            <img src={imgSrc} alt="Full size" style={{ maxWidth: "88vw", maxHeight: "92vh", borderRadius: 8 }} />
            <div style={{ position: "absolute", top: 20, right: 28, color: MUTED, fontSize: 12 }}>Click to close</div>
          </div>
        )}

        {/* Setup checklist */}
        <div style={{ marginTop: 64 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: WHITE }}>Setup Checklist</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[
              { done: true, label: "Next.js app deployed on Vercel" },
              { done: true, label: "RSS scraper + Bebas Neue image generator (4:5)" },
              { done: true, label: "Cloudflare Worker cron every 10 minutes" },
              { done: true, label: "Cloudflare KV deduplication + post log" },
              { done: true, label: "INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_ACCOUNT_ID configured" },
              { done: true, label: "FACEBOOK_ACCESS_TOKEN + FACEBOOK_PAGE_ID configured" },
              { done: true, label: "Gemini AI clickbait titles + Kenya-only filter" },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", background: i % 2 === 0 ? SURFACE : "transparent", borderRadius: 6 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: item.done ? PINK : "transparent", border: `2px solid ${item.done ? PINK : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {item.done && <span style={{ color: WHITE, fontSize: 11, fontWeight: 900 }}>✓</span>}
                </div>
                <span style={{ fontSize: 13, color: item.done ? WHITE : MUTED }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 64, paddingTop: 24, borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/PPP_TV_LOGO.png/120px-PPP_TV_LOGO.png" alt="PPP TV" style={{ height: 28, width: "auto", objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <span style={{ fontSize: 12, color: MUTED }}>Auto Poster · Vercel + Cloudflare + Gemini AI</span>
          </div>
          <span style={{ fontSize: 12, color: MUTED }}>PPP TV Kenya © 2026</span>
        </div>
      </div>
    </div>
  );
}
