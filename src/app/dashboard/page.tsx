"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Shell from "../shell";

const CATS = ["AUTO","CELEBRITY","MUSIC","TV & FILM","FASHION","EVENTS","AWARDS","EAST AFRICA","GENERAL"];
const PINK = "#FF007A", RED = "#E50914";

interface LogEntry {
  articleId: string; title: string; url: string; category: string;
  sourceType?: string; manualPost?: boolean; isBreaking?: boolean;
  instagram: { success: boolean; postId?: string; error?: string };
  facebook: { success: boolean; postId?: string; error?: string };
  postedAt: string;
}
interface Preview {
  scraped: { type: string; title: string; description: string; imageUrl: string; sourceName: string; isVideo?: boolean; videoEmbedUrl?: string | null; videoUrl?: string | null };
  ai: { clickbaitTitle: string; caption: string };
  category: string;
  imageBase64: string;
}
interface Retry { loading: boolean; done?: boolean; error?: string }

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function Spinner() {
  return <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />;
}

function Toast({ msg, type, onClose }: { msg: string; type: "ok" | "err"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{
      position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
      background: type === "ok" ? "#0d2a0d" : "#2a0d0d",
      border: `1px solid ${type === "ok" ? "#1a4a1a" : "#4a1a1a"}`,
      color: type === "ok" ? "#4ade80" : "#f87171",
      padding: "12px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
      zIndex: 300, animation: "fadeIn .2s ease", whiteSpace: "nowrap",
      boxShadow: "0 8px 32px rgba(0,0,0,.6)",
    }}>
      {type === "ok" ? "✓ " : "✗ "}{msg}
    </div>
  );
}

