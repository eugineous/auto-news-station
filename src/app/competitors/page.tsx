"use client";
import { useState, useEffect } from "react";
import Shell from "../shell";

const PINK = "#FF007A";
const GREEN = "#4ade80";
const RED = "#f87171";
const PURPLE = "#a855f7";
const ORANGE = "#f97316";
const YELLOW = "#facc15";
const CYAN = "#22d3ee";

interface CompetitorPost {
  title: string;
  url: string;
  publishedAt: string;
  sourceName: string;
  category: string;
  thumbnail?: string;
}

interface Competitor {
  id: string;
  name: string;
  handle: string;
  platform: "youtube" | "tiktok" | "instagram" | "twitter";
  channelId?: string;
  color: string;
  posts: CompetitorPost[];
  loading: boolean;
  lastChecked?: string;
}

const DEFAULT_COMPETITORS: Omit<Competitor, "posts" | "loading">[] = [
  { id: "citizen-tv", name: "Citizen TV Kenya", handle: "@citizentvkenya", platform: "youtube", channelId: "UCwmZiChSZyQni_AIBiYCjaA", color: "#e50914" },
  { id: "ntv-kenya", name: "NTV Kenya", handle: "@ntvkenya", platform: "youtube", channelId: "UCXyLMXgT-jg3wQHkMSMqmcA", color: "#1877f2" },
  { id: "tuko", name: "Tuko Kenya", handle: "@tukokenya", platform: "youtube", channelId: "UCBVjMGOIkavEAhyqpFGDvKg", color: "#f97316" },
  { id: "spm-buzz", name: "SPM Buzz", handle: "@spmbuzz", platform: "youtube", channelId: "UCIj8UMFMrMnFJBBiDl0AQOQ", color: "#a855f7" },
  { id: "mpasho", name: "Mpasho", handle: "@mpasho", platform: "youtube", channelId: "UCqMnmFMrMnFJBBiDl0AQOQ", color: "#22d3ee" },
];

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function Spin() {
  return <span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid rgba(255,255,255,.15)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />;
}

