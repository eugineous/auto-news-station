"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Shell from "../shell";

const PINK = "#FF007A";
const GREEN = "#4ade80";
const RED = "#f87171";
const PURPLE = "#a855f7";
const BLUE = "#3b82f6";
const ORANGE = "#f97316";

type Tab = "cockpit" | "compose" | "sources" | "history";
type PostStatus = "idle" | "resolving" | "posting" | "success" | "error";

const FETCH_OPTS: RequestInit = { credentials: "include" };
const WORKER = "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_AUTH = { Authorization: "Bearer ppptvWorker2024" };

const CATS = ["AUTO","CELEBRITY","MUSIC","TV & FILM","FASHION","EVENTS","AWARDS","EAST AFRICA","GENERAL","SPORTS","BUSINESS","POLITICS","TECHNOLOGY","HEALTH","SCIENCE","LIFESTYLE","COMEDY","INFLUENCERS"];

const PLATFORM_COLOR: Record<string, string> = {
  tiktok: "#ff0050", youtube: "#ff0000", instagram: "#e1306c",
  twitter: "#1da1f2", reddit: "#ff4500", dailymotion: "#0066dc",
  vimeo: "#1ab7ea", direct: "#888", "direct-mp4": "#ff0050",
};

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function Spin({ size = 13 }: { size?: number }) {
  return <span style={{ display: "inline-block", width: size, height: size, border: "2px solid rgba(255,255,255,.2)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite", flexShrink: 0 }} />;
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span style={{ background: color + "22", color, border: `1px solid ${color}44`, fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3, textTransform: "uppercase" as const, letterSpacing: 1 }}>{label}</span>;
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8, padding: "14px 10px", textAlign: "center" as const }}>
      <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 30, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase" as const, marginTop: 4 }}>{label}</div>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 6, padding: "11px 13px", color: "#e5e5e5", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const lbl: React.CSSProperties = { display: "block", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, color: "#555", marginBottom: 7 };

