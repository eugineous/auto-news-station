"use client";
import { useState, useEffect } from "react";
import Shell from "../shell";

const RED = "#E50914", GREEN = "#4ade80", PINK = "#FF007A", PURPLE = "#a855f7";
const ORANGE = "#f97316", YELLOW = "#facc15", CYAN = "#22d3ee";

interface PostInsight {
  id: string;
  title: string;
  category: string;
  posted_at: string;
  ig_post_id?: string;
  fb_post_id?: string;
  ig_success: boolean;
  fb_success: boolean;
  // Meta Insights data
  impressions?: number;
  reach?: number;
  plays?: number;
  saves?: number;
  shares?: number;
  comments?: number;
  likes?: number;
  engagementRate?: number;
}

function Spin() { return <span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid rgba(255,255,255,.15)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />; }

function MetricCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 8, padding: "14px" }}>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase" as const, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "#333", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function ReachPage() {
  const [posts, setPosts] = useState<PostInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingInsights, setFetchingInsights] = useState(false);
  const [insightsLoaded, setInsightsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/post-log")
      .then(r => r.json())
      .then((d: any) => {
        const log = (d.log || [])
          .filter((p: any) => p.ig_success || p.fb_success)
          .slice(0, 50)
          .map((p: any) => ({
            id: p.article_id || p.articleId || String(Math.random()),
            title: p.title || "",
            category: p.category || "GENERAL",
            posted_at: p.posted_at || p.postedAt || "",
            ig_post_id: p.ig_post_id,
            fb_post_id: p.fb_post_id,
            ig_success: p.ig_success ?? false,
            fb_success: p.fb_success ?? false,
          }));
        setPosts(log);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function fetchInsights() {
    setFetchingInsights(true); setError(null);
    try {
      const r = await fetch("/api/admin/insights");
      if (!r.ok) throw new Error("Insights API failed — check Meta token");
      const d = await r.json() as any;
      if (d.posts) {
        setPosts(prev => prev.map(p => {
          const insight = d.posts.find((i: any) => i.id === p.ig_post_id || i.id === p.id);
          return insight ? { ...p, ...insight } : p;
        }));
        setInsightsLoaded(true);
      }
    } catch (e: any) {
      setError(e.message);
    }
    setFetchingInsights(false);
  }

  const withInsights = posts.filter(p => p.impressions !== undefined);
  const totalImpressions = withInsights.reduce((s, p) => s + (p.impressions || 0), 0);
  const totalReach = withInsights.reduce((s, p) => s + (p.reach || 0), 0);
  const totalPlays = withInsights.reduce((s, p) => s + (p.plays || 0), 0);
  const avgEngagement = withInsights.length > 0
    ? Math.round(withInsights.reduce((s, p) => s + (p.engagementRate || 0), 0) / withInsights.length * 10) / 10
    : 0;

  const bestPost = withInsights.sort((a, b) => (b.reach || 0) - (a.reach || 0))[0];
  const worstPost = withInsights.sort((a, b) => (a.reach || 0) - (b.reach || 0))[0];

  function ago(iso: string) {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }

  return (
    <Shell>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ padding: "28px 24px 80px", maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>📊</span>
            <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 3, margin: 0 }}>Reach & Insights</h1>
          </div>
          <button onClick={fetchInsights} disabled={fetchingInsights} style={{ background: fetchingInsights ? "#111" : PINK, border: "none", color: "#fff", borderRadius: 8, padding: "10px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {fetchingInsights ? <><Spin /> Fetching from Meta…</> : "📥 Pull Instagram Insights"}
          </button>
        </div>

        {error && (
          <div style={{ background: "#1a0808", border: "1px solid #3a1010", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: "#f87171" }}>
            ⚠ {error}
            <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>Make sure INSTAGRAM_ACCESS_TOKEN is set and has instagram_manage_insights permission.</div>
          </div>
        )}

        {!insightsLoaded && !fetchingInsights && (
          <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, padding: "20px 24px", marginBottom: 20, textAlign: "center" as const }}>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>Click "Pull Instagram Insights" to fetch real reach, impressions, and engagement data from Meta Graph API.</div>
            <div style={{ fontSize: 11, color: "#333" }}>Requires instagram_manage_insights permission on your access token.</div>
          </div>
        )}

        {insightsLoaded && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
            <MetricCard label="Total Impressions" value={totalImpressions.toLocaleString()} color="#fff" sub={`${withInsights.length} posts`} />
            <MetricCard label="Total Reach" value={totalReach.toLocaleString()} color={CYAN} />
            <MetricCard label="Total Plays" value={totalPlays.toLocaleString()} color={PURPLE} />
            <MetricCard label="Avg Engagement" value={avgEngagement + "%"} color={avgEngagement > 3 ? GREEN : avgEngagement > 1 ? YELLOW : "#f87171"} />
          </div>
        )}

        {/* Post list */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#333" }}><Spin /></div>
          ) : posts.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#333", fontSize: 12 }}>No posts found</div>
          ) : posts.map(p => {
            const cc = { CELEBRITY: "#FF007A", MUSIC: "#a855f7", SPORTS: "#22c55e", ENTERTAINMENT: "#a855f7", TECHNOLOGY: "#06b6d4" }[p.category] || "#555";
            const hasInsight = p.impressions !== undefined;
            return (
              <div key={p.id} style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" as const, alignItems: "center" }}>
                    <span style={{ background: cc + "22", color: cc, fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 3, textTransform: "uppercase" as const }}>{p.category}</span>
                    <span style={{ fontSize: 10, color: "#333" }}>{p.posted_at ? ago(p.posted_at) : ""}</span>
                    <span style={{ fontSize: 10, color: p.ig_success ? GREEN : "#f87171" }}>IG {p.ig_success ? "✓" : "✗"}</span>
                    <span style={{ fontSize: 10, color: p.fb_success ? GREEN : "#f87171" }}>FB {p.fb_success ? "✓" : "✗"}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#ccc", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.title}</div>
                </div>
                {hasInsight ? (
                  <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
                    {[
                      { label: "Reach", value: (p.reach || 0).toLocaleString(), color: CYAN },
                      { label: "Plays", value: (p.plays || 0).toLocaleString(), color: PURPLE },
                      { label: "Eng%", value: (p.engagementRate || 0).toFixed(1) + "%", color: (p.engagementRate || 0) > 3 ? GREEN : YELLOW },
                    ].map(m => (
                      <div key={m.label} style={{ textAlign: "center" as const }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: m.color }}>{m.value}</div>
                        <div style={{ fontSize: 8, color: "#444", textTransform: "uppercase" as const, letterSpacing: 1 }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: "#333", flexShrink: 0 }}>No insights yet</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
