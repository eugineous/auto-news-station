"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Shell from "../shell";

// ── Design tokens ─────────────────────────────────────────────────────────────
const PINK    = "#FF007A";
const GREEN   = "#4ade80";
const RED     = "#f87171";
const PURPLE  = "#a855f7";
const BLUE    = "#3b82f6";
const ORANGE  = "#f97316";
const YELLOW  = "#facc15";
const CYAN    = "#22d3ee";

type Tab = "cockpit" | "compose" | "sources" | "history";
type PostStatus = "idle" | "resolving" | "posting" | "success" | "error";

const FETCH_OPTS: RequestInit = { credentials: "include" };
const WORKER      = "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_AUTH = { Authorization: "Bearer ppptvWorker2024" };

const CATS = [
  "AUTO","CELEBRITY","MUSIC","TV & FILM","FASHION","EVENTS","AWARDS",
  "EAST AFRICA","GENERAL","SPORTS","BUSINESS","POLITICS","TECHNOLOGY",
  "HEALTH","SCIENCE","LIFESTYLE","COMEDY","INFLUENCERS",
];

const CAT_COLORS: Record<string, string> = {
  CELEBRITY: "#e1306c", MUSIC: "#a855f7", "TV & FILM": "#3b82f6",
  SPORTS: "#22c55e", FASHION: "#f97316", POLITICS: "#ef4444",
  TECHNOLOGY: "#06b6d4", BUSINESS: "#eab308", COMEDY: "#f59e0b",
  INFLUENCERS: "#ec4899", "EAST AFRICA": "#10b981", GENERAL: "#6b7280",
  EVENTS: "#8b5cf6", AWARDS: "#f59e0b", HEALTH: "#14b8a6",
  SCIENCE: "#6366f1", LIFESTYLE: "#f43f5e", AUTO: "#64748b",
};

const PLATFORM_COLOR: Record<string, string> = {
  tiktok: "#ff0050", youtube: "#ff0000", instagram: "#e1306c",
  twitter: "#1da1f2", reddit: "#ff4500", dailymotion: "#0066dc",
  vimeo: "#1ab7ea", direct: "#888", "direct-mp4": "#ff0050",
};

const PLATFORM_ICON: Record<string, string> = {
  tiktok: "🎵", youtube: "▶", instagram: "📸", twitter: "𝕏",
  reddit: "🔴", dailymotion: "🎬", vimeo: "🎞", direct: "🔗", "direct-mp4": "🎵",
};

const CAPTION_TEMPLATES: Record<string, string> = {
  "🔴 Breaking News":    "BREAKING: {headline}\n\nDetails emerging — follow @ppptv for live updates. 🔴\n\n#BreakingNews #PPPTVKenya",
  "👀 Celebrity Tea":    "{headline}\n\nTag someone who needs to see this! 👀🍵\n\n#Celebrity #Entertainment #PPPTVKenya",
  "⚽ Sports Update":    "⚽ {headline}\n\nWhat do you think? Drop your thoughts below! 👇\n\n#Sports #Football #PPPTVKenya",
  "🎵 Music Release":    "🎵 {headline}\n\nStream now! Link in bio. 🔥\n\n#Music #NewMusic #PPPTVKenya",
  "🎬 Entertainment":    "{headline}\n\nShare this with someone who'd love it! 🎬\n\n#Entertainment #PPPTVKenya",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function Spin({ size = 13 }: { size?: number }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size,
      border: "2px solid rgba(255,255,255,.15)", borderTopColor: "#fff",
      borderRadius: "50%", animation: "spin .7s linear infinite", flexShrink: 0,
    }} />
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4,
      textTransform: "uppercase" as const, letterSpacing: 1, whiteSpace: "nowrap" as const,
    }}>{label}</span>
  );
}

function StatCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #0d0d0d 0%, #111 100%)",
      border: "1px solid #1a1a1a", borderRadius: 10, padding: "14px 10px", textAlign: "center" as const,
    }}>
      <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 32, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase" as const, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 9, color: "#333", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%", background: "#0a0a0a", border: "1px solid #1a1a1a",
  borderRadius: 7, padding: "11px 13px", color: "#e5e5e5", fontSize: 13,
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700, letterSpacing: 2,
  textTransform: "uppercase" as const, color: "#555", marginBottom: 7,
};

