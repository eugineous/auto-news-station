"use client";
import { useState, useEffect, useCallback } from "react";
import Shell from "../shell";

const RED = "#E50914", PINK = "#FF007A";
const PPPTV = "https://ppp-tv-site.vercel.app";

const CAT_ACCENT: Record<string, string> = {
  CELEBRITY: "#FF007A", NEWS: "#FF007A", POLITICS: "#FF007A", FASHION: "#FF007A",
  MUSIC: "#FF6B00", "TV & FILM": "#3b82f6", MOVIES: "#3b82f6",
  SPORTS: "#00CFFF", TECHNOLOGY: "#FFE600", BUSINESS: "#FFD700",
  AWARDS: "#FFD700", ENTERTAINMENT: "#9B30FF", EVENTS: "#22C55E",
  "EAST AFRICA": "#F97316", GENERAL: "#E50914",
};
function catAccent(cat: string): string { return CAT_ACCENT[(cat || "").toUpperCase()] ?? RED; }

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  imageUrl?: string;
  category?: string;
  sourceName?: string;
}

interface PostStatus { loading?: boolean; ok?: boolean; error?: string }

function ago(dateStr: string) {
  const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function Spinner() {
  return <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />;
}

const CATS = ["ALL", "CELEBRITY", "MUSIC", "TV & FILM", "FASHION", "EVENTS", "EAST AFRICA", "GENERAL"];

export default function QueuePage() {
  const [items, setItems] = useState<RssItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("ALL");
  const [statuses, setStatuses] = useState<Record<string, PostStatus>>({});
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [postingAll, setPostingAll] = useState(false);
  const [postAllProgress, setPostAllProgress] = useState<{ current: number; total: number } | null>(null);

  const fetchFeed = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`https://auto-ppp-tv.euginemicah.workers.dev/feed?limit=30`);
      if (!r.ok) throw new Error("Feed unavailable");
      const d = await r.json();
      setItems(d.articles || d.items || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  function showToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function postItem(item: RssItem) {
    const key = item.link;
    setStatuses(s => ({ ...s, [key]: { loading: true } }));
    try {
      const r = await fetch("/api/post-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.link }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Post failed");
      const ig = d.instagram?.success, fb = d.facebook?.success;
      const ok = ig || fb;
      setStatuses(s => ({ ...s, [key]: { ok, error: ok ? undefined : "Both platforms failed" } }));
      showToast(ok ? `Posted: ${item.title.slice(0, 40)}…` : "Post failed", ok ? "ok" : "err");
    } catch (e: any) {
      setStatuses(s => ({ ...s, [key]: { error: e.message } }));
      showToast(e.message, "err");
    }
  }

  async function postAllVisible() {
    const toPost = filtered.filter(item => !statuses[item.link]?.ok);
    if (!toPost.length) return;
    setPostingAll(true);
    for (let i = 0; i < toPost.length; i++) {
      setPostAllProgress({ current: i + 1, total: toPost.length });
      await postItem(toPost[i]);
      if (i < toPost.length - 1) await new Promise(r => setTimeout(r, 3000));
    }
    setPostingAll(false);
    setPostAllProgress(null);
  }

  const filtered = items.filter(item => {
    if (search && !item.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat !== "ALL" && item.category?.toUpperCase() !== filterCat) return false;
    return true;
  });

  return (
    <Shell>
      <div style={{ padding: "32px 24px", maxWidth: 1000, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 2, marginBottom: 4 }}>
              News <span style={{ color: RED }}>Feed</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", animation: "pulse 1.5s infinite" }} />
              <p style={{ fontSize: 12, color: "#555" }}>
                Live from{" "}
                <a href={PPPTV} target="_blank" rel="noopener noreferrer" style={{ color: RED, textDecoration: "none", fontWeight: 700 }}>
                  ppp-tv-site.vercel.app
                </a>
                {" "}· {items.length} articles
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {filtered.length > 0 && !postingAll && (
              <button onClick={postAllVisible} style={{ background: PINK, border: "none", color: "#fff", borderRadius: 6, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Post All ({filtered.filter(i => !statuses[i.link]?.ok).length})
              </button>
            )}
            {postingAll && postAllProgress && (
              <span style={{ fontSize: 12, color: "#888", alignSelf: "center" }}>
                Posting {postAllProgress.current} of {postAllProgress.total}…
              </span>
            )}
            <button onClick={fetchFeed} style={{ background: "#1f1f1f", border: "1px solid #2a2a2a", color: "#888", borderRadius: 6, padding: "8px 14px", fontSize: 12, cursor: "pointer" }}>
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="🔍 Search articles…"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none", flex: 1, minWidth: 200, maxWidth: 300 }}
          />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {CATS.map(c => (
              <button key={c} onClick={() => setFilterCat(c)} style={{
                padding: "6px 10px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${filterCat === c ? RED : "#2a2a2a"}`,
                background: filterCat === c ? RED : "#1a1a1a",
                color: filterCat === c ? "#fff" : "#555",
                transition: "all .15s", letterSpacing: .5, whiteSpace: "nowrap",
              }}>{c}</button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading && (
          <div style={{ display: "grid", gap: 8 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ background: "#1f1f1f", border: "1px solid #2a2a2a", borderRadius: 8, padding: 16, display: "flex", gap: 12 }}>
                <div style={{ width: 80, height: 80, borderRadius: 6, background: "linear-gradient(90deg,#1f1f1f 25%,#2a2a2a 50%,#1f1f1f 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 14, borderRadius: 3, background: "linear-gradient(90deg,#1f1f1f 25%,#2a2a2a 50%,#1f1f1f 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", marginBottom: 8, width: "70%" }} />
                  <div style={{ height: 10, borderRadius: 3, background: "linear-gradient(90deg,#1f1f1f 25%,#2a2a2a 50%,#1f1f1f 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", width: "40%" }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ background: "#1a0808", border: "1px solid #3a1a1a", borderRadius: 8, padding: "20px 24px", textAlign: "center" }}>
            <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{error}</div>
            <button onClick={fetchFeed} style={{ background: RED, color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Retry</button>
          </div>
        )}

        {!loading && !error && (
          <div style={{ display: "grid", gap: 6 }}>
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "#aaa" }}>No articles found</div>
            )}
            {filtered.map(item => {
              const key = item.link;
              const st = statuses[key];
              const posted = st?.ok;
              const accent = catAccent(item.category || "GENERAL");

              return (
                <div key={key} style={{
                  background: posted ? "rgba(74,222,128,.04)" : "#1f1f1f",
                  border: `1px solid ${posted ? "rgba(74,222,128,.2)" : "#2a2a2a"}`,
                  borderRadius: 8, padding: "14px 16px",
                  display: "flex", gap: 14, alignItems: "center",
                  opacity: posted ? 0.6 : 1,
                  transition: "all .2s",
                }}>
                  {/* Thumbnail */}
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "#111" }} />
                  ) : (
                    <div style={{ width: 72, height: 72, borderRadius: 6, background: "#111", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 24 }}>📰</span>
                    </div>
                  )}

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 6, color: "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {item.category && (
                        <span style={{ background: accent, color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3, letterSpacing: 1 }}>
                          {item.category.toUpperCase()}
                        </span>
                      )}
                      {item.sourceName && <span style={{ fontSize: 11, color: "#888" }}>{item.sourceName}</span>}
                      {item.pubDate && <span style={{ fontSize: 11, color: "#888" }}>{ago(item.pubDate)}</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    <a href={item.link} target="_blank" rel="noopener noreferrer"
                      style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#555", borderRadius: 5, padding: "6px 10px", fontSize: 11, textDecoration: "none", whiteSpace: "nowrap" }}>
                      View ↗
                    </a>
                    {posted ? (
                      <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 700 }}>✓ Posted</span>
                    ) : st?.error ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <span style={{ fontSize: 10, color: "#f87171" }}>{st.error.slice(0, 30)}</span>
                        <button onClick={() => postItem(item)} style={{ background: RED, color: "#fff", border: "none", borderRadius: 5, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          Retry
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => postItem(item)} disabled={st?.loading}
                        style={{ background: st?.loading ? "#1a1a1a" : PINK, color: "#fff", border: "none", borderRadius: 5, padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: st?.loading ? "not-allowed" : "pointer", whiteSpace: "nowrap", minWidth: 80, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        {st?.loading ? <><Spinner /> Posting…</> : "Post to IG+FB"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "ok" ? "#0d2a0d" : "#2a0d0d",
          border: `1px solid ${toast.type === "ok" ? "#1a4a1a" : "#4a1a1a"}`,
          color: toast.type === "ok" ? "#4ade80" : "#f87171",
          padding: "12px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          zIndex: 300, animation: "fadeIn .2s ease", whiteSpace: "nowrap",
          boxShadow: "0 8px 32px rgba(0,0,0,.6)",
        }}>
          {toast.type === "ok" ? "✓ " : "✗ "}{toast.msg}
        </div>
      )}
    </Shell>
  );
}
