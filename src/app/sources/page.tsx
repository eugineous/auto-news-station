"use client";
import { useState, useEffect } from "react";
import Shell from "../shell";

const RED = "#E50914", GREEN = "#4ade80", PINK = "#FF007A", PURPLE = "#a855f7";
const ORANGE = "#f97316", CYAN = "#22d3ee";

interface RSSSource { id: string; url: string; name: string; category: string; enabled: boolean; lastChecked?: string; itemCount?: number; }
interface TikTokSource { id: string; username: string; name: string; category: string; enabled: boolean; verified?: boolean; }

const CATS = ["CELEBRITY","MUSIC","SPORTS","TV & FILM","ENTERTAINMENT","COMEDY","TECHNOLOGY","GENERAL"];

const DEFAULT_RSS: RSSSource[] = [
  { id: "tuko-ent", url: "https://www.tuko.co.ke/rss/entertainment.xml", name: "Tuko Entertainment", category: "ENTERTAINMENT", enabled: true },
  { id: "tuko-celeb", url: "https://www.tuko.co.ke/rss/celebrities.xml", name: "Tuko Celebrities", category: "CELEBRITY", enabled: true },
  { id: "mpasho", url: "https://www.mpasho.co.ke/feed/", name: "Mpasho", category: "CELEBRITY", enabled: true },
  { id: "ghafla", url: "https://www.ghafla.com/ke/feed/", name: "Ghafla Kenya", category: "CELEBRITY", enabled: true },
  { id: "pulse-ke", url: "https://www.pulselive.co.ke/rss/entertainment", name: "Pulse Live Kenya", category: "ENTERTAINMENT", enabled: true },
  { id: "goal", url: "https://www.goal.com/feeds/en/news", name: "Goal Football", category: "SPORTS", enabled: true },
  { id: "sky-sports", url: "https://www.skysports.com/rss/12040", name: "Sky Sports", category: "SPORTS", enabled: true },
  { id: "tmz", url: "https://www.tmz.com/rss.xml", name: "TMZ", category: "CELEBRITY", enabled: true },
  { id: "billboard", url: "https://www.billboard.com/feed/", name: "Billboard", category: "MUSIC", enabled: true },
  { id: "variety", url: "https://variety.com/feed/", name: "Variety", category: "TV & FILM", enabled: true },
];

const DEFAULT_TIKTOK: TikTokSource[] = [
  { id: "citizen-digital", username: "citizen.digital", name: "Citizen Digital", category: "ENTERTAINMENT", enabled: true, verified: true },
  { id: "tuko-ke", username: "tukokenya", name: "Tuko Kenya", category: "ENTERTAINMENT", enabled: true, verified: true },
  { id: "spmbuzz", username: "spmbuzz", name: "SPM Buzz", category: "CELEBRITY", enabled: true, verified: true },
  { id: "bbc-swahili", username: "bbcnewsswahili", name: "BBC News Swahili", category: "ENTERTAINMENT", enabled: true, verified: true },
  { id: "fabrizio", username: "fabrizioromano", name: "Fabrizio Romano", category: "SPORTS", enabled: true, verified: true },
  { id: "skysports", username: "skysportsnews", name: "Sky Sports News", category: "SPORTS", enabled: true, verified: true },
];

function Spin() { return <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid rgba(255,255,255,.15)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />; }