// ── Post Card (Netflix style) ─────────────────────────────────────────────────
function PostCard({ entry, onRetry, retries }: { entry: LogEntry; onRetry: (e: LogEntry, p: "instagram" | "facebook") => void; retries: Record<string, Retry> }) {
  const [hovered, setHovered] = useState(false);
  const igOk = entry.instagram.success || retries[entry.articleId + "_instagram"]?.done;
  const fbOk = entry.facebook.success || retries[entry.articleId + "_facebook"]?.done;
  const catColor = entry.category === "CELEBRITY" ? PINK : entry.category === "MUSIC" ? "#a855f7" : entry.category === "TV & FILM" ? "#3b82f6" : entry.category === "FASHION" ? "#ec4899" : RED;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0, width: 200, borderRadius: 8, overflow: "hidden",
        background: "#1f1f1f", border: "1px solid #2a2a2a",
        transition: "transform .2s ease, box-shadow .2s ease",
        transform: hovered ? "scale(1.05)" : "scale(1)",
        boxShadow: hovered ? "0 12px 40px rgba(0,0,0,.8)" : "none",
        cursor: "pointer", position: "relative",
      }}
    >
      {/* Thumbnail placeholder */}
      <div style={{ width: "100%", aspectRatio: "4/5", background: `linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)`, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 11, color: catColor, letterSpacing: 2 }}>{entry.category}</div>
          <div style={{ fontSize: 11, color: "#555", textAlign: "center", padding: "0 12px", lineHeight: 1.4 }}>{entry.title.slice(0, 60)}{entry.title.length > 60 ? "…" : ""}</div>
        </div>
        {/* Category stripe */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: catColor }} />
        {/* Badges */}
        <div style={{ position: "absolute", top: 8, right: 8, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          {entry.isBreaking && <span style={{ background: RED, color: "#fff", fontSize: 8, fontWeight: 800, padding: "2px 5px", borderRadius: 3, letterSpacing: 1 }}>BREAKING</span>}
          {entry.manualPost && <span style={{ background: "#2a2a2a", color: "#888", fontSize: 8, fontWeight: 700, padding: "2px 5px", borderRadius: 3 }}>MANUAL</span>}
        </div>
      </div>
      {/* Info */}
      <div style={{ padding: "10px 10px 8px" }}>
        <div style={{ fontSize: 11, color: "#ccc", lineHeight: 1.4, marginBottom: 6, fontWeight: 500 }}>
          {entry.title.slice(0, 55)}{entry.title.length > 55 ? "…" : ""}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#444" }}>{ago(entry.postedAt)}</span>
          <div style={{ display: "flex", gap: 4 }}>
            <span style={{ fontSize: 10, color: igOk ? "#4ade80" : "#f87171" }}>IG{igOk ? "✓" : "✗"}</span>
            <span style={{ fontSize: 10, color: fbOk ? "#4ade80" : "#f87171" }}>FB{fbOk ? "✓" : "✗"}</span>
          </div>
        </div>
      </div>
      {/* Hover overlay with retry */}
      {hovered && (!igOk || !fbOk) && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 12 }}>
          {!igOk && (
            <button onClick={() => onRetry(entry, "instagram")}
              disabled={retries[entry.articleId + "_instagram"]?.loading}
              style={{ background: PINK, color: "#fff", border: "none", borderRadius: 5, padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", width: "100%" }}>
              {retries[entry.articleId + "_instagram"]?.loading ? "..." : "↺ Retry IG"}
            </button>
          )}
          {!fbOk && (
            <button onClick={() => onRetry(entry, "facebook")}
              disabled={retries[entry.articleId + "_facebook"]?.loading}
              style={{ background: "#1877f2", color: "#fff", border: "none", borderRadius: 5, padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", width: "100%" }}>
              {retries[entry.articleId + "_facebook"]?.loading ? "..." : "↺ Retry FB"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Hero Banner ───────────────────────────────────────────────────────────────
function HeroBanner({ entry, nextPostIn }: { entry: LogEntry | null; nextPostIn: string }) {
  const catColor = entry?.category === "CELEBRITY" ? PINK : entry?.category === "MUSIC" ? "#a855f7" : RED;
  return (
    <div style={{
      position: "relative", width: "100%", minHeight: 280,
      background: "linear-gradient(135deg, #0a0a0a 0%, #1a0a0a 50%, #0a0a14 100%)",
      overflow: "hidden", borderRadius: 0,
    }}>
      {/* Animated background grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 20% 50%, rgba(229,9,20,.06) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,0,122,.04) 0%, transparent 50%)" }} />

      {/* Content */}
      <div style={{ position: "relative", padding: "40px 32px 32px", maxWidth: 700 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: RED, animation: "pulse 1.5s infinite" }} />
          <span style={{ fontSize: 10, color: "#666", letterSpacing: 3, textTransform: "uppercase", fontWeight: 700 }}>Live Auto-Poster</span>
          <span style={{ fontSize: 10, color: "#333", letterSpacing: 1 }}>·</span>
          <span style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>Next post {nextPostIn}</span>
        </div>

        {entry ? (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ background: catColor, color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 4, letterSpacing: 1, textTransform: "uppercase" }}>{entry.category}</span>
              {entry.isBreaking && <span style={{ background: RED, color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 4, letterSpacing: 1 }}>BREAKING</span>}
            </div>
            <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(28px, 4vw, 48px)", lineHeight: 1.05, letterSpacing: 1, marginBottom: 12, color: "#fff" }}>
              {entry.title}
            </h1>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#aaa" }}>{ago(entry.postedAt)}</span>
              <span style={{ fontSize: 12, color: entry.instagram.success ? "#4ade80" : "#f87171" }}>
                {entry.instagram.success ? "✓" : "✗"} Instagram
              </span>
              <span style={{ fontSize: 12, color: entry.facebook.success ? "#4ade80" : "#f87171" }}>
                {entry.facebook.success ? "✓" : "✗"} Facebook
              </span>
              {entry.url && (
                <a href={entry.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: "#aaa", textDecoration: "none", border: "1px solid #3a3a3a", borderRadius: 4, padding: "3px 10px" }}>
                  Source ↗
                </a>
              )}
            </div>
          </>
        ) : (
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 42, letterSpacing: 2, color: "#aaa", marginBottom: 8 }}>No posts yet</h1>
            <p style={{ fontSize: 13, color: "#888" }}>Auto-poster will publish the first article soon.</p>
          </div>
        )}
      </div>

      {/* Bottom gradient */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80, background: "linear-gradient(to top, #141414, transparent)" }} />
    </div>
  );
}

// ── Quick Post Panel ──────────────────────────────────────────────────────────
function QuickPost({ onSuccess }: { onSuccess: () => void }) {
  const [url, setUrl] = useState("");
  const [cat, setCat] = useState("AUTO");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [prevLoading, setPrevLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [needsManual, setNeedsManual] = useState(false);
  const [igTitle, setIgTitle] = useState("");
  const [igCaption, setIgCaption] = useState("");
  const [lightbox, setLightbox] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); }).catch(() => {});
  }

  useEffect(() => { setNeedsManual(false); setIgTitle(""); setIgCaption(""); setErr(null); setPreview(null); setOk(null); setShowPlayer(false); }, [url]);

  async function doPreview(overrideTitle?: string, overrideCaption?: string) {
    if (!url.trim()) return;
    setPrevLoading(true); setErr(null); setPreview(null); setOk(null);
    try {
      const body: Record<string, string> = { url: url.trim() };
      if (cat !== "AUTO") body.category = cat;
      if (overrideTitle) body.manualTitle = overrideTitle;
      if (overrideCaption) body.manualCaption = overrideCaption;
      const r = await fetch("/api/preview-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.error === "INSTAGRAM_MANUAL") { setNeedsManual(true); setPrevLoading(false); return; }
      if (!r.ok || d.error) throw new Error(d.error || "Preview failed");
      setNeedsManual(false); setPreview(d);
    } catch (e: any) { setErr(e.message); }
    finally { setPrevLoading(false); }
  }

  async function doPost() {
    if (!preview) return;
    setPosting(true); setErr(null); setOk(null);
    try {
      const body: Record<string, string> = { url: url.trim() };
      if (cat !== "AUTO") body.category = cat;
      if (needsManual && igTitle) body.manualTitle = igTitle;
      if (needsManual && igCaption) body.manualCaption = igCaption;
      const r = await fetch("/api/post-from-url-proxy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Post failed");
      const ig = d.instagram?.success, fb = d.facebook?.success;
      setOk((ig && fb) ? "Posted to IG + FB ✓" : ig ? "Posted to IG only" : fb ? "Posted to FB only" : "Both failed");
      if (ig || fb) { setUrl(""); setPreview(null); setNeedsManual(false); setTimeout(onSuccess, 1500); }
    } catch (e: any) { setErr(e.message); }
    finally { setPosting(false); }
  }

  const isVideo = preview?.scraped?.isVideo;
  const embedUrl = preview?.scraped?.videoEmbedUrl;

  return (
    <div>
      {/* URL input row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input className="inp" placeholder="Paste article / YouTube / TikTok / Twitter URL…"
          value={url} onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === "Enter" && doPreview()}
          style={{ flex: 1 }} />
        <button className="btn btn-red" onClick={() => doPreview()} disabled={!url.trim() || prevLoading} style={{ whiteSpace: "nowrap", minWidth: 90 }}>
          {prevLoading ? <Spinner /> : "Preview"}
        </button>
      </div>

      {/* Category pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {CATS.map(c => (
          <button key={c} onClick={() => setCat(c)} style={{
            padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${cat === c ? RED : "#2a2a2a"}`,
            background: cat === c ? RED : "#1a1a1a",
            color: cat === c ? "#fff" : "#666",
            transition: "all .15s", whiteSpace: "nowrap",
          }}>{c}</button>
        ))}
      </div>

      {/* Manual fields */}
      {needsManual && (
        <div className="card" style={{ padding: 14, marginBottom: 12, borderColor: "#3a1a1a" }}>
          <div style={{ fontSize: 11, color: PINK, marginBottom: 10, fontWeight: 700 }}>⚠ Instagram needs manual title + caption</div>
          <input className="inp" placeholder="Headline…" value={igTitle} onChange={e => setIgTitle(e.target.value)} style={{ marginBottom: 8 }} />
          <textarea className="inp" placeholder="Caption…" value={igCaption} onChange={e => setIgCaption(e.target.value)} rows={3} style={{ resize: "vertical" }} />
          <button className="btn btn-pink" style={{ marginTop: 10, width: "100%" }} onClick={() => doPreview(igTitle, igCaption)} disabled={!igTitle || !igCaption || prevLoading}>
            {prevLoading ? <Spinner /> : "Generate Preview"}
          </button>
        </div>
      )}

      {err && <div style={{ background: "#1a0808", border: "1px solid #3a1a1a", borderRadius: 6, padding: "10px 14px", color: "#f87171", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {ok && <div style={{ background: "#081a08", border: "1px solid #1a3a1a", borderRadius: 6, padding: "10px 14px", color: "#4ade80", fontSize: 13, marginBottom: 12 }}>{ok}</div>}

      {preview && (
        <div className="card" style={{ overflow: "hidden" }}>
          {/* Thumbnail */}
          <div style={{ position: "relative", cursor: "zoom-in" }} onClick={() => setLightbox(true)}>
            <img src={preview.imageBase64} alt="" style={{ width: "100%", display: "block", aspectRatio: "4/5", objectFit: "cover" }} />
            <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.75)", borderRadius: 4, padding: "3px 8px", fontSize: 10, color: "#fff" }}>4:5 · tap to zoom</div>
          </div>
          {/* Video player */}
          {isVideo && embedUrl && (
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #2a2a2a" }}>
              <button className="btn-ghost" style={{ width: "100%", fontSize: 12 }} onClick={() => setShowPlayer(p => !p)}>
                {showPlayer ? "Hide" : "▶ Play"} Video
              </button>
              {showPlayer && (
                <div style={{ marginTop: 10, borderRadius: 6, overflow: "hidden", aspectRatio: "16/9" }}>
                  <iframe src={embedUrl} style={{ width: "100%", height: "100%", border: "none" }} allowFullScreen />
                </div>
              )}
            </div>
          )}
          {/* Content */}
          <div style={{ padding: 16 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, lineHeight: 1.2, marginBottom: 8, letterSpacing: .5 }}>{preview.ai.clickbaitTitle}</div>
            <div style={{ fontSize: 13, color: "#777", lineHeight: 1.65, marginBottom: 14 }}>{preview.ai.caption}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              <span className="tag tag-red">{preview.category}</span>
              {isVideo && <span className="tag tag-dark">VIDEO</span>}
              <button onClick={() => copyText(preview.ai.clickbaitTitle, "title")} className="btn-ghost" style={{ padding: "2px 8px", fontSize: 10 }}>{copied === "title" ? "✓ Copied" : "Copy Title"}</button>
              <button onClick={() => copyText(preview.ai.caption, "cap")} className="btn-ghost" style={{ padding: "2px 8px", fontSize: 10 }}>{copied === "cap" ? "✓ Copied" : "Copy Caption"}</button>
            </div>
            <button className="btn btn-red" style={{ width: "100%", padding: "13px" }} onClick={doPost} disabled={posting}>
              {posting ? <Spinner /> : "Post to Instagram + Facebook"}
            </button>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && preview?.imageBase64 && (
        <div onClick={() => setLightbox(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.97)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
          <img src={preview.imageBase64} alt="" style={{ maxWidth: "95vw", maxHeight: "90dvh", borderRadius: 8, objectFit: "contain" }} />
        </div>
      )}
    </div>
  );
}

// ── Stats Cards ───────────────────────────────────────────────────────────────
function StatsRow({ log }: { log: LogEntry[] }) {
  const today = log.filter(p => new Date(p.postedAt).toDateString() === new Date().toDateString()).length;
  const total = log.filter(p => p.instagram.success || p.facebook.success).length;
  const igCount = log.filter(p => p.instagram.success).length;
  const fbCount = log.filter(p => p.facebook.success).length;
  const failCount = log.filter(p => !p.instagram.success && !p.facebook.success).length;
  const successRate = total > 0 ? Math.round((total / log.length) * 100) : 0;

  const stats = [
    { label: "Today", value: today, sub: "/ 24 cap", color: RED },
    { label: "Total Posts", value: total, sub: `${successRate}% success`, color: "#fff" },
    { label: "Instagram", value: igCount, sub: "published", color: "#E1306C" },
    { label: "Facebook", value: fbCount, sub: "published", color: "#1877f2" },
    { label: "Failed", value: failCount, sub: "need retry", color: failCount > 0 ? "#f87171" : "#888" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
      {stats.map(s => (
        <div key={s.label} className="card" style={{ padding: "18px 16px" }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 40, color: s.color, lineHeight: 1, letterSpacing: 1 }}>{s.value}</div>
          <div style={{ fontSize: 10, color: "#aaa", marginTop: 4, letterSpacing: 2, fontWeight: 700, textTransform: "uppercase" }}>{s.label}</div>
          <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{s.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── Category Row ──────────────────────────────────────────────────────────────
function CategoryRow({ title, entries, onRetry, retries }: { title: string; entries: LogEntry[]; onRetry: (e: LogEntry, p: "instagram" | "facebook") => void; retries: Record<string, Retry> }) {
  if (entries.length === 0) return null;
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 1, color: "#fff" }}>{title}</h2>
        <span style={{ fontSize: 11, color: "#888" }}>{entries.length} posts</span>
      </div>
      <div className="scroll-row">
        {entries.map(e => <PostCard key={e.articleId} entry={e} onRetry={onRetry} retries={retries} />)}
      </div>
    </div>
  );
}

// ── Config Panel ──────────────────────────────────────────────────────────────
function ConfigPanel() {
  const items = [
    ["Schedule", "Every 15 min"], ["Peak Hours", "6am–11pm EAT"],
    ["Daily Cap", "24 posts/day"], ["Per Run", "1 post"],
    ["Dedup", "Cloudflare KV"], ["Filter", "Kenya only"],
    ["Model", "Gemini 2.5 Flash"], ["Image", "1080×1350 JPEG"],
  ];
  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div style={{ fontSize: 10, color: "#aaa", letterSpacing: 2, fontWeight: 700, textTransform: "uppercase", marginBottom: 14 }}>System Config</div>
      {items.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #1f1f1f", fontSize: 12 }}>
          <span style={{ color: "#aaa" }}>{k}</span>
          <span style={{ fontWeight: 600, color: "#e5e5e5" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [view, setView] = useState<"feed" | "post" | "stats">("feed");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(true);
  const [retries, setRetries] = useState<Record<string, Retry>>({});
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [nextPostIn, setNextPostIn] = useState("~15 min");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("ALL");
  const [filterPlatform, setFilterPlatform] = useState<"all" | "ig" | "fb" | "failed">("all");

  const fetchLog = useCallback(async () => {
    try {
      const r = await fetch("/api/post-log");
      if (r.ok) { const d = await r.json(); setLog(d.log || []); }
    } catch {}
    finally { setLogLoading(false); }
  }, []);

  useEffect(() => { fetchLog(); const t = setInterval(fetchLog, 60000); return () => clearInterval(t); }, [fetchLog]);

  // Countdown to next post (15 min intervals)
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const next = new Date(now);
      next.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
      const diff = Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1000));
      const m = Math.floor(diff / 60), s = diff % 60;
      setNextPostIn(`${m}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  async function doRetry(entry: LogEntry, platform: "instagram" | "facebook") {
    const key = entry.articleId + "_" + platform;
    setRetries(s => ({ ...s, [key]: { loading: true } }));
    try {
      const r = await fetch("/api/retry-post", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId: entry.articleId, title: entry.title, caption: entry.title, articleUrl: entry.url, category: entry.category, platform }) });
      const d = await r.json();
      const success = platform === "instagram" ? d.instagram?.success : d.facebook?.success;
      setRetries(s => ({ ...s, [key]: { loading: false, done: success, error: success ? undefined : (d.error || "Failed") } }));
      if (success) { setToast({ msg: `Retried ${platform} ✓`, type: "ok" }); setTimeout(fetchLog, 1500); }
      else setToast({ msg: d.error || "Retry failed", type: "err" });
    } catch (e: any) {
      setRetries(s => ({ ...s, [key]: { loading: false, error: e.message } }));
      setToast({ msg: e.message, type: "err" });
    }
  }

  const sortedLog = [...log].sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
  const latest = sortedLog.length > 0 ? sortedLog[0] : null;
  const todayCount = sortedLog.filter(p => new Date(p.postedAt).toDateString() === new Date().toDateString()).length;

  // Filtered log
  const filtered = sortedLog.filter(e => {
    if (search && !e.title.toLowerCase().includes(search.toLowerCase()) && !e.category.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat !== "ALL" && e.category !== filterCat) return false;
    if (filterPlatform === "ig" && !e.instagram.success) return false;
    if (filterPlatform === "fb" && !e.facebook.success) return false;
    if (filterPlatform === "failed" && (e.instagram.success || e.facebook.success)) return false;
    return true;
  });

  // Group by category for Netflix rows
  const byCategory = CATS.reduce((acc, cat) => {
    const entries = sortedLog.filter(e => e.category === cat);
    if (entries.length > 0) acc[cat] = entries;
    return acc;
  }, {} as Record<string, LogEntry[]>);

  const recentAll = sortedLog.slice(0, 20);

  return (
    <Shell>
      <div style={{ minHeight: "100dvh", background: "#141414" }}>
        {/* Hero */}
        <HeroBanner entry={latest} nextPostIn={nextPostIn} />

        {/* Top action bar */}
        <div style={{ padding: "0 24px", borderBottom: "1px solid #1f1f1f", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#141414", position: "sticky", top: 0, zIndex: 30 }}>
          <div style={{ display: "flex", gap: 0 }}>
            {([["feed", "📺 Feed"], ["post", "📤 Quick Post"], ["stats", "📊 Stats"]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)} style={{
                background: "none", border: "none", color: view === v ? "#fff" : "#555",
                fontSize: 13, fontWeight: view === v ? 700 : 500, cursor: "pointer",
                padding: "14px 16px", borderBottom: `2px solid ${view === v ? RED : "transparent"}`,
                transition: "all .15s", whiteSpace: "nowrap",
              }}>{label}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#aaa" }}>{todayCount}/24 today</span>
            <Link href="/composer" style={{ background: PINK, color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" }}>
              + Compose
            </Link>
          </div>
        </div>

        <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>

          {/* ── FEED VIEW ── */}
          {view === "feed" && (
            <div className="fade">
              {/* Search + filters */}
              <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
                <input className="inp" placeholder="Search posts…" aria-label="Search posts" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1, minWidth: 200, maxWidth: 320 }} />
                <select className="inp" aria-label="Filter by category" value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: "auto", minWidth: 130 }}>
                  <option value="ALL">All Categories</option>
                  {CATS.filter(c => c !== "AUTO").map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["all", "ig", "fb", "failed"] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setFilterPlatform(f)}
                      aria-label={f === "all" ? "Show all posts" : f === "ig" ? "Show Instagram posts" : f === "fb" ? "Show Facebook posts" : "Show failed posts"}
                      aria-pressed={filterPlatform === f}
                      style={{
                        padding: "7px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                        border: `1px solid ${filterPlatform === f ? RED : "#3a3a3a"}`,
                        background: filterPlatform === f ? RED : "#1a1a1a",
                        color: filterPlatform === f ? "#fff" : "#aaa",
                        transition: "all .15s", textTransform: "uppercase", letterSpacing: .5,
                      }}
                    >{f === "all" ? "All" : f === "ig" ? "Instagram" : f === "fb" ? "Facebook" : "Failed"}</button>
                  ))}
                </div>
                <button className="btn-ghost" style={{ padding: "7px 12px", fontSize: 11 }} onClick={fetchLog} aria-label="Refresh posts">↻ Refresh</button>
              </div>

              {logLoading ? (
                <div role="status" aria-label="Loading posts" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="skeleton" style={{ height: 280, borderRadius: 8 }} aria-hidden="true" />
                  ))}
                </div>
              ) : (search || filterCat !== "ALL" || filterPlatform !== "all") ? (
                // Filtered flat grid
                <div>
                  <div style={{ fontSize: 11, color: "#aaa", marginBottom: 12 }}>{filtered.length} results</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                    {filtered.map(e => <PostCard key={e.articleId} entry={e} onRetry={doRetry} retries={retries} />)}
                  </div>
                  {filtered.length === 0 && <div style={{ textAlign: "center", padding: 60, color: "#aaa", fontSize: 14 }}>No posts match your filters</div>}
                </div>
              ) : (
                // Netflix rows
                <div>
                  {recentAll.length > 0 && (
                    <div style={{ marginBottom: 32 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                        <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 1 }}>Recently Posted</h2>
                        <span style={{ fontSize: 11, color: "#888" }}>{recentAll.length} posts</span>
                      </div>
                      <div className="scroll-row">
                        {recentAll.map(e => <PostCard key={e.articleId} entry={e} onRetry={doRetry} retries={retries} />)}
                      </div>
                    </div>
                  )}
                  {Object.entries(byCategory).map(([cat, entries]) => (
                    <CategoryRow key={cat} title={cat} entries={entries} onRetry={doRetry} retries={retries} />
                  ))}
                  {log.length === 0 && <div style={{ textAlign: "center", padding: 80, color: "#aaa", fontSize: 14 }}>No posts yet — auto-poster will start soon</div>}
                </div>
              )}
            </div>
          )}

          {/* ── QUICK POST VIEW ── */}
          {view === "post" && (
            <div className="fade" style={{ maxWidth: 600 }}>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 1, marginBottom: 4 }}>Quick Post</h2>
                <p style={{ fontSize: 12, color: "#555" }}>Paste any URL — article, YouTube, TikTok, Twitter — and post to IG + FB instantly.</p>
              </div>
              <QuickPost onSuccess={() => { fetchLog(); setView("feed"); setToast({ msg: "Posted successfully!", type: "ok" }); }} />
            </div>
          )}

          {/* ── STATS VIEW ── */}
          {view === "stats" && (
            <div className="fade">
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 1, marginBottom: 4 }}>Analytics</h2>
                <p style={{ fontSize: 12, color: "#555" }}>Performance overview for your social media posts.</p>
              </div>
              <StatsRow log={log} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
                {/* Category breakdown */}
                <div className="card" style={{ padding: "16px 18px" }}>
                  <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, fontWeight: 700, textTransform: "uppercase", marginBottom: 14 }}>By Category</div>
                  {(() => {
                    const counts = CATS.reduce((a, c) => ({ ...a, [c]: log.filter(p => p.category === c).length }), {} as Record<string, number>);
                    const max = Math.max(1, ...Object.values(counts));
                    return CATS.filter(c => counts[c] > 0).map(c => (
                      <div key={c} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: "#555", width: 80, flexShrink: 0 }}>{c}</div>
                        <div style={{ flex: 1, background: "#111", borderRadius: 2, height: 4 }}>
                          <div style={{ width: `${Math.round(counts[c] / max * 100)}%`, background: RED, borderRadius: 2, height: 4, transition: "width .4s" }} />
                        </div>
                        <div style={{ fontSize: 11, color: "#444", width: 20, textAlign: "right" }}>{counts[c]}</div>
                      </div>
                    ));
                  })()}
                  {log.length === 0 && <div style={{ color: "#333", fontSize: 12 }}>No data yet</div>}
                </div>

                {/* Platform breakdown */}
                <div className="card" style={{ padding: "16px 18px" }}>
                  <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, fontWeight: 700, textTransform: "uppercase", marginBottom: 14 }}>Platform Success</div>
                  {[
                    { label: "Instagram", count: log.filter(p => p.instagram.success).length, color: "#E1306C" },
                    { label: "Facebook", count: log.filter(p => p.facebook.success).length, color: "#1877f2" },
                    { label: "Both", count: log.filter(p => p.instagram.success && p.facebook.success).length, color: "#4ade80" },
                    { label: "Failed", count: log.filter(p => !p.instagram.success && !p.facebook.success).length, color: "#f87171" },
                  ].map(({ label, count, color }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: "#555", width: 80, flexShrink: 0 }}>{label}</div>
                      <div style={{ flex: 1, background: "#111", borderRadius: 2, height: 4 }}>
                        <div style={{ width: `${log.length > 0 ? Math.round(count / log.length * 100) : 0}%`, background: color, borderRadius: 2, height: 4, transition: "width .4s" }} />
                      </div>
                      <div style={{ fontSize: 11, color: "#444", width: 20, textAlign: "right" }}>{count}</div>
                    </div>
                  ))}
                </div>

                {/* Config */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <ConfigPanel />
                </div>
              </div>
            </div>
          )}
        </div>

        {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    </Shell>
  );
}
