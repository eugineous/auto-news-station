"use client";
import { useState, useRef, useEffect } from "react";
import Shell from "../shell";

const PINK = "#FF007A";
const R = "#E50914";

type Tab = "post" | "import" | "history";
type Status = "idle" | "loading" | "success" | "error";
const FETCH_OPTS: RequestInit = { credentials: "include" };

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function Spin() {
  return <span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid rgba(255,255,255,.2)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />;
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 6, padding: "11px 13px", color: "#e5e5e5", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const lbl: React.CSSProperties = { display: "block", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#555", marginBottom: 7 };
const hint: React.CSSProperties = { fontSize: 11, color: "#444", marginTop: 5 };

// ── Post Video Tab ────────────────────────────────────────────────────────────
function PostVideoTab({ onSuccess }: { onSuccess: () => void }) {
  const [url, setUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState("ENTERTAINMENT");
  const [thumbUrl, setThumbUrl] = useState("");
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<any>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const CATS = ["ENTERTAINMENT", "CELEBRITY", "MUSIC", "TV & FILM", "SPORTS", "NEWS", "COMEDY", "INFLUENCERS", "EAST AFRICA", "GENERAL"];

  // Live thumbnail re-gen
  useEffect(() => {
    if (!headline.trim() || !thumbUrl) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setThumbLoading(true);
      const params = new URLSearchParams({ title: headline, category, imageUrl: thumbUrl });
      const src = `/api/preview-image?${params}`;
      const img = new Image();
      img.onload = () => { setThumbSrc(src); setThumbLoading(false); };
      img.onerror = () => setThumbLoading(false);
      img.src = src;
    }, 500);
  }, [headline, category, thumbUrl]);

  async function fetchInfo() {
    if (!url.trim()) return;
    setFetching(true);
    try {
      const r = await fetch("/api/preview-url", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }) });
      const d = await r.json();
      const img = d.scraped?.videoThumbnailUrl || d.scraped?.imageUrl || "";
      if (img) setThumbUrl(img);
      if (!headline && d.scraped?.title) setHeadline(d.scraped.title.toUpperCase().slice(0, 100));
      if (!caption && d.ai?.caption) setCaption(d.ai.caption);
    } catch {}
    setFetching(false);
  }

  async function handlePost() {
    if (!url.trim() || !headline.trim() || !caption.trim() || status === "loading") return;
    setStatus("loading"); setResult(null);
    try {
      // Resolve video first
      const resolveRes = await fetch("/api/resolve-video", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }) });
      const resolveData = await resolveRes.json();
      if (!resolveRes.ok || !resolveData.success || !resolveData.videoUrl) {
        throw new Error(resolveData.error || "Could not extract video from this URL");
      }
      const r = await fetch("/api/post-video", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: resolveData.videoUrl, headline: headline.trim(), caption: caption.trim() + `\n\nSource: ${url.trim()}`, category }) });
      const d = await r.json();
      setResult(d);
      setStatus(d.instagram?.success || d.facebook?.success ? "success" : "error");
      if (d.instagram?.success || d.facebook?.success) { setTimeout(() => { setUrl(""); setHeadline(""); setCaption(""); setThumbUrl(""); setThumbSrc(null); setStatus("idle"); onSuccess(); }, 2000); }
    } catch (e: any) { setResult({ error: e.message }); setStatus("error"); }
  }

  const canPost = url.trim() && headline.trim() && caption.trim() && status !== "loading";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <p style={hint}>Paste a YouTube, TikTok, Instagram, or Twitter/X video URL. We'll extract it, generate a branded thumbnail, and post as a Reel to IG + video to FB.</p>

      {/* URL */}
      <div>
        <label style={lbl}>Video URL</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={url} onChange={e => setUrl(e.target.value)} onBlur={fetchInfo} placeholder="YouTube, TikTok, Instagram, Twitter/X, or .mp4 URL" style={{ ...inp, flex: 1 }} />
          <button onClick={fetchInfo} disabled={!url.trim() || fetching} style={{ background: "#111", border: "1px solid #333", color: "#888", borderRadius: 6, padding: "11px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            {fetching ? <Spin /> : "Fetch"}
          </button>
        </div>
      </div>

      {/* Category */}
      <div>
        <label style={lbl}>Category</label>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {CATS.map(c => (
            <button key={c} onClick={() => setCategory(c)} style={{ padding: "4px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: "pointer", border: `1px solid ${category === c ? PINK : "#1a1a1a"}`, background: category === c ? PINK : "#0a0a0a", color: category === c ? "#fff" : "#555", transition: "all .15s" }}>{c}</button>
          ))}
        </div>
      </div>

      {/* Headline + live thumbnail */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <label style={lbl}>Headline <span style={{ color: "#444", fontWeight: 400 }}>(on thumbnail)</span></label>
          <input value={headline} onChange={e => setHeadline(e.target.value.toUpperCase())} placeholder="TYPE YOUR HEADLINE IN CAPS" maxLength={120} style={{ ...inp, textTransform: "uppercase", letterSpacing: 1 }} />
          <p style={hint}>{headline.length}/120</p>
        </div>
        {(thumbUrl || thumbSrc) && (
          <div style={{ flexShrink: 0, width: 90, position: "relative" }}>
            <label style={{ ...lbl, marginBottom: 6 }}>Thumbnail</label>
            {thumbLoading && <div style={{ position: "absolute", inset: 0, top: 22, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, zIndex: 2 }}><Spin /></div>}
            <img src={thumbSrc || `/api/preview-image?${new URLSearchParams({ title: headline || "PPP TV", category, imageUrl: thumbUrl })}`} alt="" style={{ width: 90, aspectRatio: "4/5", objectFit: "cover", borderRadius: 6, display: "block", opacity: thumbLoading ? 0.4 : 1 }} />
          </div>
        )}
      </div>

      {/* Caption */}
      <div>
        <label style={lbl}>Caption <span style={{ color: "#444", fontWeight: 400 }}>(source credit auto-appended)</span></label>
        <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Write your caption here..." rows={5} style={{ ...inp, resize: "vertical" as const }} />
      </div>

      <button onClick={handlePost} disabled={!canPost} style={{ width: "100%", padding: "14px 0", fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" as const, color: "#fff", background: canPost ? PINK : "#111", border: "none", borderRadius: 8, cursor: canPost ? "pointer" : "not-allowed", opacity: canPost ? 1 : 0.5, transition: "all .15s" }}>
        {status === "loading" ? <><Spin /> &nbsp;Resolving + posting (~90s)…</> : "🎬 Post Video to IG + FB"}
      </button>

      {result && status !== "idle" && status !== "loading" && (
        <div style={{ borderRadius: 8, padding: "12px 14px", background: status === "success" ? "rgba(16,185,129,.08)" : "rgba(239,68,68,.08)", border: `1px solid ${status === "success" ? "#10b981" : "#ef4444"}` }}>
          {status === "success" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontWeight: 700, color: "#4ade80", fontSize: 13 }}>✓ Posted successfully</span>
              {result.instagram?.success && <span style={{ fontSize: 12, color: "#aaa" }}>Instagram ✓ {result.instagram.postId}</span>}
              {result.facebook?.success && <span style={{ fontSize: 12, color: "#aaa" }}>Facebook ✓ {result.facebook.postId}</span>}
              {!result.instagram?.success && <span style={{ fontSize: 12, color: "#f87171" }}>Instagram ✗ {result.instagram?.error}</span>}
              {!result.facebook?.success && <span style={{ fontSize: 12, color: "#f87171" }}>Facebook ✗ {result.facebook?.error}</span>}
            </div>
          ) : <span style={{ color: "#f87171", fontSize: 13 }}>{result.error || "Post failed"}</span>}
        </div>
      )}
    </div>
  );
}

// ── Import Tab ────────────────────────────────────────────────────────────────
function ImportTab({ onSuccess }: { onSuccess: () => void }) {
  const [url, setUrl] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<any>(null);
  const [headline, setHeadline] = useState("");
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");

  const PLATFORM_LABELS: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", twitter: "Twitter/X", youtube: "YouTube", reddit: "Reddit", direct: "Direct MP4" };

  async function handleResolve() {
    if (!url.trim()) return;
    setResolving(true); setResolved(null); setErr(""); setCaption(""); setHeadline("");
    try {
      const r = await fetch("/api/resolve-video", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }) });
      const d = await r.json();
      if (!r.ok || !d.success) { setErr(d.error || "Could not resolve video"); setResolving(false); return; }
      setResolved(d);
      if (d.title) setHeadline(d.title.toUpperCase().slice(0, 100));
      // Auto-generate caption
      try {
        const cr = await fetch("/api/preview-url", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }) });
        const cd = await cr.json();
        if (cd.scraped?.title) setHeadline(cd.scraped.title.toUpperCase().slice(0, 100));
        if (cd.ai?.caption) setCaption(cd.ai.caption + `\n\nCredit: ${url.trim()}`);
      } catch {}
    } catch (e: any) { setErr(e.message); }
    setResolving(false);
  }

  async function handlePost() {
    if (!resolved || !headline.trim() || !caption.trim() || status === "loading") return;
    setStatus("loading"); setResult(null);
    try {
      const r = await fetch("/api/post-video", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: resolved.videoUrl, headline: headline.trim(), caption: caption.trim(), category: "ENTERTAINMENT" }) });
      const d = await r.json();
      setResult(d);
      setStatus(d.instagram?.success || d.facebook?.success ? "success" : "error");
      if (d.instagram?.success || d.facebook?.success) { setTimeout(() => { setUrl(""); setResolved(null); setHeadline(""); setCaption(""); setStatus("idle"); onSuccess(); }, 2000); }
    } catch (e: any) { setResult({ error: e.message }); setStatus("error"); }
  }

  const canPost = resolved && headline.trim() && caption.trim() && status !== "loading";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <p style={hint}>Paste a TikTok, Instagram Reel, Twitter/X, YouTube, or Reddit video URL. We'll extract the direct video and post it with source credit.</p>

      <div>
        <label style={lbl}>Social Media URL</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={url} onChange={e => { setUrl(e.target.value); setResolved(null); setErr(""); }} placeholder="https://tiktok.com/@user/video/..." style={{ ...inp, flex: 1 }} onKeyDown={e => e.key === "Enter" && handleResolve()} />
          <button onClick={handleResolve} disabled={!url.trim() || resolving} style={{ background: url.trim() && !resolving ? PINK : "#111", border: "none", color: "#fff", borderRadius: 6, padding: "11px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            {resolving ? <Spin /> : "Extract"}
          </button>
        </div>
        {err && <p style={{ ...hint, color: "#f87171", marginTop: 6 }}>{err}</p>}
      </div>

      {resolved && (
        <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8, padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          {resolved.thumbnail && <img src={resolved.thumbnail} alt="" style={{ width: 70, height: 88, objectFit: "cover", borderRadius: 5, flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 5 }}>
              <span style={{ background: PINK, color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 3, textTransform: "uppercase" }}>{PLATFORM_LABELS[resolved.platform || ""] || resolved.platform}</span>
              <span style={{ color: "#4ade80", fontSize: 11 }}>✓ Extracted</span>
            </div>
            {resolved.title && <p style={{ fontSize: 12, color: "#aaa", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resolved.title}</p>}
          </div>
        </div>
      )}

      {resolved && <>
        <div>
          <label style={lbl}>Headline <span style={{ color: "#444", fontWeight: 400 }}>(thumbnail overlay)</span></label>
          <input value={headline} onChange={e => setHeadline(e.target.value.toUpperCase())} placeholder="TYPE YOUR HEADLINE IN CAPS" maxLength={120} style={{ ...inp, textTransform: "uppercase", letterSpacing: 1 }} />
        </div>
        <div>
          <label style={lbl}>Caption</label>
          <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={5} style={{ ...inp, resize: "vertical" as const }} />
        </div>
        <button onClick={handlePost} disabled={!canPost} style={{ width: "100%", padding: "14px 0", fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" as const, color: "#fff", background: canPost ? PINK : "#111", border: "none", borderRadius: 8, cursor: canPost ? "pointer" : "not-allowed", opacity: canPost ? 1 : 0.5 }}>
          {status === "loading" ? <><Spin /> &nbsp;Posting (~90s)…</> : "🎬 Post to IG + FB"}
        </button>
        {result && status !== "idle" && status !== "loading" && (
          <div style={{ borderRadius: 8, padding: "12px 14px", background: status === "success" ? "rgba(16,185,129,.08)" : "rgba(239,68,68,.08)", border: `1px solid ${status === "success" ? "#10b981" : "#ef4444"}` }}>
            {status === "success" ? <span style={{ color: "#4ade80", fontSize: 13, fontWeight: 700 }}>✓ Posted successfully</span> : <span style={{ color: "#f87171", fontSize: 13 }}>{result.error || "Post failed"}</span>}
          </div>
        )}
      </>}
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────
function HistoryTab() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("https://auto-ppp-tv.euginemicah.workers.dev/post-log", { headers: { Authorization: "Bearer ppptvWorker2024" } })
      .then(r => r.json())
      .then(d => {
        const videoPosts = (d.log || []).filter((p: any) => p.postType === "video" || p.manualPost);
        setPosts(videoPosts.sort((a: any, b: any) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const igOk = posts.filter(p => p.instagram?.success).length;
  const fbOk = posts.filter(p => p.facebook?.success).length;
  const both = posts.filter(p => p.instagram?.success && p.facebook?.success).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[{ label: "Total", value: posts.length, color: "#fff" }, { label: "Both", value: both, color: "#a855f7" }, { label: "IG ✓", value: igOk, color: "#E1306C" }, { label: "FB ✓", value: fbOk, color: "#1877f2" }].map(s => (
          <div key={s.label} style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8, padding: "12px 10px", textAlign: "center" }}>
            <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 28, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase", marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#333" }}>Loading…</div> : posts.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#333" }}>No video posts yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {posts.map((p, i) => (
            <div key={i} style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8, padding: "11px 13px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", justifyContent: "space-between" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 5, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ background: p.postType === "video" ? "#a855f7" : "#1a1a1a", color: p.postType === "video" ? "#fff" : "#555", fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 3, textTransform: "uppercase" }}>{p.postType === "video" ? "🎬 VIDEO" : "MANUAL"}</span>
                    <span style={{ fontSize: 10, color: "#444" }}>{ago(p.postedAt)}</span>
                    {p.sourceName && <span style={{ fontSize: 10, color: "#555" }}>via {p.sourceName}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#ccc", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                  {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#444", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", marginTop: 3 }}>{p.url.slice(0, 60)}…</a>}
                </div>
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: p.instagram?.success ? "#4ade80" : "#f87171", fontWeight: 700 }}>IG{p.instagram?.success ? "✓" : "✗"}</span>
                  <span style={{ fontSize: 10, color: p.facebook?.success ? "#4ade80" : "#f87171", fontWeight: 700 }}>FB{p.facebook?.success ? "✓" : "✗"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ComposerPage() {
  const [tab, setTab] = useState<Tab>("post");
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <Shell>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "28px 20px 80px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: PINK }} />
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 2 }}>VIDEO COMPOSER</span>
          </div>
          <p style={{ fontSize: 12, color: "#444" }}>Post videos to Instagram Reels + Facebook. Thumbnail auto-generated with PPP TV branding.</p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, padding: 4, background: "#111", borderRadius: 8, border: "1px solid #1a1a1a" }}>
          {([["post", "🎬 Post Video"], ["import", "📲 Import"], ["history", "📋 History"]] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "9px 0", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none", borderRadius: 6, cursor: "pointer", transition: "all .15s", background: tab === t ? PINK : "transparent", color: tab === t ? "#fff" : "#555" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "post" && <PostVideoTab onSuccess={() => { setRefreshKey(k => k + 1); setTab("history"); }} />}
        {tab === "import" && <ImportTab onSuccess={() => { setRefreshKey(k => k + 1); setTab("history"); }} />}
        {tab === "history" && <HistoryTab key={refreshKey} />}
      </div>
    </Shell>
  );
}