// ── Cockpit Tab — live ops dashboard ─────────────────────────────────────────
function CockpitTab({ onCompose }: { onCompose: (url: string) => void }) {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoPost, setAutoPost] = useState(false);
  const [autoPosting, setAutoPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(WORKER + "/post-log", { headers: WORKER_AUTH });
      const d = await r.json() as any;
      const all = (d.log || []).sort((a: any, b: any) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
      setPosts(all);
      setLastRefresh(new Date());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function triggerAutoPost() {
    setAutoPosting(true);
    try {
      await fetch("/api/automate-video", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.NEXT_PUBLIC_AUTOMATE_SECRET } });
      await load();
    } catch {}
    setAutoPosting(false);
  }

  const today = posts.filter(p => new Date(p.postedAt).toDateString() === new Date().toDateString());
  const igOk = today.filter(p => p.instagram?.success).length;
  const fbOk = today.filter(p => p.facebook?.success).length;
  const fails = today.filter(p => !p.instagram?.success && !p.facebook?.success).length;
  const recent = posts.slice(0, 50);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Live indicator */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: GREEN, display: "inline-block", boxShadow: `0 0 6px ${GREEN}` }} />
          <span style={{ fontSize: 11, color: "#555" }}>LIVE · refreshes every 15s{lastRefresh ? ` · ${ago(lastRefresh.toISOString())}` : ""}</span>
        </div>
        <button onClick={load} style={{ background: "none", border: "1px solid #222", color: "#555", borderRadius: 5, padding: "4px 10px", fontSize: 10, cursor: "pointer" }}>↻ Refresh</button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        <StatCard label="Today" value={today.length} color="#fff" />
        <StatCard label="IG ✓" value={igOk} color="#E1306C" />
        <StatCard label="FB ✓" value={fbOk} color="#1877f2" />
        <StatCard label="Fails" value={fails} color={fails > 0 ? RED : "#333"} />
      </div>

      {/* Recent posts feed */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#333" }}><Spin size={20} /></div>
        ) : recent.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#333", fontSize: 12 }}>No posts yet</div>
        ) : recent.map((p, i) => (
          <div key={i} style={{ background: "#0a0a0a", border: "1px solid #111", borderRadius: 6, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 5, marginBottom: 4, flexWrap: "wrap" as const, alignItems: "center" }}>
                <Badge label={p.category || "VIDEO"} color={PURPLE} />
                {p.sourceName && <Badge label={p.sourceName} color="#555" />}
                <span style={{ fontSize: 10, color: "#333" }}>{ago(p.postedAt)}</span>
              </div>
              <div style={{ fontSize: 12, color: "#ccc", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.title}</div>
              {p.url && (
                <div style={{ display: "flex", gap: 8, marginTop: 3, alignItems: "center" }}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#444", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, flex: 1 }}>{p.url.slice(0, 65)}…</a>
                  <button onClick={() => onCompose(p.url)} style={{ background: "none", border: "1px solid #222", color: "#555", borderRadius: 4, padding: "2px 7px", fontSize: 9, cursor: "pointer", whiteSpace: "nowrap" as const, flexShrink: 0 }}>Re-post</button>
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 3, flexShrink: 0, alignItems: "flex-end" }}>
              <span style={{ fontSize: 11, color: p.instagram?.success ? GREEN : RED, fontWeight: 800 }}>IG {p.instagram?.success ? "✓" : "✗"}</span>
              <span style={{ fontSize: 11, color: p.facebook?.success ? GREEN : RED, fontWeight: 800 }}>FB {p.facebook?.success ? "✓" : "✗"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Compose Tab — paste URL, preview, post ────────────────────────────────────
function ComposeTab({ initialUrl, onSuccess }: { initialUrl?: string; onSuccess: () => void }) {
  const [url, setUrl] = useState(initialUrl || "");
  const [headline, setHeadline] = useState("");
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState("GENERAL");
  const [thumbUrl, setThumbUrl] = useState("");
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [refining, setRefining] = useState(false);
  const [status, setStatus] = useState<PostStatus>("idle");
  const [result, setResult] = useState<any>(null);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState("");
  const [platform, setPlatform] = useState("");
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerError, setPlayerError] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (initialUrl) { setUrl(initialUrl); doFetch(initialUrl); } }, [initialUrl]);

  // Regenerate thumbnail when headline/category changes
  useEffect(() => {
    if (!headline.trim() || !thumbUrl) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setThumbLoading(true);
      const src = `/api/preview-image?${new URLSearchParams({ title: headline, category, imageUrl: thumbUrl })}`;
      const img = new Image();
      img.onload = () => { setThumbSrc(src); setThumbLoading(false); };
      img.onerror = () => setThumbLoading(false);
      img.src = src;
    }, 500);
  }, [headline, category, thumbUrl]);

  async function doFetch(u?: string) {
    const target = (u || url).trim();
    if (!target) return;
    setFetching(true);
    setResolvedVideoUrl(""); setPlatform(""); setShowPlayer(false); setPlayerError(false);
    try {
      // Run all three in parallel: scrape+AI, resolve video
      const [previewRes, resolveRes] = await Promise.all([
        fetch("/api/preview-url", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target }) }),
        fetch("/api/resolve-video", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target }) }),
      ]);
      const preview = await previewRes.json() as any;
      const resolve = await resolveRes.json() as any;

      // Set thumbnail
      const img = preview.scraped?.videoThumbnailUrl || preview.scraped?.imageUrl || "";
      if (img) setThumbUrl(img);

      // AI-generated headline — always overwrite on fresh fetch
      if (preview.ai?.clickbaitTitle) setHeadline(preview.ai.clickbaitTitle.toUpperCase().slice(0, 120));
      else if (preview.scraped?.title) setHeadline(preview.scraped.title.toUpperCase().slice(0, 120));

      // AI-generated caption — always overwrite on fresh fetch
      if (preview.ai?.caption) setCaption(preview.ai.caption);

      // Auto-detect category
      if (preview.category) setCategory(preview.category);

      // Resolved video URL for player
      if (resolve.success && resolve.videoUrl) {
        setResolvedVideoUrl(resolve.videoUrl);
        setPlatform(resolve.platform || "");
      }
    } catch {}
    setFetching(false);
  }

  async function handleRefine() {
    if (!url.trim() || refining) return;
    setRefining(true);
    try {
      const r = await fetch("/api/preview-url", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }) });
      const d = await r.json() as any;
      if (d.ai?.clickbaitTitle) setHeadline(d.ai.clickbaitTitle.toUpperCase().slice(0, 120));
      if (d.ai?.caption) setCaption(d.ai.caption);
    } catch {}
    setRefining(false);
  }

  async function handlePost() {
    if (!url.trim() || !headline.trim() || !caption.trim() || status === "posting" || status === "resolving") return;
    setStatus("resolving"); setResult(null);
    try {
      setStatus("posting");
      const r = await fetch("/api/post-video", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim(), headline: headline.trim(), caption: caption.trim() + `\n\nSource: ${url.trim()}`, category }) });
      const d = await r.json() as any;
      setResult(d);
      setStatus(d.instagram?.success || d.facebook?.success ? "success" : "error");
      if (d.instagram?.success || d.facebook?.success) {
        setTimeout(() => { setUrl(""); setHeadline(""); setCaption(""); setThumbUrl(""); setThumbSrc(null); setResolvedVideoUrl(""); setStatus("idle"); setShowPlayer(false); onSuccess(); }, 2500);
      }
    } catch (e: any) { setResult({ error: e.message }); setStatus("error"); }
  }

  const canPost = url.trim() && headline.trim() && caption.trim() && status !== "posting" && status !== "resolving";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* URL input */}
      <div>
        <label style={lbl}>Video URL <span style={{ color: "#333", fontWeight: 400, textTransform: "none" as const }}>— TikTok, YouTube, Instagram, Twitter/X, Reddit, .mp4</span></label>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={url} onChange={e => { setUrl(e.target.value); setResolvedVideoUrl(""); setShowPlayer(false); }} onBlur={() => doFetch()} placeholder="Paste any video URL…" style={{ ...inp, flex: 1 }} />
          <button onClick={() => doFetch()} disabled={!url.trim() || fetching} style={{ background: url.trim() && !fetching ? PINK : "#111", border: "none", color: "#fff", borderRadius: 6, padding: "11px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const, display: "flex", alignItems: "center", gap: 6 }}>
            {fetching ? <><Spin /> Fetching…</> : "Fetch"}
          </button>
        </div>

        {/* Resolved video status + play button */}
        {resolvedVideoUrl && !fetching && (
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: GREEN, display: "inline-block" }} />
            <span style={{ fontSize: 10, color: GREEN }}>Video ready</span>
            {platform && <Badge label={platform} color={PLATFORM_COLOR[platform] || "#888"} />}
            <button onClick={() => { setShowPlayer(p => !p); setPlayerError(false); }} style={{ background: showPlayer ? "#222" : PINK, border: "none", color: "#fff", borderRadius: 4, padding: "3px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
              {showPlayer ? "▼ Hide" : "▶ Preview"}
            </button>
          </div>
        )}
      </div>

      {/* Inline video player — proxied to avoid CORS */}
      {showPlayer && resolvedVideoUrl && (
        <div style={{ borderRadius: 8, overflow: "hidden", background: "#000", border: "1px solid #1a1a1a", position: "relative" as const }}>
          {playerError ? (
            <div style={{ padding: 20, textAlign: "center", color: "#555", fontSize: 12 }}>
              Can't play inline — <a href={resolvedVideoUrl} target="_blank" rel="noopener noreferrer" style={{ color: PINK }}>open in new tab ↗</a>
            </div>
          ) : (
            <video
              src={`/api/proxy-video?url=${encodeURIComponent(resolvedVideoUrl)}`}
              controls
              style={{ width: "100%", maxHeight: 360, display: "block" }}
              onError={() => setPlayerError(true)}
            />
          )}
        </div>
      )}

      {/* Category */}
      <div>
        <label style={lbl}>Category</label>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
          {CATS.map(c => (
            <button key={c} onClick={() => setCategory(c)} style={{ padding: "4px 9px", borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: "pointer", border: `1px solid ${category === c ? PINK : "#1a1a1a"}`, background: category === c ? PINK : "#0a0a0a", color: category === c ? "#fff" : "#555", transition: "all .15s" }}>{c}</button>
          ))}
        </div>
      </div>

      {/* Headline + thumbnail */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
            <label style={{ ...lbl, marginBottom: 0 }}>Headline <span style={{ color: "#333", fontWeight: 400, textTransform: "none" as const }}>(thumbnail overlay)</span></label>
            <button onClick={handleRefine} disabled={!url.trim() || refining} style={{ background: "none", border: `1px solid ${PINK}44`, color: PINK, borderRadius: 4, padding: "2px 8px", fontSize: 9, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              {refining ? <><Spin size={9} /> Refining…</> : "✨ AI Refine"}
            </button>
          </div>
          <input value={headline} onChange={e => setHeadline(e.target.value.toUpperCase())} placeholder="TYPE YOUR HEADLINE IN CAPS" maxLength={120} style={{ ...inp, textTransform: "uppercase" as const, letterSpacing: 1 }} />
          <span style={{ fontSize: 10, color: "#333", marginTop: 4, display: "block" }}>{headline.length}/120</span>
        </div>
        {(thumbUrl || thumbSrc) && (
          <div style={{ flexShrink: 0, width: 80, position: "relative" as const }}>
            <label style={{ ...lbl, marginBottom: 5 }}>Cover</label>
            {thumbLoading && <div style={{ position: "absolute" as const, inset: 0, top: 22, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, zIndex: 2 }}><Spin /></div>}
            <img src={thumbSrc || `/api/preview-image?${new URLSearchParams({ title: headline || "PPP TV", category, imageUrl: thumbUrl })}`} alt="" style={{ width: 80, aspectRatio: "4/5", objectFit: "cover", borderRadius: 6, display: "block", opacity: thumbLoading ? 0.3 : 1 }} />
          </div>
        )}
      </div>

      {/* Caption */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>Caption</label>
          <button onClick={handleRefine} disabled={!url.trim() || refining} style={{ background: "none", border: `1px solid ${PINK}44`, color: PINK, borderRadius: 4, padding: "2px 8px", fontSize: 9, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            {refining ? <><Spin size={9} /> Refining…</> : "✨ AI Refine"}
          </button>
        </div>
        <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Write your caption…" rows={5} style={{ ...inp, resize: "vertical" as const }} />
      </div>

      {/* Post button */}
      <button onClick={handlePost} disabled={!canPost} style={{ width: "100%", padding: "14px 0", fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" as const, color: "#fff", background: canPost ? PINK : "#111", border: "none", borderRadius: 8, cursor: canPost ? "pointer" : "not-allowed", opacity: canPost ? 1 : 0.5, transition: "all .15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {status === "resolving" || status === "posting" ? <><Spin /> {status === "resolving" ? "Resolving…" : "Posting to IG + FB (~60s)…"}</> : "🎬 Post Video to IG + FB"}
      </button>

      {/* Result */}
      {result && status !== "idle" && status !== "resolving" && status !== "posting" && (
        <div style={{ borderRadius: 8, padding: "12px 14px", background: status === "success" ? "rgba(74,222,128,.06)" : "rgba(248,113,113,.06)", border: `1px solid ${status === "success" ? GREEN + "44" : RED + "44"}` }}>
          {status === "success" ? (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <span style={{ fontWeight: 700, color: GREEN, fontSize: 13 }}>✓ Posted successfully</span>
              {result.instagram?.success && <span style={{ fontSize: 11, color: "#aaa" }}>Instagram ✓ {result.instagram.postId}</span>}
              {result.facebook?.success && <span style={{ fontSize: 11, color: "#aaa" }}>Facebook ✓ {result.facebook.postId}</span>}
              {!result.instagram?.success && <span style={{ fontSize: 11, color: RED }}>Instagram ✗ {result.instagram?.error}</span>}
              {!result.facebook?.success && <span style={{ fontSize: 11, color: RED }}>Facebook ✗ {result.facebook?.error}</span>}
            </div>
          ) : <span style={{ color: RED, fontSize: 13 }}>{result.error || "Post failed"}</span>}
        </div>
      )}
    </div>
  );
}

// ── Sources Tab — live video feed from all scraped sources ────────────────────
function SourcesTab({ onCompose }: { onCompose: (url: string) => void }) {
  const [videos, setVideos] = useState<any[]>([]);
  const [feedStatus, setFeedStatus] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [posting, setPosting] = useState<string | null>(null);
  const [postResults, setPostResults] = useState<Record<string, { ig: boolean; fb: boolean; err?: string }>>({});
  const [filter, setFilter] = useState("ALL");
  const [view, setView] = useState<"feeds" | "videos">("feeds");

  const PLATFORM_LABELS: Record<string, string> = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram", twitter: "Twitter/X", reddit: "Reddit", dailymotion: "Dailymotion", vimeo: "Vimeo", "direct-mp4": "TikTok", direct: "Direct" };

  async function loadFeedStatus() {
    setStatusLoading(true);
    try {
      const r = await fetch("/api/admin/feeds/status", { ...FETCH_OPTS });
      const d = await r.json() as any;
      setFeedStatus(d.feeds || []);
    } catch {}
    setStatusLoading(false);
  }

  async function loadVideos() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/feeds", { ...FETCH_OPTS, method: "POST" });
      const d = await r.json() as any;
      setVideos(d.videos || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadFeedStatus(); }, []);

  async function quickPost(video: any) {
    setPosting(video.id);
    try {
      const r = await fetch("/api/post-video", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: video.directVideoUrl || video.url, headline: video.title.toUpperCase().slice(0, 100), caption: `${video.title}\n\nCredit: ${video.sourceName} | ${video.url}`, category: video.category || "GENERAL" }) });
      const d = await r.json() as any;
      setPostResults(prev => ({ ...prev, [video.id]: { ig: !!d.instagram?.success, fb: !!d.facebook?.success, err: d.error } }));
    } catch (e: any) {
      setPostResults(prev => ({ ...prev, [video.id]: { ig: false, fb: false, err: e.message } }));
    }
    setPosting(null);
  }

  const platforms = ["ALL", ...Array.from(new Set(videos.map((v: any) => v.sourceType || "unknown")))];
  const filtered = filter === "ALL" ? videos : videos.filter((v: any) => v.sourceType === filter);
  const healthy = feedStatus.filter((f: any) => f.ok).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* View toggle */}
      <div style={{ display: "flex", gap: 3, padding: 3, background: "#0a0a0a", borderRadius: 7, border: "1px solid #1a1a1a" }}>
        {(["feeds", "videos"] as const).map(v => (
          <button key={v} onClick={() => { setView(v); if (v === "videos" && videos.length === 0) loadVideos(); }} style={{ flex: 1, padding: "7px 0", fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" as const, border: "none", borderRadius: 5, cursor: "pointer", background: view === v ? PINK : "transparent", color: view === v ? "#fff" : "#444" }}>
            {v === "feeds" ? "📡 Feed Health" : "🎬 Video Queue"}
          </button>
        ))}
      </div>

      {view === "feeds" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: healthy > 15 ? GREEN : ORANGE, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: "#555" }}>{healthy}/{feedStatus.length} feeds healthy</span>
            </div>
            <button onClick={loadFeedStatus} style={{ background: "none", border: "1px solid #222", color: "#555", borderRadius: 5, padding: "4px 10px", fontSize: 10, cursor: "pointer" }}>↻ Check</button>
          </div>

          {statusLoading ? (
            <div style={{ textAlign: "center", padding: 30, color: "#333" }}><Spin size={18} /></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
              {feedStatus.map((f: any, i: number) => (
                <div key={i} style={{ background: "#0a0a0a", border: `1px solid ${f.ok ? "#1a1a1a" : "#f8717122"}`, borderRadius: 6, padding: "8px 12px", display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: f.ok ? GREEN : RED, flexShrink: 0, display: "inline-block" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: f.ok ? "#ccc" : "#f87171", fontWeight: 600 }}>{f.name}</span>
                      <Badge label={f.cat} color={PURPLE} />
                    </div>
                    {f.ok ? (
                      <span style={{ fontSize: 10, color: "#444" }}>{f.items} items · {f.latency}ms{f.lastItem ? ` · last: ${ago(f.lastItem)}` : ""}</span>
                    ) : (
                      <span style={{ fontSize: 10, color: RED }}>{f.error || `HTTP ${f.status}`}</span>
                    )}
                  </div>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, color: "#333", textDecoration: "none", flexShrink: 0 }}>↗</a>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === "videos" && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "#444" }}>{videos.length} videos from {new Set(videos.map((v: any) => v.sourceName)).size} sources</span>
            <button onClick={loadVideos} disabled={loading} style={{ background: loading ? "#111" : "none", border: "1px solid #222", color: "#555", borderRadius: 5, padding: "4px 10px", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              {loading ? <><Spin size={10} /> Scraping…</> : "↻ Scrape"}
            </button>
          </div>

          {videos.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
              {platforms.map(p => (
                <button key={p} onClick={() => setFilter(p)} style={{ padding: "3px 9px", borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: "pointer", border: `1px solid ${filter === p ? PINK : "#1a1a1a"}`, background: filter === p ? PINK : "#0a0a0a", color: filter === p ? "#fff" : "#555" }}>
                  {PLATFORM_LABELS[p] || p}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#333" }}>
              <Spin size={20} />
              <div style={{ marginTop: 10, fontSize: 11, color: "#444" }}>Scraping 50+ sources… (~20s)</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#333", fontSize: 12 }}>
              {videos.length === 0 ? "Click Scrape to load videos from all sources" : "No videos match this filter"}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
              {filtered.map((v: any) => {
                const res = postResults[v.id];
                const isPosting = posting === v.id;
                return (
                  <div key={v.id} style={{ background: "#0a0a0a", border: `1px solid ${res ? (res.ig || res.fb ? "#4ade8033" : "#f8717133") : "#111"}`, borderRadius: 8, padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                    {v.thumbnail && <img src={v.thumbnail} alt="" style={{ width: 56, height: 70, objectFit: "cover", borderRadius: 5, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 5, marginBottom: 4, flexWrap: "wrap" as const, alignItems: "center" }}>
                        <Badge label={PLATFORM_LABELS[v.sourceType] || v.sourceType} color={PLATFORM_COLOR[v.sourceType] || "#888"} />
                        <Badge label={v.category || "VIDEO"} color={PURPLE} />
                        <span style={{ fontSize: 10, color: "#333" }}>{v.sourceName}</span>
                        {v.publishedAt && <span style={{ fontSize: 10, color: "#333" }}>· {ago(new Date(v.publishedAt).toISOString())}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#ccc", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, marginBottom: 4 }}>{v.title}</div>
                      <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#333", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, display: "block" }}>{v.url.slice(0, 60)}…</a>
                      {res && (
                        <div style={{ marginTop: 4, fontSize: 10 }}>
                          {res.err ? <span style={{ color: RED }}>{res.err}</span> : <span style={{ color: GREEN }}>Posted — IG {res.ig ? "✓" : "✗"} FB {res.fb ? "✓" : "✗"}</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 4, flexShrink: 0 }}>
                      <button onClick={() => quickPost(v)} disabled={isPosting || !!res} style={{ background: res ? (res.ig || res.fb ? GREEN : RED) : PINK, border: "none", color: "#fff", borderRadius: 5, padding: "5px 10px", fontSize: 10, fontWeight: 700, cursor: isPosting || res ? "default" : "pointer", opacity: isPosting ? 0.7 : 1, display: "flex", alignItems: "center", gap: 4 }}>
                        {isPosting ? <><Spin size={10} /> Posting</> : res ? (res.ig || res.fb ? "✓ Done" : "✗ Failed") : "▶ Post"}
                      </button>
                      <button onClick={() => onCompose(v.url)} style={{ background: "none", border: "1px solid #222", color: "#555", borderRadius: 5, padding: "5px 10px", fontSize: 10, cursor: "pointer" }}>Edit</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────
function HistoryTab({ onCompose }: { onCompose: (url: string) => void }) {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(WORKER + "/post-log", { headers: WORKER_AUTH })
      .then(r => r.json())
      .then((d: any) => setPosts((d.log || []).sort((a: any, b: any) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const igOk = posts.filter(p => p.instagram?.success).length;
  const fbOk = posts.filter(p => p.facebook?.success).length;
  const both = posts.filter(p => p.instagram?.success && p.facebook?.success).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        <StatCard label="Total" value={posts.length} color="#fff" />
        <StatCard label="Both ✓" value={both} color={PURPLE} />
        <StatCard label="IG ✓" value={igOk} color="#E1306C" />
        <StatCard label="FB ✓" value={fbOk} color="#1877f2" />
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "#333" }}><Spin size={20} /></div> : posts.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#333", fontSize: 12 }}>No posts yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 5 }}>
          {posts.map((p, i) => (
            <div key={i} style={{ background: "#0a0a0a", border: "1px solid #111", borderRadius: 7, padding: "10px 12px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", justifyContent: "space-between" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 5, marginBottom: 4, flexWrap: "wrap" as const, alignItems: "center" }}>
                    <Badge label={p.postType === "video" ? "🎬 video" : "manual"} color={p.postType === "video" ? PURPLE : "#555"} />
                    {p.category && <Badge label={p.category} color="#333" />}
                    <span style={{ fontSize: 10, color: "#333" }}>{ago(p.postedAt)}</span>
                    {p.sourceName && <span style={{ fontSize: 10, color: "#333" }}>· {p.sourceName}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#ccc", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.title}</div>
                  {p.url && (
                    <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center" }}>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#333", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, flex: 1 }}>{p.url.slice(0, 60)}…</a>
                      <button onClick={() => onCompose(p.url)} style={{ background: "none", border: "1px solid #1a1a1a", color: "#444", borderRadius: 4, padding: "2px 7px", fontSize: 9, cursor: "pointer", flexShrink: 0 }}>Re-post</button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 2, flexShrink: 0, alignItems: "flex-end" }}>
                  <span style={{ fontSize: 11, color: p.instagram?.success ? GREEN : RED, fontWeight: 800 }}>IG {p.instagram?.success ? "✓" : "✗"}</span>
                  <span style={{ fontSize: 11, color: p.facebook?.success ? GREEN : RED, fontWeight: 800 }}>FB {p.facebook?.success ? "✓" : "✗"}</span>
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
  const [tab, setTab] = useState<Tab>("cockpit");
  const [composeUrl, setComposeUrl] = useState<string | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);

  function goCompose(url: string) {
    setComposeUrl(url);
    setTab("compose");
  }

  const TABS: [Tab, string][] = [
    ["cockpit", "⚡ Cockpit"],
    ["compose", "✏️ Compose"],
    ["sources", "📡 Sources"],
    ["history", "📋 History"],
  ];

  return (
    <Shell>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} * { box-sizing: border-box; }`}</style>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px 100px" }}>
        {/* Header */}
        <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: PINK, display: "inline-block", boxShadow: `0 0 8px ${PINK}` }} />
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, letterSpacing: 3 }}>VIDEO OPS</span>
            </div>
            <p style={{ fontSize: 11, color: "#333", margin: 0 }}>Compose · Monitor · Scrape · Post to IG + FB</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 3, marginBottom: 22, padding: 3, background: "#0a0a0a", borderRadius: 8, border: "1px solid #1a1a1a" }}>
          {TABS.map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "9px 0", fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" as const, border: "none", borderRadius: 6, cursor: "pointer", transition: "all .15s", background: tab === t ? PINK : "transparent", color: tab === t ? "#fff" : "#444" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "cockpit" && <CockpitTab key={`cockpit-${refreshKey}`} onCompose={goCompose} />}
        {tab === "compose" && <ComposeTab key={composeUrl} initialUrl={composeUrl} onSuccess={() => { setRefreshKey(k => k + 1); setTab("cockpit"); }} />}
        {tab === "sources" && <SourcesTab key={`sources-${refreshKey}`} onCompose={goCompose} />}
        {tab === "history" && <HistoryTab key={`history-${refreshKey}`} onCompose={goCompose} />}
      </div>
    </Shell>
  );
}