// ── Cockpit Tab ───────────────────────────────────────────────────────────────
function CockpitTab({ onCompose }: { onCompose: (url: string) => void }) {
  const [posts, setPosts]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoPost, setAutoPost]     = useState(false);
  const [autoPosting, setAutoPosting] = useState(false);
  const [viewMode, setViewMode]     = useState<"all" | "video" | "article">("all");

  const load = useCallback(async () => {
    try {
      const r = await fetch(WORKER + "/post-log", { headers: WORKER_AUTH });
      const d = await r.json() as any;
      const all = (d.log || []).sort((a: any, b: any) =>
        new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
      );
      setPosts(all);
      setLastRefresh(new Date());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  async function triggerAutoPost() {
    setAutoPosting(true);
    try {
      await fetch("/api/automate-video", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" } });
      await load();
    } catch {}
    setAutoPosting(false);
  }

  useEffect(() => {
    if (!autoPost) return;
    const t = setInterval(() => triggerAutoPost(), 12 * 60 * 1000);
    return () => clearInterval(t);
  }, [autoPost]);

  const today      = posts.filter(p => new Date(p.postedAt).toDateString() === new Date().toDateString());
  const videoToday = today.filter(p => p.postType === "video");
  const igOk       = today.filter(p => p.instagram?.success).length;
  const fbOk       = today.filter(p => p.facebook?.success).length;
  const fails      = today.filter(p => !p.instagram?.success && !p.facebook?.success).length;

  const filtered = viewMode === "all" ? posts.slice(0, 60)
    : viewMode === "video" ? posts.filter(p => p.postType === "video").slice(0, 60)
    : posts.filter(p => p.postType !== "video").slice(0, 60);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Live bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%", background: GREEN,
            display: "inline-block", boxShadow: `0 0 8px ${GREEN}`,
            animation: autoPosting ? "pulse 1s ease-in-out infinite" : "none",
          }} />
          <span style={{ fontSize: 11, color: "#555" }}>
            {autoPosting ? "POSTING…" : "LIVE"} · 15s refresh{lastRefresh ? ` · ${ago(lastRefresh.toISOString())}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Auto-post toggle */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: autoPost ? PINK + "11" : "#111",
            border: `1px solid ${autoPost ? PINK + "44" : "#222"}`,
            padding: "4px 10px", borderRadius: 20,
          }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: autoPost ? PINK : "#444", textTransform: "uppercase" as const }}>Auto</span>
            <button onClick={() => setAutoPost(!autoPost)} style={{
              width: 34, height: 18, borderRadius: 10, background: autoPost ? PINK : "#333",
              border: "none", position: "relative" as const, cursor: "pointer", transition: "all .2s",
            }}>
              <div style={{
                width: 14, height: 14, borderRadius: "50%", background: "#fff",
                position: "absolute" as const, top: 2, left: autoPost ? 18 : 2, transition: "all .2s",
              }} />
            </button>
          </div>
          <button onClick={() => triggerAutoPost()} disabled={autoPosting} style={{
            background: autoPosting ? "#111" : PINK + "22", border: `1px solid ${PINK}44`,
            color: PINK, borderRadius: 6, padding: "5px 12px", fontSize: 10, fontWeight: 700,
            cursor: autoPosting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5,
          }}>
            {autoPosting ? <><Spin size={10} /> Posting…</> : "▶ Run Now"}
          </button>
          <button onClick={load} style={{
            background: "none", border: "1px solid #222", color: "#555",
            borderRadius: 5, padding: "5px 10px", fontSize: 10, cursor: "pointer",
          }}>↻</button>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        <StatCard label="Today" value={today.length} color="#fff" sub={`${videoToday.length} videos`} />
        <StatCard label="IG ✓" value={igOk} color="#E1306C" />
        <StatCard label="FB ✓" value={fbOk} color="#1877f2" />
        <StatCard label="Fails" value={fails} color={fails > 0 ? RED : "#333"} />
      </div>

      {/* View filter */}
      <div style={{ display: "flex", gap: 3, padding: 3, background: "#0a0a0a", borderRadius: 7, border: "1px solid #1a1a1a" }}>
        {(["all", "video", "article"] as const).map(v => (
          <button key={v} onClick={() => setViewMode(v)} style={{
            flex: 1, padding: "6px 0", fontSize: 10, fontWeight: 800, letterSpacing: 1,
            textTransform: "uppercase" as const, border: "none", borderRadius: 5, cursor: "pointer",
            background: viewMode === v ? PINK : "transparent", color: viewMode === v ? "#fff" : "#444",
          }}>
            {v === "all" ? "All Posts" : v === "video" ? "🎬 Videos" : "📰 Articles"}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#333" }}><Spin size={20} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#333", fontSize: 12 }}>No posts yet</div>
        ) : filtered.map((p, i) => (
          <div key={i} style={{
            background: "#0a0a0a", border: "1px solid #111", borderRadius: 8,
            padding: "10px 12px", display: "flex", gap: 10, alignItems: "center",
          }}>
            {/* Thumbnail */}
            {p.thumbnail && (
              <img src={p.thumbnail} alt="" style={{
                width: 48, height: 60, objectFit: "cover", borderRadius: 5, flexShrink: 0,
              }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 5, marginBottom: 4, flexWrap: "wrap" as const, alignItems: "center" }}>
                {p.postType === "video" && <Badge label="🎬 video" color={PURPLE} />}
                <Badge label={p.category || "GENERAL"} color={CAT_COLORS[p.category] || "#555"} />
                {p.sourceName && <Badge label={p.sourceName} color="#333" />}
                <span style={{ fontSize: 10, color: "#333" }}>{ago(p.postedAt)}</span>
              </div>
              <div style={{ fontSize: 12, color: "#ccc", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.title}</div>
              {p.url && (
                <div style={{ display: "flex", gap: 8, marginTop: 3, alignItems: "center" }}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#333", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, flex: 1 }}>{p.url.slice(0, 60)}…</a>
                  <button onClick={() => onCompose(p.url)} style={{ background: "none", border: "1px solid #222", color: "#555", borderRadius: 4, padding: "2px 7px", fontSize: 9, cursor: "pointer", whiteSpace: "nowrap" as const, flexShrink: 0 }}>Re-post</button>
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 3, flexShrink: 0, alignItems: "flex-end" }}>
              <span style={{ fontSize: 11, color: p.instagram?.success ? GREEN : RED, fontWeight: 800 }}>IG {p.instagram?.success ? "✓" : "✗"}</span>
              <span style={{ fontSize: 11, color: p.facebook?.success ? GREEN : RED, fontWeight: 800 }}>FB {p.facebook?.success ? "✓" : "✗"}</span>
              {p.twitter && <span style={{ fontSize: 11, color: p.twitter?.success ? CYAN : "#444", fontWeight: 800 }}>𝕏 {p.twitter?.success ? "✓" : "✗"}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Compose Tab ───────────────────────────────────────────────────────────────
function ComposeTab({ initialUrl, onSuccess, onProgress }: {
  initialUrl?: string;
  onSuccess: () => void;
  onProgress: (pct: number, step: string) => void;
}) {
  const [url, setUrl]                   = useState(initialUrl || "");
  const [headline, setHeadline]         = useState("");
  const [caption, setCaption]           = useState("");
  const [category, setCategory]         = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("composer:category") || "GENERAL";
    return "GENERAL";
  });
  const [thumbUrl, setThumbUrl]         = useState("");
  const [thumbSrc, setThumbSrc]         = useState<string | null>(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [fetching, setFetching]         = useState(false);
  const [refining, setRefining]         = useState(false);
  const [status, setStatus]             = useState<PostStatus>("idle");
  const [result, setResult]             = useState<any>(null);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState("");
  const [platform, setPlatform]         = useState("");
  const [showPlayer, setShowPlayer]     = useState(false);
  const [playerError, setPlayerError]   = useState(false);
  const [copied, setCopied]             = useState(false);
  const [igOnly, setIgOnly]             = useState(false);
  const [fbOnly, setFbOnly]             = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [tone, setTone]                 = useState<"formal" | "casual" | "hype">("casual");
  const [dupWarning, setDupWarning]     = useState(false);
  const [sourceMeta, setSourceMeta]     = useState<{ name?: string; date?: string } | null>(null);
  const [scheduleAt, setScheduleAt]     = useState("");
  const [testMode, setTestMode]         = useState(false);
  const [language, setLanguage]         = useState<"english" | "swahili">("english");
  const [bulkMode, setBulkMode]         = useState(false);
  const [bulkUrls, setBulkUrls]         = useState("");
  const [bulkQueue, setBulkQueue]       = useState<{ url: string; status: "pending" | "posting" | "done" | "error"; msg?: string }[]>([]);
  const [bulkRunning, setBulkRunning]   = useState(false);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist category
  useEffect(() => { localStorage.setItem("composer:category", category); }, [category]);

  // Auto-fetch on URL change (600ms debounce)
  useEffect(() => {
    if (!url.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doFetch(), 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [url]);

  // Regenerate thumbnail on headline/category change
  useEffect(() => {
    if (!headline.trim() || !thumbUrl) return;
    if (thumbDebounce.current) clearTimeout(thumbDebounce.current);
    thumbDebounce.current = setTimeout(() => {
      setThumbLoading(true);
      const src = `/api/preview-image?${new URLSearchParams({ title: headline, category, imageUrl: thumbUrl })}`;
      const img = new Image();
      img.onload = () => { setThumbSrc(src); setThumbLoading(false); };
      img.onerror = () => setThumbLoading(false);
      img.src = src;
    }, 500);
  }, [headline, category, thumbUrl]);

  // Keyboard shortcut Ctrl/Cmd+Enter
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canPost) handlePost();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => { if (initialUrl) { setUrl(initialUrl); doFetch(initialUrl); } }, [initialUrl]);

  async function doFetch(u?: string) {
    const target = (u || url).trim();
    if (!target) return;
    setFetching(true);
    setResolvedVideoUrl(""); setPlatform(""); setShowPlayer(false); setPlayerError(false); setDupWarning(false);
    try {
      const [previewRes, resolveRes] = await Promise.all([
        fetch("/api/preview-url", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target, language }) }),
        fetch("/api/resolve-video", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target }) }),
      ]);
      const preview = await previewRes.json() as any;
      const resolve = await resolveRes.json() as any;
      const img = preview.scraped?.videoThumbnailUrl || preview.scraped?.imageUrl || "";
      if (img) setThumbUrl(img);
      if (preview.ai?.clickbaitTitle) setHeadline(preview.ai.clickbaitTitle.toUpperCase().slice(0, 120));
      else if (preview.scraped?.title) setHeadline(preview.scraped.title.toUpperCase().slice(0, 120));
      if (preview.ai?.caption) setCaption(preview.ai.caption);
      if (preview.category) setCategory(preview.category);
      if (preview.scraped?.sourceName || preview.scraped?.publishedAt) {
        setSourceMeta({ name: preview.scraped.sourceName, date: preview.scraped.publishedAt });
      }
      if (resolve.success && resolve.videoUrl) { setResolvedVideoUrl(resolve.videoUrl); setPlatform(resolve.platform || ""); }
      // Dup check
      try {
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(target)))).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
        const dc = await fetch(WORKER + "/seen/check", { method: "POST", headers: { "Content-Type": "application/json", ...WORKER_AUTH }, body: JSON.stringify({ ids: [hash], titles: [] }) });
        const dd = await dc.json() as any;
        if (dd.seen?.length > 0) setDupWarning(true);
      } catch {}
    } catch {}
    setFetching(false);
  }

  async function handleRefine() {
    if (!url.trim() || refining) return;
    setRefining(true);
    try {
      const r = await fetch("/api/preview-url", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim(), tone, language }) });
      const d = await r.json() as any;
      if (d.ai?.clickbaitTitle) setHeadline(d.ai.clickbaitTitle.toUpperCase().slice(0, 120));
      if (d.ai?.caption) setCaption(d.ai.caption);
    } catch {}
    setRefining(false);
  }

  async function handlePost() {
    if (!url.trim() || !headline.trim() || !caption.trim() || status === "posting" || status === "resolving") return;
    setStatus("posting"); setResult(null);
    // Log to localStorage
    const log = JSON.parse(localStorage.getItem("composer:log") || "[]");
    log.unshift({ ts: new Date().toISOString(), url: url.trim(), headline, caption, category });
    localStorage.setItem("composer:log", JSON.stringify(log.slice(0, 20)));
    try {
      // Schedule removed — post immediately
      const resp = await fetch("/api/post-video", {
        ...FETCH_OPTS, method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), headline: headline.trim(), caption: caption.trim() + `\n\nSource: ${url.trim()}`, category, igOnly, fbOnly, ...(testMode ? { testMode: true } : {}) }),
      });
      if (!resp.ok || !resp.body) throw new Error("Post request failed: HTTP " + resp.status);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            onProgress(evt.pct, evt.step);
            if (evt.done) {
              setResult(evt);
              setStatus(evt.success ? "success" : "error");
              if (evt.success) {
                setTimeout(() => {
                  setUrl(""); setHeadline(""); setCaption(""); setThumbUrl(""); setThumbSrc(null);
                  setResolvedVideoUrl(""); setStatus("idle"); setShowPlayer(false); setSourceMeta(null);
                  onSuccess();
                }, 3000);
              }
            }
          } catch {}
        }
      }
    } catch (e: any) { setResult({ error: e.message }); setStatus("error"); }
  }

  function copyCaption() {
    navigator.clipboard.writeText(caption).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  function applyTemplate(key: string) {
    const t = CAPTION_TEMPLATES[key];
    if (t) setCaption(t.replace("{headline}", headline || "…"));
    setShowTemplates(false);
  }

  function resetForm() {
    setUrl(""); setHeadline(""); setCaption(""); setThumbUrl(""); setThumbSrc(null);
    setResolvedVideoUrl(""); setStatus("idle"); setShowPlayer(false); setResult(null); setSourceMeta(null);
  }

  async function handleBulkPost() {
    const urls = bulkUrls.split("\n").map(u => u.trim()).filter(Boolean).slice(0, 5);
    if (urls.length === 0) return;
    setBulkRunning(true);
    setBulkQueue(urls.map(u => ({ url: u, status: "pending" as const })));
    for (let i = 0; i < urls.length; i++) {
      const u = urls[i];
      setBulkQueue(q => q.map((item, idx) => idx === i ? { ...item, status: "posting" } : item));
      try {
        const resp = await fetch("/api/post-video", {
          ...FETCH_OPTS, method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: u, headline: u, caption: u, category: "GENERAL", ...(testMode ? { testMode: true } : {}) }),
        });
        if (!resp.ok || !resp.body) throw new Error("HTTP " + resp.status);
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let finalEvt: any = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n"); buf = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try { const evt = JSON.parse(line.slice(6)); if (evt.done) finalEvt = evt; } catch {}
          }
        }
        const ok = finalEvt?.success || finalEvt?.instagram?.success || finalEvt?.facebook?.success;
        setBulkQueue(q => q.map((item, idx) => idx === i ? { ...item, status: ok ? "done" : "error", msg: ok ? "Posted ✓" : (finalEvt?.error || "Failed") } : item));
      } catch (e: any) {
        setBulkQueue(q => q.map((item, idx) => idx === i ? { ...item, status: "error", msg: e.message } : item));
      }
      if (i < urls.length - 1) await new Promise(r => setTimeout(r, 8000));
    }
    setBulkRunning(false);
  }

  const canPost = url.trim() && headline.trim() && caption.trim() && status !== "posting" && status !== "resolving";
  const catColor = CAT_COLORS[category] || "#555";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* URL input */}
      <div>
        <label style={lbl}>Video URL <span style={{ color: "#333", fontWeight: 400, textTransform: "none" as const }}>— TikTok · YouTube · Instagram · Twitter/X · Reddit · .mp4</span></label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={url}
            onChange={e => { setUrl(e.target.value); setResolvedVideoUrl(""); setShowPlayer(false); }}
            placeholder="Paste any video URL…"
            style={{ ...inp, flex: 1, borderColor: dupWarning ? ORANGE + "66" : "#1a1a1a" }}
          />
          <button onClick={() => doFetch()} disabled={!url.trim() || fetching} style={{
            background: url.trim() && !fetching ? PINK : "#111", border: "none", color: "#fff",
            borderRadius: 7, padding: "11px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
            whiteSpace: "nowrap" as const, display: "flex", alignItems: "center", gap: 6,
          }}>
            {fetching ? <><Spin /> Fetching…</> : "Fetch"}
          </button>
        </div>

        {/* Source meta */}
        {sourceMeta && !fetching && (
          <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
            {sourceMeta.name && <Badge label={sourceMeta.name} color="#444" />}
            {sourceMeta.date && <span style={{ fontSize: 10, color: "#333" }}>{new Date(sourceMeta.date).toLocaleDateString()}</span>}
          </div>
        )}

        {/* Dup warning */}
        {dupWarning && (
          <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: ORANGE }}>⚠ This URL may have already been posted</span>
          </div>
        )}

        {/* Video ready */}
        {resolvedVideoUrl && !fetching && (
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: GREEN, display: "inline-block" }} />
            <span style={{ fontSize: 10, color: GREEN }}>Video ready</span>
            {platform && <Badge label={(PLATFORM_ICON[platform] || "") + " " + platform} color={PLATFORM_COLOR[platform] || "#888"} />}
            <button onClick={() => { setShowPlayer(p => !p); setPlayerError(false); }} style={{
              background: showPlayer ? "#222" : PINK, border: "none", color: "#fff",
              borderRadius: 4, padding: "3px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer",
            }}>
              {showPlayer ? "▼ Hide" : "▶ Preview"}
            </button>
          </div>
        )}
      </div>

      {/* Inline video player */}
      {showPlayer && resolvedVideoUrl && (
        <div style={{ borderRadius: 10, overflow: "hidden", background: "#000", border: "1px solid #1a1a1a" }}>
          {playerError ? (
            <div style={{ padding: 20, textAlign: "center", color: "#555", fontSize: 12 }}>
              Can't play inline — <a href={resolvedVideoUrl} target="_blank" rel="noopener noreferrer" style={{ color: PINK }}>open in new tab ↗</a>
            </div>
          ) : (
            <video src={`/api/proxy-video?url=${encodeURIComponent(resolvedVideoUrl)}`} controls style={{ width: "100%", maxHeight: 360, display: "block" }} onError={() => setPlayerError(true)} />
          )}
        </div>
      )}

      {/* Category */}
      <div>
        <label style={lbl}>Category</label>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
          {CATS.map(c => (
            <button key={c} onClick={() => setCategory(c)} style={{
              padding: "4px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${category === c ? catColor : "#1a1a1a"}`,
              background: category === c ? catColor + "22" : "#0a0a0a",
              color: category === c ? catColor : "#555", transition: "all .15s",
            }}>{c}</button>
          ))}
        </div>
      </div>

      {/* Headline + thumbnail */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
            <label style={{ ...lbl, marginBottom: 0 }}>Headline <span style={{ color: "#333", fontWeight: 400, textTransform: "none" as const }}>(thumbnail overlay)</span></label>
            <div style={{ display: "flex", gap: 6 }}>
              {/* Tone selector */}
              <div style={{ display: "flex", gap: 2 }}>
                {(["formal", "casual", "hype"] as const).map(t => (
                  <button key={t} onClick={() => setTone(t)} style={{
                    padding: "2px 7px", borderRadius: 4, fontSize: 9, fontWeight: 700, cursor: "pointer",
                    border: `1px solid ${tone === t ? CYAN + "66" : "#222"}`,
                    background: tone === t ? CYAN + "22" : "transparent",
                    color: tone === t ? CYAN : "#444", textTransform: "capitalize" as const,
                  }}>{t}</button>
                ))}
              </div>
              <button onClick={handleRefine} disabled={!url.trim() || refining} style={{
                background: "none", border: `1px solid ${PINK}44`, color: PINK,
                borderRadius: 4, padding: "2px 8px", fontSize: 9, fontWeight: 700,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
              }}>
                {refining ? <><Spin size={9} /> Refining…</> : "✨ AI Refine"}
              </button>
            </div>
          </div>
          <input value={headline} onChange={e => setHeadline(e.target.value.toUpperCase())} placeholder="TYPE YOUR HEADLINE IN CAPS" maxLength={120} style={{ ...inp, textTransform: "uppercase" as const, letterSpacing: 1 }} />
          <span style={{ fontSize: 10, color: headline.length > 100 ? ORANGE : "#333", marginTop: 4, display: "block" }}>{headline.length}/120</span>
        </div>
        {(thumbUrl || thumbSrc) && (
          <div style={{ flexShrink: 0, width: 80, position: "relative" as const }}>
            <label style={{ ...lbl, marginBottom: 5 }}>Cover</label>
            {thumbLoading && (
              <div style={{ position: "absolute" as const, inset: 0, top: 22, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, zIndex: 2 }}>
                <Spin />
              </div>
            )}
            <div style={{ position: "relative" as const }}>
              <img
                src={thumbSrc || `/api/preview-image?${new URLSearchParams({ title: headline || "PPP TV", category, imageUrl: thumbUrl })}`}
                alt=""
                style={{ width: 80, aspectRatio: "4/5", objectFit: "cover", borderRadius: 6, display: "block", opacity: thumbLoading ? 0.3 : 1, border: `2px solid ${catColor}44` }}
              />
              <button onClick={() => { setThumbLoading(true); const src = `/api/preview-image?${new URLSearchParams({ title: headline || "PPP TV", category, imageUrl: thumbUrl })}&t=${Date.now()}`; const img = new Image(); img.onload = () => { setThumbSrc(src); setThumbLoading(false); }; img.onerror = () => setThumbLoading(false); img.src = src; }} style={{
                position: "absolute" as const, bottom: 4, right: 4, background: "rgba(0,0,0,.8)", border: "none",
                color: "#fff", borderRadius: 3, padding: "2px 5px", fontSize: 8, cursor: "pointer",
              }}>↻</button>
            </div>
          </div>
        )}
      </div>

      {/* Caption */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>Caption</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {/* Templates */}
            <div style={{ position: "relative" as const }}>
              <button onClick={() => setShowTemplates(!showTemplates)} style={{
                background: "none", border: "1px solid #222", color: "#555",
                borderRadius: 4, padding: "2px 8px", fontSize: 9, fontWeight: 700, cursor: "pointer",
              }}>📋 Templates</button>
              {showTemplates && (
                <div style={{
                  position: "absolute" as const, right: 0, top: "100%", marginTop: 4, zIndex: 100,
                  background: "#111", border: "1px solid #222", borderRadius: 8, padding: 6, minWidth: 200,
                }}>
                  {Object.keys(CAPTION_TEMPLATES).map(k => (
                    <button key={k} onClick={() => applyTemplate(k)} style={{
                      display: "block", width: "100%", textAlign: "left" as const, background: "none",
                      border: "none", color: "#ccc", padding: "6px 10px", fontSize: 11, cursor: "pointer",
                      borderRadius: 5,
                    }}>{k}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={copyCaption} style={{
              background: copied ? GREEN + "22" : "none", border: `1px solid ${copied ? GREEN + "44" : "#222"}`,
              color: copied ? GREEN : "#555", borderRadius: 4, padding: "2px 8px", fontSize: 9, fontWeight: 700, cursor: "pointer",
            }}>{copied ? "✓ Copied!" : "Copy"}</button>
            <button onClick={handleRefine} disabled={!url.trim() || refining} style={{
              background: "none", border: `1px solid ${PINK}44`, color: PINK,
              borderRadius: 4, padding: "2px 8px", fontSize: 9, fontWeight: 700,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
            }}>
              {refining ? <><Spin size={9} /> Refining…</> : "✨ AI Refine"}
            </button>
          </div>
        </div>
        <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Write your caption…" rows={5} style={{ ...inp, resize: "vertical" as const }} />
        <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
          <span style={{ fontSize: 10, color: caption.length > 2000 ? ORANGE : "#333" }}>{caption.length}/2200 chars</span>
          <span style={{ fontSize: 10, color: "#333" }}>{caption.split(/\s+/).filter(Boolean).length} words</span>
        </div>
      </div>

      {/* Platform toggles */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "#444", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" as const }}>Post to:</span>
        {[
          { label: "IG + FB", active: !igOnly && !fbOnly, onClick: () => { setIgOnly(false); setFbOnly(false); } },
          { label: "IG only", active: igOnly, onClick: () => { setIgOnly(true); setFbOnly(false); } },
          { label: "FB only", active: fbOnly, onClick: () => { setFbOnly(true); setIgOnly(false); } },
        ].map(opt => (
          <button key={opt.label} onClick={opt.onClick} style={{
            padding: "4px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${opt.active ? PINK : "#222"}`,
            background: opt.active ? PINK + "22" : "transparent",
            color: opt.active ? PINK : "#444",
          }}>{opt.label}</button>
        ))}
        <button onClick={resetForm} style={{
          marginLeft: "auto", background: "none", border: "1px solid #222", color: "#444",
          borderRadius: 5, padding: "4px 10px", fontSize: 10, cursor: "pointer",
        }}>✕ Reset</button>
      </div>

      {/* Language selector */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "#444", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" as const }}>Language:</span>
        {(["english", "swahili"] as const).map(lang => (
          <button key={lang} onClick={() => setLanguage(lang)} style={{
            padding: "4px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${language === lang ? CYAN : "#222"}`,
            background: language === lang ? CYAN + "22" : "transparent",
            color: language === lang ? CYAN : "#444",
            textTransform: "capitalize" as const,
          }}>{lang}</button>
        ))}
      </div>

      {/* Test Mode + Bulk Mode toggles */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const }}>
        <button onClick={() => setTestMode(!testMode)} style={{
          display: "flex", alignItems: "center", gap: 6,
          background: testMode ? YELLOW + "11" : "#111",
          border: `1px solid ${testMode ? YELLOW + "44" : "#222"}`,
          padding: "5px 12px", borderRadius: 20, cursor: "pointer",
        }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: testMode ? YELLOW : "#444", textTransform: "uppercase" as const }}>🧪 Test Mode</span>
          <div style={{ width: 28, height: 15, borderRadius: 8, background: testMode ? YELLOW : "#333", border: "none", position: "relative" as const, cursor: "pointer" }}>
            <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 2, left: testMode ? 15 : 2, transition: "all .2s" }} />
          </div>
        </button>
        <button onClick={() => setBulkMode(!bulkMode)} style={{
          display: "flex", alignItems: "center", gap: 6,
          background: bulkMode ? ORANGE + "11" : "#111",
          border: `1px solid ${bulkMode ? ORANGE + "44" : "#222"}`,
          padding: "5px 12px", borderRadius: 20, cursor: "pointer",
        }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: bulkMode ? ORANGE : "#444", textTransform: "uppercase" as const }}>📦 Bulk Post</span>
          <div style={{ width: 28, height: 15, borderRadius: 8, background: bulkMode ? ORANGE : "#333", border: "none", position: "relative" as const, cursor: "pointer" }}>
            <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 2, left: bulkMode ? 15 : 2, transition: "all .2s" }} />
          </div>
        </button>
      </div>

      {/* Bulk Post UI */}
      {bulkMode && (
        <div style={{ background: "#0a0a0a", border: `1px solid ${ORANGE}33`, borderRadius: 9, padding: "14px 16px", display: "flex", flexDirection: "column" as const, gap: 10 }}>
          <label style={{ ...lbl, color: ORANGE }}>Bulk URLs <span style={{ color: "#333", fontWeight: 400, textTransform: "none" as const }}>(up to 5, one per line)</span></label>
          <textarea
            value={bulkUrls}
            onChange={e => setBulkUrls(e.target.value)}
            placeholder={"https://tiktok.com/...\nhttps://youtube.com/...\nhttps://instagram.com/..."}
            rows={5}
            style={{ ...inp, resize: "vertical" as const }}
          />
          <button onClick={handleBulkPost} disabled={bulkRunning || !bulkUrls.trim()} style={{
            background: bulkRunning ? "#111" : ORANGE, border: "none", color: "#fff",
            borderRadius: 7, padding: "11px", fontSize: 12, fontWeight: 800, cursor: bulkRunning ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {bulkRunning ? <><Spin /> Posting queue…</> : `▶ Post ${bulkUrls.split("\n").filter(u => u.trim()).slice(0, 5).length} URLs`}
          </button>
          {bulkQueue.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              {bulkQueue.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11 }}>
                  <span style={{ color: item.status === "done" ? GREEN : item.status === "error" ? RED : item.status === "posting" ? ORANGE : "#444", fontWeight: 700, flexShrink: 0 }}>
                    {item.status === "done" ? "✓" : item.status === "error" ? "✗" : item.status === "posting" ? "…" : "○"}
                  </span>
                  <span style={{ flex: 1, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{item.url.slice(0, 50)}…</span>
                  {item.msg && <span style={{ color: item.status === "done" ? GREEN : RED, fontSize: 10 }}>{item.msg}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule input */}
      <div>
        <label style={lbl}>Schedule <span style={{ color: "#333", fontWeight: 400, textTransform: "none" as const }}>(optional — leave blank to post now)</span></label>
        <input
          type="datetime-local"
          value={scheduleAt}
          onChange={e => setScheduleAt(e.target.value)}
          style={{ ...inp, colorScheme: "dark" }}
        />
        {scheduleAt && (
          <div style={{ marginTop: 5, fontSize: 10, color: CYAN }}>
            📅 Will be scheduled for {new Date(scheduleAt).toLocaleString()} — calls /api/schedule-post
          </div>
        )}
      </div>

      {/* Post button */}
      <button onClick={handlePost} disabled={!canPost} style={{
        width: "100%", padding: "15px 0", fontSize: 13, fontWeight: 800, letterSpacing: 2,
        textTransform: "uppercase" as const, color: "#fff",
        background: canPost ? `linear-gradient(135deg, ${PINK} 0%, #c0006a 100%)` : "#111",
        border: "none", borderRadius: 9, cursor: canPost ? "pointer" : "not-allowed",
        opacity: canPost ? 1 : 0.5, transition: "all .15s",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        boxShadow: canPost ? `0 4px 20px ${PINK}44` : "none",
      }}>
        {status === "resolving" || status === "posting"
          ? <><Spin /> {status === "resolving" ? "Resolving…" : scheduleAt ? "Scheduling…" : "Posting to IG + FB (~60s)…"}</>
          : scheduleAt ? "📅 Schedule Post" : "🎬 Post Video to IG + FB"}
      </button>
      <div style={{ textAlign: "center", fontSize: 10, color: "#333", marginTop: -10 }}>Ctrl+Enter to post</div>

      {/* Result */}
      {result && status !== "idle" && status !== "resolving" && status !== "posting" && (
        <div style={{
          borderRadius: 9, padding: "14px 16px",
          background: status === "success" ? "rgba(74,222,128,.06)" : "rgba(248,113,113,.06)",
          border: `1px solid ${status === "success" ? GREEN + "44" : RED + "44"}`,
        }}>
          {status === "success" ? (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 5 }}>
              {result.scheduled
                ? <span style={{ fontWeight: 700, color: CYAN, fontSize: 13 }}>📅 Scheduled successfully (ID: {result.id})</span>
                : <span style={{ fontWeight: 700, color: GREEN, fontSize: 13 }}>✓ Posted successfully</span>}
              {!result.scheduled && result.instagram?.success && <span style={{ fontSize: 11, color: "#aaa" }}>Instagram ✓ {result.instagram.postId}</span>}
              {!result.scheduled && result.facebook?.success && <span style={{ fontSize: 11, color: "#aaa" }}>Facebook ✓ {result.facebook.postId}</span>}
              {!result.scheduled && result.twitter?.success && <span style={{ fontSize: 11, color: "#aaa" }}>X (Twitter) ✓ {result.twitter.postId}</span>}
              {!result.scheduled && !result.instagram?.success && <span style={{ fontSize: 11, color: RED }}>Instagram ✗ {result.instagram?.error}</span>}
              {!result.scheduled && !result.facebook?.success && <span style={{ fontSize: 11, color: RED }}>Facebook ✗ {result.facebook?.error}</span>}
              {!result.scheduled && result.twitter && !result.twitter?.success && <span style={{ fontSize: 11, color: RED }}>X ✗ {result.twitter?.error}</span>}
            </div>
          ) : <span style={{ color: RED, fontSize: 13 }}>{result.error || "Post failed"}</span>}
        </div>
      )}
    </div>
  );
}

// ── Progress Panel ────────────────────────────────────────────────────────────
function ProgressPanel({ pct, step, onDismiss }: { pct: number; step: string; onDismiss: () => void }) {
  const done  = pct >= 100;
  const isErr = step.toLowerCase().startsWith("error");
  const color = isErr ? RED : done ? GREEN : PINK;

  const STEPS = [
    { label: "Scraping metadata",      range: [0, 15] },
    { label: "Generating thumbnail",   range: [15, 25] },
    { label: "Downloading video",      range: [25, 50] },
    { label: "Staging to R2",          range: [50, 60] },
    { label: "Staging cover image",    range: [60, 65] },
    { label: "Instagram processing",   range: [65, 90] },
    { label: "Facebook upload",        range: [90, 97] },
    { label: "Done",                   range: [97, 100] },
  ];

  return (
    <div style={{
      position: "fixed" as const, bottom: 80, right: 16, width: 290,
      background: "#0d0d0d", border: `1px solid ${color}44`, borderRadius: 12,
      padding: "14px 16px", zIndex: 1000, boxShadow: `0 8px 32px rgba(0,0,0,.7)`,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {!done && <Spin size={11} />}
          <span style={{ fontSize: 11, fontWeight: 800, color, letterSpacing: 1, textTransform: "uppercase" as const }}>
            {done ? (isErr ? "Failed" : "Posted ✓") : "Posting…"}
          </span>
        </div>
        {done && <button onClick={onDismiss} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>}
      </div>
      <div style={{ height: 4, background: "#1a1a1a", borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width .4s ease" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
        {STEPS.map((s, i) => {
          const active   = pct >= s.range[0] && pct < s.range[1];
          const complete = pct >= s.range[1];
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, opacity: complete || active ? 1 : 0.3 }}>
              <span style={{
                width: 14, height: 14, borderRadius: "50%",
                background: complete ? GREEN : active ? PINK : "#1a1a1a",
                border: `1px solid ${complete ? GREEN : active ? PINK : "#333"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, fontSize: 8,
              }}>{complete ? "✓" : ""}</span>
              <span style={{ fontSize: 10, color: complete ? GREEN : active ? "#fff" : "#444" }}>{s.label}</span>
              {active && <span style={{ fontSize: 9, color: PINK, marginLeft: "auto" }}>{pct}%</span>}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color: "#555", borderTop: "1px solid #1a1a1a", paddingTop: 8 }}>{step}</div>
    </div>
  );
}

// ── Sources Tab — Video-First ─────────────────────────────────────────────────
function SourcesTab({ onCompose }: { onCompose: (url: string) => void }) {
  const [videos, setVideos]           = useState<any[]>([]);
  const [feedStatus, setFeedStatus]   = useState<any[]>([]);
  const [loading, setLoading]         = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [posting, setPosting]         = useState<string | null>(null);
  const [postResults, setPostResults] = useState<Record<string, { ig: boolean; fb: boolean; err?: string }>>({});
  const [filter, setFilter]           = useState("ALL");
  const [catFilter, setCatFilter]     = useState("ALL");
  const [view, setView]               = useState<"feeds" | "videos">("videos");
  const [search, setSearch]           = useState("");

  const PLATFORM_LABELS: Record<string, string> = {
    tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram",
    twitter: "Twitter/X", reddit: "Reddit", dailymotion: "Dailymotion",
    vimeo: "Vimeo", "direct-mp4": "TikTok", direct: "Direct",
  };

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
      const r = await fetch("/api/automate-video", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer ppptvWorker2024" } });
      const d = await r.json() as any;
      setVideos(d.videos || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    loadFeedStatus();
    loadVideos();
  }, []);

  async function quickPost(video: any) {
    setPosting(video.id);
    try {
      const resp = await fetch("/api/post-video", {
        ...FETCH_OPTS, method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: video.directVideoUrl || video.url,
          headline: video.title.toUpperCase().slice(0, 100),
          caption: `${video.title}\n\nCredit: ${video.sourceName} | ${video.url}`,
          category: video.category || "GENERAL",
        }),
      });
      if (!resp.ok || !resp.body) throw new Error("HTTP " + resp.status);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.done) {
              setPostResults(prev => ({ ...prev, [video.id]: { ig: !!evt.instagram?.success, fb: !!evt.facebook?.success, err: evt.error } }));
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setPostResults(prev => ({ ...prev, [video.id]: { ig: false, fb: false, err: e.message } }));
    }
    setPosting(null);
  }

  const platforms = ["ALL", ...Array.from(new Set(videos.map((v: any) => v.sourceType || "unknown")))];
  const cats      = ["ALL", ...Array.from(new Set(videos.map((v: any) => v.category || "GENERAL")))];
  const healthy   = feedStatus.filter((f: any) => f.ok).length;

  const filtered = videos.filter((v: any) => {
    if (filter !== "ALL" && v.sourceType !== filter) return false;
    if (catFilter !== "ALL" && v.category !== catFilter) return false;
    if (search && !v.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* View toggle */}
      <div style={{ display: "flex", gap: 3, padding: 3, background: "#0a0a0a", borderRadius: 7, border: "1px solid #1a1a1a" }}>
        {(["videos", "feeds"] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            flex: 1, padding: "7px 0", fontSize: 10, fontWeight: 800, letterSpacing: 1,
            textTransform: "uppercase" as const, border: "none", borderRadius: 5, cursor: "pointer",
            background: view === v ? PINK : "transparent", color: view === v ? "#fff" : "#444",
          }}>
            {v === "videos" ? "🎬 Video Queue" : "📡 Feed Health"}
          </button>
        ))}
      </div>

      {/* ── VIDEO QUEUE ── */}
      {view === "videos" && (
        <>
          {/* Stats + controls */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#555" }}>{filtered.length} / {videos.length} videos</span>
              <span style={{ fontSize: 10, color: "#333" }}>from {new Set(videos.map((v: any) => v.sourceName)).size} sources</span>
            </div>
            <button onClick={loadVideos} disabled={loading} style={{
              background: loading ? "#111" : PINK + "22", border: `1px solid ${loading ? "#222" : PINK + "44"}`,
              color: loading ? "#555" : PINK, borderRadius: 6, padding: "5px 12px",
              fontSize: 10, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              {loading ? <><Spin size={10} /> Scraping…</> : "↻ Scrape All Sources"}
            </button>
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search videos…"
            style={{ ...inp, fontSize: 12 }}
          />

          {/* Platform filter */}
          {videos.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
              {platforms.map(p => (
                <button key={p} onClick={() => setFilter(p)} style={{
                  padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${filter === p ? PINK : "#1a1a1a"}`,
                  background: filter === p ? PINK : "#0a0a0a",
                  color: filter === p ? "#fff" : "#555",
                }}>
                  {(PLATFORM_ICON[p] || "") + " " + (PLATFORM_LABELS[p] || p)}
                </button>
              ))}
            </div>
          )}

          {/* Category filter */}
          {videos.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
              {cats.map(c => (
                <button key={c} onClick={() => setCatFilter(c)} style={{
                  padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${catFilter === c ? (CAT_COLORS[c] || PURPLE) : "#1a1a1a"}`,
                  background: catFilter === c ? (CAT_COLORS[c] || PURPLE) + "22" : "#0a0a0a",
                  color: catFilter === c ? (CAT_COLORS[c] || PURPLE) : "#555",
                }}>{c}</button>
              ))}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: "center", padding: 50, color: "#333" }}>
              <Spin size={24} />
              <div style={{ marginTop: 12, fontSize: 12, color: "#444" }}>Scraping 50+ sources… (~20s)</div>
              <div style={{ marginTop: 6, fontSize: 10, color: "#333" }}>TikTok · YouTube · Instagram · Reddit · Dailymotion · Vimeo</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#333", fontSize: 12 }}>
              {videos.length === 0 ? "Click \"Scrape All Sources\" to load videos" : "No videos match this filter"}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
              {filtered.map((v: any) => {
                const res       = postResults[v.id];
                const isPosting = posting === v.id;
                const platColor = PLATFORM_COLOR[v.sourceType] || "#888";
                const catColor  = CAT_COLORS[v.category] || "#555";
                return (
                  <div key={v.id} style={{
                    background: "#0a0a0a",
                    border: `1px solid ${res ? (res.ig || res.fb ? "#4ade8033" : "#f8717133") : "#111"}`,
                    borderRadius: 10, padding: "10px 12px",
                    display: "flex", gap: 10, alignItems: "flex-start",
                  }}>
                    {/* Thumbnail */}
                    <div style={{ flexShrink: 0, width: 64, height: 80, borderRadius: 6, overflow: "hidden", background: "#111", position: "relative" as const }}>
                      {v.thumbnail ? (
                        <img src={v.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                          {PLATFORM_ICON[v.sourceType] || "🎬"}
                        </div>
                      )}
                      <div style={{ position: "absolute" as const, bottom: 3, left: 3 }}>
                        <span style={{ background: platColor, color: "#fff", fontSize: 7, fontWeight: 800, padding: "1px 4px", borderRadius: 3 }}>
                          {PLATFORM_LABELS[v.sourceType] || v.sourceType}
                        </span>
                      </div>
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 5, marginBottom: 5, flexWrap: "wrap" as const, alignItems: "center" }}>
                        <Badge label={v.category || "VIDEO"} color={catColor} />
                        <span style={{ fontSize: 10, color: "#444" }}>{v.sourceName}</span>
                        {v.publishedAt && <span style={{ fontSize: 10, color: "#333" }}>· {ago(new Date(v.publishedAt).toISOString())}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#ddd", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, marginBottom: 4 }}>{v.title}</div>
                      <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#333", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, display: "block" }}>{v.url.slice(0, 55)}…</a>
                      {res && (
                        <div style={{ marginTop: 5, fontSize: 10 }}>
                          {res.err
                            ? <span style={{ color: RED }}>✗ {res.err}</span>
                            : <span style={{ color: GREEN }}>✓ Posted — IG {res.ig ? "✓" : "✗"} FB {res.fb ? "✓" : "✗"}</span>}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 5, flexShrink: 0 }}>
                      <button onClick={() => quickPost(v)} disabled={isPosting || !!res} style={{
                        background: res ? (res.ig || res.fb ? GREEN + "22" : RED + "22") : PINK,
                        border: `1px solid ${res ? (res.ig || res.fb ? GREEN + "44" : RED + "44") : "transparent"}`,
                        color: res ? (res.ig || res.fb ? GREEN : RED) : "#fff",
                        borderRadius: 6, padding: "6px 12px", fontSize: 10, fontWeight: 700,
                        cursor: isPosting || res ? "default" : "pointer",
                        display: "flex", alignItems: "center", gap: 4,
                      }}>
                        {isPosting ? <><Spin size={10} /> Posting</> : res ? (res.ig || res.fb ? "✓ Done" : "✗ Failed") : "▶ Post"}
                      </button>
                      <button onClick={() => onCompose(v.url)} style={{
                        background: "none", border: "1px solid #222", color: "#555",
                        borderRadius: 6, padding: "6px 12px", fontSize: 10, cursor: "pointer",
                      }}>✏ Edit</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── FEED HEALTH ── */}
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
                <div key={i} style={{ background: "#0a0a0a", border: `1px solid ${f.ok ? "#1a1a1a" : "#f8717122"}`, borderRadius: 7, padding: "8px 12px", display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: f.ok ? GREEN : RED, flexShrink: 0, display: "inline-block" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: f.ok ? "#ccc" : "#f87171", fontWeight: 600 }}>{f.name}</span>
                      <Badge label={f.cat} color={PURPLE} />
                    </div>
                    {f.ok
                      ? <span style={{ fontSize: 10, color: "#444" }}>{f.items} items · {f.latency}ms{f.lastItem ? ` · last: ${ago(f.lastItem)}` : ""}</span>
                      : <span style={{ fontSize: 10, color: RED }}>{f.error || `HTTP ${f.status}`}</span>}
                  </div>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 9, color: "#333", textDecoration: "none", flexShrink: 0 }}>↗</a>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────
function HistoryTab({ onCompose }: { onCompose: (url: string) => void }) {
  const [posts, setPosts]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(WORKER + "/post-log", { headers: WORKER_AUTH })
      .then(r => r.json())
      .then((d: any) => setPosts((d.log || []).sort((a: any, b: any) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const igOk  = posts.filter(p => p.instagram?.success).length;
  const fbOk  = posts.filter(p => p.facebook?.success).length;
  const both  = posts.filter(p => p.instagram?.success && p.facebook?.success).length;
  const vids  = posts.filter(p => p.postType === "video").length;

  const filtered = search
    ? posts.filter(p => p.title?.toLowerCase().includes(search.toLowerCase()) || p.url?.includes(search))
    : posts;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        <StatCard label="Total" value={posts.length} color="#fff" />
        <StatCard label="Videos" value={vids} color={PURPLE} />
        <StatCard label="IG ✓" value={igOk} color="#E1306C" />
        <StatCard label="FB ✓" value={fbOk} color="#1877f2" />
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search history…" style={{ ...inp, fontSize: 12 }} />

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#333" }}><Spin size={20} /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#333", fontSize: 12 }}>No posts found</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 5 }}>
          {filtered.map((p, i) => (
            <div key={i} style={{ background: "#0a0a0a", border: "1px solid #111", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", justifyContent: "space-between" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 5, marginBottom: 4, flexWrap: "wrap" as const, alignItems: "center" }}>
                    <Badge label={p.postType === "video" ? "🎬 video" : "manual"} color={p.postType === "video" ? PURPLE : "#555"} />
                    {p.category && <Badge label={p.category} color={CAT_COLORS[p.category] || "#333"} />}
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
  const [tab, setTab]           = useState<Tab>("sources");
  const [composeUrl, setComposeUrl] = useState<string | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  const [progress, setProgress] = useState<{ pct: number; step: string } | null>(null);

  function goCompose(url: string) { setComposeUrl(url); setTab("compose"); }
  function handleProgress(pct: number, step: string) { setProgress({ pct, step }); }

  const TABS: [Tab, string][] = [
    ["sources",  "🎬 Videos"],
    ["compose",  "✏️ Compose"],
    ["cockpit",  "⚡ Cockpit"],
    ["history",  "📋 History"],
  ];

  return (
    <Shell>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.4 } }
        * { box-sizing: border-box; }
        input:focus, textarea:focus { border-color: #FF007A44 !important; }
        button:hover { opacity: .85; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0a0a0a; } ::-webkit-scrollbar-thumb { background: #222; border-radius: 2px; }
      `}</style>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px 100px" }}>

        {/* Header */}
        <div style={{ marginBottom: 22, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: PINK, display: "inline-block", boxShadow: `0 0 12px ${PINK}`, animation: "pulse 2s ease-in-out infinite" }} />
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, letterSpacing: 4, background: `linear-gradient(135deg, #fff 0%, ${PINK} 100%)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>VIDEO OPS</span>
            </div>
            <p style={{ fontSize: 11, color: "#333", margin: 0, letterSpacing: 1 }}>SCRAPE · COMPOSE · POST TO IG + FB</p>
          </div>
          <div style={{ textAlign: "right" as const }}>
            <div style={{ fontSize: 10, color: "#333" }}>PPPTV Command Center</div>
            <div style={{ fontSize: 9, color: "#222", marginTop: 2 }}>50+ video sources</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 3, marginBottom: 22, padding: 3, background: "#0a0a0a", borderRadius: 9, border: "1px solid #1a1a1a" }}>
          {TABS.map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "10px 0", fontSize: 10, fontWeight: 800, letterSpacing: 1,
              textTransform: "uppercase" as const, border: "none", borderRadius: 7, cursor: "pointer",
              transition: "all .15s",
              background: tab === t ? `linear-gradient(135deg, ${PINK} 0%, #c0006a 100%)` : "transparent",
              color: tab === t ? "#fff" : "#444",
              boxShadow: tab === t ? `0 2px 12px ${PINK}44` : "none",
            }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "sources"  && <SourcesTab key={`sources-${refreshKey}`} onCompose={goCompose} />}
        {tab === "compose"  && <ComposeTab key={composeUrl} initialUrl={composeUrl} onSuccess={() => { setRefreshKey(k => k + 1); setTab("sources"); }} onProgress={handleProgress} />}
        {tab === "cockpit"  && <CockpitTab key={`cockpit-${refreshKey}`} onCompose={goCompose} />}
        {tab === "history"  && <HistoryTab key={`history-${refreshKey}`} onCompose={goCompose} />}
      </div>

      {progress && (
        <ProgressPanel pct={progress.pct} step={progress.step} onDismiss={() => setProgress(null)} />
      )}
    </Shell>
  );
}
