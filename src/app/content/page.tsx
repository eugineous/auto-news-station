"use client";
import { useState, useEffect, useCallback } from "react";
import Shell from "../shell";

const RED = "#E50914";

interface LogEntry {
  article_id: string;
  title: string;
  url: string;
  category: string;
  ig_success: boolean;
  fb_success: boolean;
  posted_at: string;
  manualPost?: boolean;
  isBreaking?: boolean;
}

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

export default function ContentPage() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<"all" | "ig" | "fb" | "failed">("all");
  const [copied, setCopied] = useState<string | null>(null);

  const fetchLog = useCallback(async () => {
    try {
      const r = await fetch("/api/post-log");
      if (r.ok) { const d = await r.json(); setLog(d.log || []); }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); }).catch(() => {});
  }

  function exportCSV() {
    const rows = [["Title", "Category", "URL", "Posted At", "Instagram", "Facebook"]];
    log.forEach(e => rows.push([e.title, e.category, e.url, e.posted_at, e.ig_success ? "Y" : "N", e.fb_success ? "Y" : "N"]));
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = `ppptv-posts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const filtered = log.filter(e => {
    if (search && !e.title.toLowerCase().includes(search.toLowerCase()) && !e.category.toLowerCase().includes(search.toLowerCase())) return false;
    if (platformFilter === "ig") return e.ig_success;
    if (platformFilter === "fb") return e.fb_success;
    if (platformFilter === "failed") return !e.ig_success && !e.fb_success;
    return true;
  });

  return (
    <Shell>
      <div style={{ padding: "32px 24px", maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 2, marginBottom: 4 }}>
              Content <span style={{ color: RED }}>Library</span>
            </div>
            <p style={{ fontSize: 13, color: "#555" }}>All published posts &mdash; {log.length} total</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              placeholder="Search..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "8px 12px", color: "#fff", fontSize: 13, outline: "none", width: 200 }}
            />
            <button onClick={exportCSV} style={{ background: "#1f1f1f", border: "1px solid #2a2a2a", color: "#888", borderRadius: 6, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Export CSV
            </button>
            <button onClick={fetchLog} style={{ background: "#1f1f1f", border: "1px solid #2a2a2a", color: "#888", borderRadius: 6, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}>Refresh</button>
          </div>
        </div>

        {/* Platform filter pills */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
          {(["all", "ig", "fb", "failed"] as const).map(val => {
            const label = val === "all" ? "All" : val === "ig" ? "IG OK" : val === "fb" ? "FB OK" : "Failed";
            return (
              <button key={val} onClick={() => setPlatformFilter(val)} style={{
                padding: "5px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${platformFilter === val ? RED : "#2a2a2a"}`,
                background: platformFilter === val ? RED : "#1a1a1a",
                color: platformFilter === val ? "#fff" : "#555",
              }}>{label}</button>
            );
          })}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#333" }}>Loading...</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {filtered.length === 0 && <div style={{ textAlign: "center", padding: 60, color: "#333" }}>No posts found</div>}
            {filtered.map(entry => (
              <div key={entry.article_id} style={{ background: "#1f1f1f", border: "1px solid #2a2a2a", borderRadius: 8, padding: "14px 16px", display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 6, color: "#ddd" }}>{entry.title}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ background: RED, color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3, letterSpacing: 1 }}>{entry.category}</span>
                    {entry.isBreaking && <span style={{ background: "#7f1d1d", color: "#fca5a5", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3 }}>BREAKING</span>}
                    {entry.manualPost && <span style={{ background: "#2a2a2a", color: "#666", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3 }}>MANUAL</span>}
                    <span style={{ fontSize: 11, color: "#444" }}>{ago(entry.posted_at)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: entry.ig_success ? "#4ade80" : "#f87171" }}>IG {entry.ig_success ? "OK" : "X"}</span>
                  <span style={{ fontSize: 11, color: entry.fb_success ? "#4ade80" : "#f87171" }}>FB {entry.fb_success ? "OK" : "X"}</span>
                  {entry.url && (
                    <button onClick={() => copyText(entry.url, entry.article_id)}
                      style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#555", borderRadius: 4, padding: "3px 8px", fontSize: 10, cursor: "pointer" }}>
                      {copied === entry.article_id ? "Copied" : "Copy URL"}
                    </button>
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
