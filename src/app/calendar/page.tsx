"use client";
import { useState, useEffect } from "react";
import Shell from "../shell";

const PINK = "#FF007A";
const GREEN = "#4ade80";
const RED = "#f87171";
const PURPLE = "#a855f7";
const ORANGE = "#f97316";
const CYAN = "#22d3ee";

const CAT_COLOR: Record<string, string> = {
  CELEBRITY: "#e1306c", MUSIC: "#a855f7", "TV & FILM": "#3b82f6",
  SPORTS: "#22c55e", NEWS: "#ef4444", POLITICS: "#ef4444",
  TECHNOLOGY: "#06b6d4", GENERAL: "#6b7280", ENTERTAINMENT: "#a855f7",
};

interface CalPost {
  id: string;
  title: string;
  category: string;
  postedAt: string;
  instagram: { success: boolean };
  facebook: { success: boolean };
  postType?: string;
  scheduledAt?: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function Spin() {
  return <span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid rgba(255,255,255,.15)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />;
}

export default function CalendarPage() {
  const [posts, setPosts] = useState<CalPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"month" | "week">("month");
  const [current, setCurrent] = useState(new Date());
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch("https://auto-ppp-tv.euginemicah.workers.dev/post-log", { headers: { Authorization: "Bearer ppptvWorker2024" } })
      .then(r => r.json())
      .then((d: any) => setPosts(d.log || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Build calendar grid for current month
  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) =>
    i < firstDay ? null : i - firstDay + 1
  );
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  function postsForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return posts.filter(p => (p.postedAt || p.scheduledAt || "").startsWith(dateStr));
  }

  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const selectedPosts = selected ? posts.filter(p => (p.postedAt || "").startsWith(selected)) : [];

  // Stats
  const thisMonth = posts.filter(p => {
    const d = new Date(p.postedAt);
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const igOk = thisMonth.filter(p => p.instagram?.success).length;
  const fbOk = thisMonth.filter(p => p.facebook?.success).length;
  const fails = thisMonth.filter(p => !p.instagram?.success && !p.facebook?.success).length;

  return (
    <Shell>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ padding: "28px 24px 80px", maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>📅</span>
            <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 3, margin: 0 }}>Content Calendar</h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setCurrent(new Date(year, month - 1, 1))} style={{ background: "none", border: "1px solid #222", color: "#aaa", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 14 }}>‹</button>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 2, minWidth: 160, textAlign: "center" as const }}>{MONTHS[month]} {year}</span>
            <button onClick={() => setCurrent(new Date(year, month + 1, 1))} style={{ background: "none", border: "1px solid #222", color: "#aaa", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 14 }}>›</button>
            <button onClick={() => setCurrent(new Date())} style={{ background: PINK, border: "none", color: "#fff", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Today</button>
          </div>
        </div>

        {/* Month stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
          {[
            { label: "Posts this month", value: thisMonth.length, color: "#fff" },
            { label: "IG ✓", value: igOk, color: "#E1306C" },
            { label: "FB ✓", value: fbOk, color: "#1877f2" },
            { label: "Fails", value: fails, color: fails > 0 ? RED : "#333" },
          ].map(s => (
            <div key={s.label} style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 8, padding: "12px 14px", textAlign: "center" as const }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase" as const, marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 300px" : "1fr", gap: 16 }}>
          {/* Calendar grid */}
          <div>
            {/* Day headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
              {DAYS.map(d => (
                <div key={d} style={{ textAlign: "center" as const, fontSize: 10, fontWeight: 700, color: "#444", letterSpacing: 2, padding: "6px 0", textTransform: "uppercase" as const }}>{d}</div>
              ))}
            </div>
            {/* Cells */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
              {cells.map((day, i) => {
                if (!day) return <div key={i} style={{ minHeight: 80, background: "#080808", borderRadius: 6 }} />;
                const dayPosts = postsForDay(day);
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isSelected = selected === dateStr;
                return (
                  <div key={i} onClick={() => setSelected(isSelected ? null : dateStr)}
                    style={{ minHeight: 80, background: isSelected ? "#1a0a14" : isToday(day) ? "#0d0a0d" : "#0a0a0a", border: `1px solid ${isSelected ? PINK + "66" : isToday(day) ? PINK + "33" : "#1a1a1a"}`, borderRadius: 6, padding: "6px 8px", cursor: "pointer", transition: "all .15s" }}>
                    <div style={{ fontSize: 12, fontWeight: isToday(day) ? 800 : 400, color: isToday(day) ? PINK : "#666", marginBottom: 4 }}>{day}</div>
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
                      {dayPosts.slice(0, 3).map((p, j) => (
                        <div key={j} style={{ fontSize: 9, background: (CAT_COLOR[p.category] || "#555") + "33", color: CAT_COLOR[p.category] || "#aaa", borderRadius: 3, padding: "2px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, fontWeight: 600 }}>
                          {p.title?.slice(0, 20)}
                        </div>
                      ))}
                      {dayPosts.length > 3 && <div style={{ fontSize: 9, color: "#444" }}>+{dayPosts.length - 3} more</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day detail panel */}
          {selected && (
            <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, padding: "16px", height: "fit-content" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 2 }}>{selected}</span>
                <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
              {selectedPosts.length === 0 ? (
                <div style={{ textAlign: "center" as const, padding: "20px 0", color: "#333", fontSize: 12 }}>
                  No posts on this day
                  <div style={{ marginTop: 10 }}>
                    <a href="/composer" style={{ background: PINK, color: "#fff", borderRadius: 6, padding: "7px 14px", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>+ Create Post</a>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                  {selectedPosts.map((p, i) => (
                    <div key={i} style={{ background: "#111", borderRadius: 7, padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 5, marginBottom: 5, flexWrap: "wrap" as const }}>
                        <span style={{ background: (CAT_COLOR[p.category] || "#555") + "33", color: CAT_COLOR[p.category] || "#aaa", fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3, textTransform: "uppercase" as const }}>{p.category}</span>
                        {p.postType === "video" && <span style={{ background: PURPLE + "33", color: PURPLE, fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 3 }}>VIDEO</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#ccc", fontWeight: 600, lineHeight: 1.4, marginBottom: 6 }}>{p.title}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <span style={{ fontSize: 10, color: p.instagram?.success ? GREEN : RED, fontWeight: 700 }}>IG {p.instagram?.success ? "✓" : "✗"}</span>
                        <span style={{ fontSize: 10, color: p.facebook?.success ? GREEN : RED, fontWeight: 700 }}>FB {p.facebook?.success ? "✓" : "✗"}</span>
                        <span style={{ fontSize: 10, color: "#333", marginLeft: "auto" }}>{new Date(p.postedAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}</span>
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