export default function SourcesPage() {
  const [rssSources, setRssSources] = useState<RSSSource[]>(DEFAULT_RSS);
  const [tiktokSources, setTiktokSources] = useState<TikTokSource[]>(DEFAULT_TIKTOK);
  const [tab, setTab] = useState<"rss" | "tiktok">("rss");
  const [newRssUrl, setNewRssUrl] = useState("");
  const [newRssName, setNewRssName] = useState("");
  const [newRssCat, setNewRssCat] = useState("GENERAL");
  const [newTikUser, setNewTikUser] = useState("");
  const [newTikName, setNewTikName] = useState("");
  const [newTikCat, setNewTikCat] = useState("ENTERTAINMENT");
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; count?: number; error?: string }>>({});

  async function testRSS(source: RSSSource) {
    setTesting(source.id);
    try {
      const r = await fetch(`/api/trends/news`);
      // Simple test — just check if the URL is reachable
      const res = await fetch(source.url, { signal: AbortSignal.timeout(8000) });
      const ok = res.ok;
      const text = ok ? await res.text() : "";
      const count = (text.match(/<item>/g) || []).length;
      setTestResults(t => ({ ...t, [source.id]: { ok, count } }));
    } catch (e: any) {
      setTestResults(t => ({ ...t, [source.id]: { ok: false, error: e.message } }));
    }
    setTesting(null);
  }

  async function testTikTok(source: TikTokSource) {
    setTesting(source.id);
    try {
      const r = await fetch("/api/automate-video", { method: "POST", headers: { "Content-Type": "application/json", "X-Dry-Run": "true" } });
      const d = await r.json() as any;
      const found = (d.videos || []).some((v: any) => v.sourceName?.includes(source.username));
      setTestResults(t => ({ ...t, [source.id]: { ok: found, count: found ? 1 : 0 } }));
    } catch (e: any) {
      setTestResults(t => ({ ...t, [source.id]: { ok: false, error: e.message } }));
    }
    setTesting(null);
  }

  function addRSS() {
    if (!newRssUrl.trim() || !newRssName.trim()) return;
    const id = `custom-${Date.now()}`;
    setRssSources(s => [...s, { id, url: newRssUrl.trim(), name: newRssName.trim(), category: newRssCat, enabled: true }]);
    setNewRssUrl(""); setNewRssName("");
  }

  function addTikTok() {
    if (!newTikUser.trim()) return;
    const id = `tiktok-${Date.now()}`;
    setTiktokSources(s => [...s, { id, username: newTikUser.trim().replace("@", ""), name: newTikName.trim() || newTikUser.trim(), category: newTikCat, enabled: true }]);
    setNewTikUser(""); setNewTikName("");
  }

  const inp: React.CSSProperties = { background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 6, padding: "8px 12px", color: "#e5e5e5", fontSize: 12, outline: "none", fontFamily: "inherit" };

  return (
    <Shell>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ padding: "28px 24px 80px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <span style={{ fontSize: 24 }}>📡</span>
          <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 3, margin: 0 }}>Source Manager</h1>
        </div>

        {/* Tab toggle */}
        <div style={{ display: "flex", gap: 3, padding: 3, background: "#0a0a0a", borderRadius: 8, border: "1px solid #1a1a1a", marginBottom: 20, maxWidth: 300 }}>
          {(["rss", "tiktok"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "8px 0", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" as const, border: "none", borderRadius: 6, cursor: "pointer", background: tab === t ? PINK : "transparent", color: tab === t ? "#fff" : "#444" }}>
              {t === "rss" ? "📰 RSS Feeds" : "🎵 TikTok Accounts"}
            </button>
          ))}
        </div>

        {tab === "rss" && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {/* Add new */}
            <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, padding: "14px 16px", display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "flex-end" }}>
              <div style={{ flex: 2, minWidth: 200 }}>
                <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 5 }}>RSS URL</div>
                <input value={newRssUrl} onChange={e => setNewRssUrl(e.target.value)} placeholder="https://example.com/feed.xml" style={{ ...inp, width: "100%", boxSizing: "border-box" as const }} />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 5 }}>Name</div>
                <input value={newRssName} onChange={e => setNewRssName(e.target.value)} placeholder="Source name" style={{ ...inp, width: "100%", boxSizing: "border-box" as const }} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 5 }}>Category</div>
                <select value={newRssCat} onChange={e => setNewRssCat(e.target.value)} style={{ ...inp }}>
                  {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button onClick={addRSS} disabled={!newRssUrl.trim() || !newRssName.trim()} style={{ background: PINK, border: "none", color: "#fff", borderRadius: 6, padding: "8px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+ Add</button>
            </div>

            {rssSources.map(s => {
              const result = testResults[s.id];
              return (
                <div key={s.id} style={{ background: "#0a0a0a", border: `1px solid ${s.enabled ? "#1a1a1a" : "#0f0f0f"}`, borderRadius: 8, padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", opacity: s.enabled ? 1 : 0.5 }}>
                  <button onClick={() => setRssSources(src => src.map(x => x.id === s.id ? { ...x, enabled: !x.enabled } : x))} style={{ width: 32, height: 18, borderRadius: 10, background: s.enabled ? GREEN : "#333", border: "none", position: "relative" as const, cursor: "pointer", flexShrink: 0 }}>
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 2, left: s.enabled ? 16 : 2, transition: "all .2s" }} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#ccc", fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{s.url}</div>
                  </div>
                  <span style={{ background: (PINK + "22"), color: PINK, fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3, textTransform: "uppercase" as const, flexShrink: 0 }}>{s.category}</span>
                  {result && (
                    <span style={{ fontSize: 10, color: result.ok ? GREEN : "#f87171", flexShrink: 0 }}>
                      {result.ok ? `✓ ${result.count} items` : `✗ ${result.error?.slice(0, 20) || "failed"}`}
                    </span>
                  )}
                  <button onClick={() => testRSS(s)} disabled={testing === s.id} style={{ background: "none", border: "1px solid #222", color: "#555", borderRadius: 5, padding: "4px 10px", fontSize: 10, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
                    {testing === s.id ? <><Spin /> Testing…</> : "Test"}
                  </button>
                  <button onClick={() => setRssSources(src => src.filter(x => x.id !== s.id))} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>✕</button>
                </div>
              );
            })}
          </div>
        )}

        {tab === "tiktok" && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {/* Add new */}
            <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, padding: "14px 16px", display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 5 }}>TikTok Username</div>
                <input value={newTikUser} onChange={e => setNewTikUser(e.target.value)} placeholder="@username" style={{ ...inp, width: "100%", boxSizing: "border-box" as const }} />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 5 }}>Display Name</div>
                <input value={newTikName} onChange={e => setNewTikName(e.target.value)} placeholder="e.g. SPM Buzz" style={{ ...inp, width: "100%", boxSizing: "border-box" as const }} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 5 }}>Category</div>
                <select value={newTikCat} onChange={e => setNewTikCat(e.target.value)} style={{ ...inp }}>
                  {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button onClick={addTikTok} disabled={!newTikUser.trim()} style={{ background: PINK, border: "none", color: "#fff", borderRadius: 6, padding: "8px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+ Add</button>
            </div>

            {tiktokSources.map(s => {
              const result = testResults[s.id];
              return (
                <div key={s.id} style={{ background: "#0a0a0a", border: `1px solid ${s.enabled ? "#1a1a1a" : "#0f0f0f"}`, borderRadius: 8, padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", opacity: s.enabled ? 1 : 0.5 }}>
                  <button onClick={() => setTiktokSources(src => src.map(x => x.id === s.id ? { ...x, enabled: !x.enabled } : x))} style={{ width: 32, height: 18, borderRadius: 10, background: s.enabled ? GREEN : "#333", border: "none", position: "relative" as const, cursor: "pointer", flexShrink: 0 }}>
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 2, left: s.enabled ? 16 : 2, transition: "all .2s" }} />
                  </button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#ccc", fontWeight: 600 }}>{s.name} {s.verified && <span style={{ color: CYAN, fontSize: 10 }}>✓</span>}</div>
                    <div style={{ fontSize: 10, color: "#444" }}>@{s.username}</div>
                  </div>
                  <span style={{ background: PURPLE + "22", color: PURPLE, fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3, textTransform: "uppercase" as const, flexShrink: 0 }}>{s.category}</span>
                  {result && (
                    <span style={{ fontSize: 10, color: result.ok ? GREEN : "#f87171", flexShrink: 0 }}>
                      {result.ok ? "✓ Found" : "✗ Not found"}
                    </span>
                  )}
                  <a href={`https://tiktok.com/@${s.username}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#444", textDecoration: "none", border: "1px solid #222", borderRadius: 4, padding: "3px 8px", flexShrink: 0 }}>View ↗</a>
                  <button onClick={() => setTiktokSources(src => src.filter(x => x.id !== s.id))} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
