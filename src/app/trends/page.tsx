"use client";
import { useState, useEffect, useCallback } from "react";
import Shell from "../shell";

const PINK = "#FF007A";
const GREEN = "#4ade80";
const RED = "#f87171";
const ORANGE = "#f97316";
const PURPLE = "#a855f7";
const CYAN = "#22d3ee";
const YELLOW = "#facc15";

interface Trend {
  id: string;
  title: string;
  source: "twitter" | "youtube" | "reddit" | "news" | "google_trends";
  volume?: number;
  category: string;
  url?: string;
  description?: string;
  fetchedAt: string;
}

const SOURCE_COLOR: Record<string, string> = {
  twitter: CYAN, youtube: RED, reddit: ORANGE, news: PURPLE, google_trends: GREEN,
};
const SOURCE_ICON: Record<string, string> = {
  twitter: "𝕏", youtube: "▶", reddit: "🔴", news: "📰", google_trends: "🇰🇪",
};

const WORKER = "https://auto-ppp-tv.euginemicah.workers.dev";

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  return Math.floor(m / 60) + "h ago";
}

function Spin() {
  return <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,.15)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />;
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span style={{ background: color + "22", color, border: `1px solid ${color}44`, fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4, textTransform: "uppercase" as const, letterSpacing: 1 }}>{label}</span>;
}

// Fetch trending topics from multiple sources via our API
async function fetchTrends(): Promise<Trend[]> {
  const results: Trend[] = [];

  // Google Trends Kenya — always first, most authoritative
  try {
    const r = await fetch("/api/trends/google_trends");
    if (r.ok) { const d = await r.json(); results.push(...(d.trends || [])); }
  } catch {}

  // YouTube trending (Kenya) via RSS
  try {
    const r = await fetch("/api/trends/youtube");
    if (r.ok) { const d = await r.json(); results.push(...(d.trends || [])); }
  } catch {}

  // Reddit hot posts
  try {
    const r = await fetch("/api/trends/reddit");
    if (r.ok) { const d = await r.json(); results.push(...(d.trends || [])); }
  } catch {}

  // News spikes from our RSS feeds
  try {
    const r = await fetch("/api/trends/news");
    if (r.ok) { const d = await r.json(); results.push(...(d.trends || [])); }
  } catch {}

  return results.sort((a, b) => (b.volume || 0) - (a.volume || 0));
}

export default function TrendsPage() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "twitter" | "youtube" | "reddit" | "news" | "google_trends">("all");
  const [composing, setComposing] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const t = await fetchTrends();
    setTrends(t);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 5 * 60 * 1000); return () => clearInterval(t); }, [load]);

  async function postTrend(trend: Trend) {
    setComposing(trend.id);
    try {
      window.location.href = `/composer?url=${encodeURIComponent(trend.url || "")}`;
    } catch {}
    setComposing(null);
  }

  const filtered = filter === "all" ? trends : trends.filter(t => t.source === filter);
  const sources = ["all", "google_trends", "twitter", "youtube", "reddit", "news"] as const;

  return (
    <Shell>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <div style={{ padding: "28px 24px 80px", maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 24 }}>🧠</span>
              <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 3, margin: 0 }}>Trends Intelligence</h1>
            </div>
            <p style={{ fontSize: 12, color: "#555", margin: 0 }}>
              What's blowing up right now — auto-refreshes every 5 min
              {lastRefresh && <span style={{ color: "#333" }}> · updated {ago(lastRefresh.toISOString())}</span>}
            </p>
          </div>
          <button onClick={load} disabled={loading} style={{ background: loading ? "#111" : PINK, border: "none", color: "#fff", borderRadius: 8, padding: "10px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {loading ? <><Spin /> Scanning…</> : "↻ Refresh Now"}
          </button>
        </div>

        {/* Stats bar */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
          {(["google_trends", "twitter", "youtube", "reddit", "news"] as const).map(s => (
            <div key={s} style={{ background: "#0f0f0f", border: `1px solid ${SOURCE_COLOR[s]}33`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{SOURCE_ICON[s]}</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: SOURCE_COLOR[s], lineHeight: 1 }}>
                {trends.filter(t => t.source === s).length}
              </div>
              <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase" as const, marginTop: 3 }}>{s} trends</div>
            </div>
          ))}
        </div>

        {/* Source filter */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" as const }}>
          {sources.map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer", border: `1px solid ${filter === s ? PINK : "#1a1a1a"}`, background: filter === s ? PINK : "#0a0a0a", color: filter === s ? "#fff" : "#555", transition: "all .15s", textTransform: "uppercase" as const, letterSpacing: 1 }}>
              {s === "all" ? `All (${trends.length})` : `${SOURCE_ICON[s]} ${s === "google_trends" ? "Kenya Trends" : s} (${trends.filter(t => t.source === s).length})`}
            </button>
          ))}
        </div>

        {/* Trends list */}
        {loading && trends.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#333" }}>
            <Spin />
            <div style={{ marginTop: 12, fontSize: 12 }}>Scanning trending topics across all platforms…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#333", fontSize: 13 }}>No trends found for this source</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
            {filtered.map((trend, i) => (
              <div key={trend.id} style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, padding: "14px 16px", display: "flex", gap: 14, alignItems: "flex-start", transition: "border-color .15s" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#2a2a2a")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#1a1a1a")}>

                {/* Rank */}
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: i < 3 ? YELLOW : "#333", lineHeight: 1, flexShrink: 0, width: 32, textAlign: "center" as const }}>
                  {i + 1}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" as const, alignItems: "center" }}>
                    <Badge label={`${SOURCE_ICON[trend.source]} ${trend.source}`} color={SOURCE_COLOR[trend.source]} />
                    <Badge label={trend.category} color={PURPLE} />
                    {trend.volume && <span style={{ fontSize: 10, color: "#555" }}>{trend.volume.toLocaleString()} mentions</span>}
                    <span style={{ fontSize: 10, color: "#333", marginLeft: "auto" }}>{ago(trend.fetchedAt)}</span>
                  </div>
                  <div style={{ fontSize: 14, color: "#e5e5e5", fontWeight: 600, marginBottom: 4, lineHeight: 1.4 }}>{trend.title}</div>
                  {trend.description && <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>{trend.description.slice(0, 120)}{trend.description.length > 120 ? "…" : ""}</div>}
                </div>

                <div style={{ display: "flex", flexDirection: "column" as const, gap: 6, flexShrink: 0 }}>
                  <button onClick={() => postTrend(trend)} disabled={composing === trend.id || !trend.url} title={!trend.url ? "No URL available" : undefined} style={{ background: PINK, border: "none", color: "#fff", borderRadius: 6, padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: (!trend.url || composing === trend.id) ? "not-allowed" : "pointer", whiteSpace: "nowrap" as const, display: "flex", alignItems: "center", gap: 5, opacity: !trend.url ? 0.4 : 1 }}>
                    {composing === trend.id ? <><Spin /> …</> : "▶ Post This"}
                  </button>
                  {trend.url && (
                    <a href={trend.url} target="_blank" rel="noopener noreferrer" style={{ background: "none", border: "1px solid #222", color: "#555", borderRadius: 6, padding: "6px 12px", fontSize: 11, textDecoration: "none", textAlign: "center" as const }}>
                      View ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