async function fetchYouTubeFeed(channelId: string, sourceName: string): Promise<CompetitorPost[]> {
  try {
    const r = await fetch(`/api/proxy-feed?url=${encodeURIComponent(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`)}`);
    if (!r.ok) return [];
    const xml = await r.text();
    const items: CompetitorPost[] = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    while ((match = entryRegex.exec(xml)) !== null) {
      const e = match[1];
      const videoId = (e.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1];
      const title = (e.match(/<title>(.*?)<\/title>/) || [])[1]?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") || "";
      const published = (e.match(/<published>(.*?)<\/published>/) || [])[1] || "";
      if (!videoId || !title) continue;
      items.push({
        title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt: published,
        sourceName,
        category: "VIDEO",
        thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      });
    }
    return items.slice(0, 10);
  } catch { return []; }
}

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>(
    DEFAULT_COMPETITORS.map(c => ({ ...c, posts: [], loading: false }))
  );
  const [selected, setSelected] = useState<string>(DEFAULT_COMPETITORS[0].id);
  const [addName, setAddName] = useState("");
  const [addChannelId, setAddChannelId] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  function updateComp(id: string, patch: Partial<Competitor>) {
    setCompetitors(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  async function loadCompetitor(comp: Competitor) {
    updateComp(comp.id, { loading: true });
    let posts: CompetitorPost[] = [];
    if (comp.platform === "youtube" && comp.channelId) {
      posts = await fetchYouTubeFeed(comp.channelId, comp.name);
    }
    updateComp(comp.id, { posts, loading: false, lastChecked: new Date().toISOString() });
  }

  useEffect(() => {
    // Load all competitors on mount
    competitors.forEach(c => loadCompetitor(c));
  }, []);

  function addCompetitor() {
    if (!addName.trim() || !addChannelId.trim()) return;
    const newComp: Competitor = {
      id: addChannelId,
      name: addName,
      handle: "@" + addName.toLowerCase().replace(/\s/g, ""),
      platform: "youtube",
      channelId: addChannelId,
      color: PINK,
      posts: [],
      loading: false,
    };
    setCompetitors(prev => [...prev, newComp]);
    loadCompetitor(newComp);
    setAddName(""); setAddChannelId(""); setShowAdd(false);
  }

  const current = competitors.find(c => c.id === selected);

  // Gap analysis: topics current competitor covers that we might not
  const ourCategories = ["NEWS", "CELEBRITY", "MUSIC", "TV & FILM", "SPORTS", "POLITICS", "TECHNOLOGY"];
  const theirTopics = current?.posts.map(p => p.title.toLowerCase()) || [];

  return (
    <Shell>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <div style={{ padding: "28px 24px 80px", maxWidth: 1100, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>📡</span>
            <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 3, margin: 0 }}>Competitor Monitor</h1>
          </div>
          <button onClick={() => setShowAdd(s => !s)} style={{ background: showAdd ? "#222" : PINK, border: "none", color: "#fff", borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {showAdd ? "✕ Cancel" : "+ Add Competitor"}
          </button>
        </div>

        {showAdd && (
          <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, padding: "16px 20px", marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap" as const, alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ display: "block", fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 6 }}>Channel Name</label>
              <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g. K24 TV" style={{ width: "100%", background: "#111", border: "1px solid #222", borderRadius: 6, padding: "9px 12px", color: "#e5e5e5", fontSize: 13, outline: "none" }} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: "block", fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 6 }}>YouTube Channel ID</label>
              <input value={addChannelId} onChange={e => setAddChannelId(e.target.value)} placeholder="UCxxxxxxxxxxxxxxxx" style={{ width: "100%", background: "#111", border: "1px solid #222", borderRadius: 6, padding: "9px 12px", color: "#e5e5e5", fontSize: 13, outline: "none" }} />
            </div>
            <button onClick={addCompetitor} disabled={!addName.trim() || !addChannelId.trim()} style={{ background: PINK, border: "none", color: "#fff", borderRadius: 6, padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Add</button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16 }}>
          {/* Competitor list */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
            {competitors.map(c => (
              <button key={c.id} onClick={() => setSelected(c.id)} style={{ background: selected === c.id ? "#1a0a14" : "#0a0a0a", border: `1px solid ${selected === c.id ? c.color + "66" : "#1a1a1a"}`, borderRadius: 8, padding: "12px 14px", cursor: "pointer", textAlign: "left" as const, transition: "all .15s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#ccc", fontWeight: 600 }}>{c.name}</span>
                  {c.loading && <Spin />}
                </div>
                <div style={{ fontSize: 10, color: "#444" }}>{c.posts.length} posts · {c.lastChecked ? ago(c.lastChecked) : "not loaded"}</div>
              </button>
            ))}
          </div>

          {/* Competitor detail */}
          {current && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
              {/* Header */}
              <div style={{ background: "#0a0a0a", border: `1px solid ${current.color}33`, borderRadius: 10, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 2, color: current.color }}>{current.name}</div>
                  <div style={{ fontSize: 11, color: "#555" }}>{current.handle} · {current.platform} · {current.posts.length} recent posts</div>
                </div>
                <button onClick={() => loadCompetitor(current)} disabled={current.loading} style={{ background: "none", border: `1px solid ${current.color}44`, color: current.color, borderRadius: 6, padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                  {current.loading ? <><Spin /> Loading…</> : "↻ Refresh"}
                </button>
              </div>

              {/* Posts */}
              {current.loading ? (
                <div style={{ textAlign: "center", padding: 40, color: "#333" }}><Spin /></div>
              ) : current.posts.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: "#333", fontSize: 12 }}>No posts loaded yet</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                  {current.posts.map((p, i) => (
                    <div key={i} style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center" }}>
                      {p.thumbnail && <img src={p.thumbnail} alt="" style={{ width: 80, height: 50, objectFit: "cover", borderRadius: 5, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: "#ccc", fontWeight: 600, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.title}</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 10, color: "#444" }}>{ago(p.publishedAt)}</span>
                          <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#555", textDecoration: "none" }}>View ↗</a>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <a href={`/composer?url=${encodeURIComponent(p.url)}`} style={{ background: PINK, color: "#fff", borderRadius: 5, padding: "5px 10px", fontSize: 10, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" as const }}>
                          Cover This
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
