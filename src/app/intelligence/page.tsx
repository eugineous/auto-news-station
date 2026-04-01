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

const CAT_COLOR: Record<string, string> = {
  CELEBRITY: "#e1306c", MUSIC: "#a855f7", "TV & FILM": "#3b82f6",
  SPORTS: "#22c55e", NEWS: "#ef4444", POLITICS: "#ef4444",
  TECHNOLOGY: "#06b6d4", GENERAL: "#6b7280", ENTERTAINMENT: "#a855f7",
  COMEDY: "#eab308", INFLUENCERS: "#f97316", "EAST AFRICA": "#10b981",
};

interface Post {
  postedAt: string;
  category: string;
  instagram: { success: boolean };
  facebook: { success: boolean };
  title: string;
}

function Spin() {
  return <span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid rgba(255,255,255,.15)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div style={{ height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color, borderRadius: 3, transition: "width .4s ease" }} />
    </div>
  );
}

export default function IntelligencePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("https://auto-ppp-tv.euginemicah.workers.dev/post-log", { headers: { Authorization: "Bearer ppptvWorker2024" } })
      .then(r => r.json())
      .then((d: any) => setPosts(d.log || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Best posting hours (EAT)
  const hourBuckets = Array.from({ length: 24 }, (_, h) => {
    const hourPosts = posts.filter(p => {
      const eat = (new Date(p.postedAt).getUTCHours() + 3) % 24;
      return eat === h;
    });
    const success = hourPosts.filter(p => p.instagram?.success || p.facebook?.success).length;
    return { hour: h, total: hourPosts.length, success, rate: hourPosts.length > 0 ? success / hourPosts.length : 0 };
  });
  const maxHourTotal = Math.max(1, ...hourBuckets.map(h => h.total));
  const bestHours = [...hourBuckets].sort((a, b) => b.rate - a.rate || b.total - a.total).slice(0, 5);

  // Category performance
  const cats = Object.keys(CAT_COLOR);
  const catStats = cats.map(cat => {
    const catPosts = posts.filter(p => p.category === cat);
    const success = catPosts.filter(p => p.instagram?.success || p.facebook?.success).length;
    return { cat, total: catPosts.length, success, rate: catPosts.length > 0 ? Math.round(success / catPosts.length * 100) : 0 };
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  const maxCatTotal = Math.max(1, ...catStats.map(c => c.total));

  // Day of week performance
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayStats = DAYS.map((day, i) => {
    const dayPosts = posts.filter(p => new Date(p.postedAt).getDay() === i);
    const success = dayPosts.filter(p => p.instagram?.success || p.facebook?.success).length;
    return { day, total: dayPosts.length, success, rate: dayPosts.length > 0 ? Math.round(success / dayPosts.length * 100) : 0 };
  });
  const maxDayTotal = Math.max(1, ...dayStats.map(d => d.total));

  // Overall stats
  const total = posts.length;
  const igSuccess = posts.filter(p => p.instagram?.success).length;
  const fbSuccess = posts.filter(p => p.facebook?.success).length;
  const bothSuccess = posts.filter(p => p.instagram?.success && p.facebook?.success).length;
  const overallRate = total > 0 ? Math.round((posts.filter(p => p.instagram?.success || p.facebook?.success).length / total) * 100) : 0;

  // 7-day trend
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toDateString();
    const dayPosts = posts.filter(p => new Date(p.postedAt).toDateString() === dateStr);
    return { label: DAYS[d.getDay()], count: dayPosts.length, success: dayPosts.filter(p => p.instagram?.success || p.facebook?.success).length };
  });
  const maxDay7 = Math.max(1, ...last7.map(d => d.count));

  return (
    <Shell>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ padding: "28px 24px 80px", maxWidth: 1000, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <span style={{ fontSize: 24 }}>🎯</span>
          <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 3, margin: 0 }}>Audience Intelligence</h1>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#333" }}><Spin /></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 20 }}>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {[
                { label: "Total Posts", value: total, color: "#fff" },
                { label: "Success Rate", value: overallRate + "%", color: overallRate > 80 ? GREEN : overallRate > 50 ? YELLOW : RED },
                { label: "IG Success", value: igSuccess, color: "#E1306C" },
                { label: "FB Success", value: fbSuccess, color: "#1877f2" },
              ].map(s => (
                <div key={s.label} style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 8, padding: "14px", textAlign: "center" as const }}>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase" as const, marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* 7-day activity */}
            <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 16 }}>Last 7 Days</div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 80 }}>
                {last7.map((d, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4 }}>
                    <div style={{ width: "100%", background: "#1a1a1a", borderRadius: 4, overflow: "hidden", height: 60, display: "flex", flexDirection: "column" as const, justifyContent: "flex-end" }}>
                      <div style={{ width: "100%", height: `${(d.count / maxDay7) * 100}%`, background: PINK, borderRadius: 4, minHeight: d.count > 0 ? 4 : 0 }} />
                    </div>
                    <div style={{ fontSize: 9, color: "#444", fontWeight: 700 }}>{d.label}</div>
                    <div style={{ fontSize: 10, color: "#666" }}>{d.count}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Best posting hours */}
              <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 14 }}>Best Posting Hours (EAT)</div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                  {bestHours.map(h => (
                    <div key={h.hour}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#ccc", fontWeight: 600 }}>
                          {h.hour === 0 ? "12am" : h.hour < 12 ? `${h.hour}am` : h.hour === 12 ? "12pm" : `${h.hour - 12}pm`}
                        </span>
                        <span style={{ fontSize: 11, color: GREEN }}>{Math.round(h.rate * 100)}% success · {h.total} posts</span>
                      </div>
                      <Bar value={h.total} max={maxHourTotal} color={GREEN} />
                    </div>
                  ))}
                  {bestHours.length === 0 && <div style={{ fontSize: 12, color: "#333" }}>Not enough data yet</div>}
                </div>
              </div>

              {/* Day of week */}
              <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 14 }}>Best Days to Post</div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                  {[...dayStats].sort((a, b) => b.total - a.total).map(d => (
                    <div key={d.day}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#ccc", fontWeight: 600 }}>{d.day}</span>
                        <span style={{ fontSize: 11, color: CYAN }}>{d.rate}% · {d.total} posts</span>
                      </div>
                      <Bar value={d.total} max={maxDayTotal} color={CYAN} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Category performance */}
            <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 14 }}>Category Performance</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {catStats.map(c => (
                  <div key={c.cat} style={{ background: "#111", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: CAT_COLOR[c.cat] || "#aaa", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1 }}>{c.cat}</span>
                      <span style={{ fontSize: 11, color: c.rate > 80 ? GREEN : c.rate > 50 ? YELLOW : RED, fontWeight: 700 }}>{c.rate}%</span>
                    </div>
                    <Bar value={c.success} max={c.total} color={CAT_COLOR[c.cat] || "#555"} />
                    <div style={{ fontSize: 10, color: "#444", marginTop: 5 }}>{c.success}/{c.total} posts succeeded</div>
                  </div>
                ))}
                {catStats.length === 0 && <div style={{ fontSize: 12, color: "#333" }}>No data yet</div>}
              </div>
            </div>

          </div>
        )}
      </div>
    </Shell>
  );
}
