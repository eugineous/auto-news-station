"use client";
import { useState, useEffect, useCallback } from "react";
import Shell from "../shell";

const RED = "#E50914";
const CATS = ["CELEBRITY","MUSIC","TV & FILM","SPORTS","MOVIES","ENTERTAINMENT","FASHION","EVENTS","AWARDS","EAST AFRICA","COMEDY","INFLUENCERS","LIFESTYLE","GENERAL"];

interface LogEntry {
  articleId: string; title: string; category: string;
  instagram: { success: boolean }; facebook: { success: boolean };
  postedAt: string; manualPost?: boolean;
}

function ago(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d}d ago`;
}

export default function AnalyticsPage() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLog = useCallback(async () => {
    try {
      const r = await fetch("/api/post-log");
      if (r.ok) { const d = await r.json(); setLog(d.log || []); }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const total = log.length;
  const igOk = log.filter(p => p.instagram.success).length;
  const fbOk = log.filter(p => p.facebook.success).length;
  const both = log.filter(p => p.instagram.success && p.facebook.success).length;
  const failed = log.filter(p => !p.instagram.success && !p.facebook.success).length;
  const manual = log.filter(p => p.manualPost).length;
  const auto = total - manual;
  const successRate = total > 0 ? Math.round((log.filter(p => p.instagram.success || p.facebook.success).length / total) * 100) : 0;

  // Posts per day (last 7 days)
  const days: { label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString("en-KE", { weekday: "short" });
    const count = log.filter(p => new Date(p.postedAt).toDateString() === d.toDateString()).length;
    days.push({ label, count });
  }
  const maxDay = Math.max(1, ...days.map(d => d.count));

  const catCounts = CATS.reduce((a, c) => ({ ...a, [c]: log.filter(p => p.category === c).length }), {} as Record<string, number>);
  const maxCat = Math.max(1, ...Object.values(catCounts));

  return (
    <Shell>
      <div style={{ padding: "32px 24px", maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 2, marginBottom: 4 }}>
            Analytics <span style={{ color: RED }}>Dashboard</span>
          </div>
          <p style={{ fontSize: 13, color: "#555" }}>Performance overview for all your social media posts.</p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#333" }}>Loading…</div>
        ) : (
          <>
            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 24 }}>
              {[
                { label: "Total Posts", value: total, color: "#fff" },
                { label: "Success Rate", value: successRate + "%", color: "#4ade80" },
                { label: "Instagram", value: igOk, color: "#E1306C" },
                { label: "Facebook", value: fbOk, color: "#1877f2" },
                { label: "Both Platforms", value: both, color: "#a855f7" },
                { label: "Failed", value: failed, color: failed > 0 ? "#f87171" : "#444" },
                { label: "Auto Posts", value: auto, color: RED },
                { label: "Manual Posts", value: manual, color: "#fbbf24" },
              ].map(s => (
                <div key={s.label} style={{ background: "#1f1f1f", border: "1px solid #2a2a2a", borderRadius: 10, padding: "16px 14px" }}>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: "#555", marginTop: 4, letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase" }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* 7-day chart */}
              <div style={{ background: "#1f1f1f", border: "1px solid #2a2a2a", borderRadius: 10, padding: "18px 20px" }}>
                <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, fontWeight: 700, textTransform: "uppercase", marginBottom: 16 }}>Posts — Last 7 Days</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80 }}>
                  {days.map(d => (
                    <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontSize: 10, color: "#555" }}>{d.count || ""}</div>
                      <div style={{ width: "100%", background: RED, borderRadius: "3px 3px 0 0", height: `${Math.round(d.count / maxDay * 60)}px`, minHeight: d.count > 0 ? 4 : 0, transition: "height .4s" }} />
                      <div style={{ fontSize: 9, color: "#444", letterSpacing: .5 }}>{d.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Category breakdown */}
              <div style={{ background: "#1f1f1f", border: "1px solid #2a2a2a", borderRadius: 10, padding: "18px 20px" }}>
                <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, fontWeight: 700, textTransform: "uppercase", marginBottom: 16 }}>By Category</div>
                {CATS.filter(c => catCounts[c] > 0).map(c => (
                  <div key={c} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "#666", width: 80, flexShrink: 0 }}>{c}</div>
                    <div style={{ flex: 1, background: "#111", borderRadius: 2, height: 4 }}>
                      <div style={{ width: `${Math.round(catCounts[c] / maxCat * 100)}%`, background: RED, borderRadius: 2, height: 4, transition: "width .4s" }} />
                    </div>
                    <div style={{ fontSize: 11, color: "#444", width: 20, textAlign: "right" }}>{catCounts[c]}</div>
                  </div>
                ))}
                {total === 0 && <div style={{ color: "#333", fontSize: 12 }}>No data yet</div>}
              </div>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
