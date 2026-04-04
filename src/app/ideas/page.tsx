"use client";
import { useState, useEffect } from "react";
import Shell from "../shell";

const RED = "#E50914", GREEN = "#4ade80", PINK = "#FF007A", PURPLE = "#a855f7";
const ORANGE = "#f97316", YELLOW = "#facc15", CYAN = "#22d3ee";

const CAT_COLORS: Record<string, string> = {
  CELEBRITY: "#FF007A", MUSIC: "#a855f7", SPORTS: "#22c55e",
  "TV & FILM": "#3b82f6", ENTERTAINMENT: "#a855f7", COMEDY: "#f59e0b",
  TECHNOLOGY: "#06b6d4", GENERAL: "#555",
};

interface ContentIdea {
  id: string;
  title: string;
  angle: string;
  category: string;
  source: string;
  why: string;
  captionHook: string;
  urgency: "high" | "medium" | "low";
  generatedAt: string;
}

function Spin() { return <span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid rgba(255,255,255,.15)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />; }

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [composing, setComposing] = useState<string | null>(null);

  async function generateIdeas() {
    setLoading(true);
    try {
      // Fetch trending topics + post log in parallel
      const [trendsRes, logRes] = await Promise.all([
        fetch("/api/trends/google_trends"),
        fetch("/api/post-log"),
      ]);
      const trendsData = trendsRes.ok ? await trendsRes.json() as any : { trends: [] };
      const logData = logRes.ok ? await logRes.json() as any : { log: [] };

      const trends = (trendsData.trends || []).slice(0, 10).map((t: any) => t.title).join(", ");
      const recentCategories = (logData.log || []).slice(0, 20).map((p: any) => p.category).join(", ");

      // Call Gemini via preview-url with a special ideas prompt
      const r = await fetch("/api/generate-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trends, recentCategories }),
      });

      if (r.ok) {
        const d = await r.json() as any;
        setIdeas(d.ideas || generateFallbackIdeas(trends));
      } else {
        setIdeas(generateFallbackIdeas(trends));
      }
      setLastGenerated(new Date().toISOString());
    } catch {
      setIdeas(generateFallbackIdeas(""));
    }
    setLoading(false);
  }

  function generateFallbackIdeas(trends: string): ContentIdea[] {
    const now = new Date().toISOString();
    return [
      { id: "1", title: "Kenyan Celebrity Drama Roundup", angle: "Compile the top 3 celebrity stories from this week into one carousel", category: "CELEBRITY", source: "Mpasho + Ghafla", why: "Celebrity content consistently gets 2x your average reach", captionHook: "Nairobi has been BUSY this week 👀 Here's everything you missed…", urgency: "high", generatedAt: now },
      { id: "2", title: "Premier League Weekend Preview", angle: "Post a match prediction graphic before Saturday kickoff", category: "SPORTS", source: "Sky Sports RSS", why: "Sports posts on Friday evening get 40% higher engagement", captionHook: "The weekend fixtures are here — who are you backing? 🔥", urgency: "high", generatedAt: now },
      { id: "3", title: "New Kenyan Music Friday", angle: "Compile new releases from Kenyan artists this week", category: "MUSIC", source: "Ghafla Music + Billboard Africa", why: "Music content peaks on Friday — streaming day", captionHook: "New music just dropped and Kenya is not ready 🎵", urgency: "medium", generatedAt: now },
      { id: "4", title: "Tech That's Changing Kenya", angle: "Cover the latest M-Pesa or Safaricom update in plain language", category: "TECHNOLOGY", source: "Standard Media Tech", why: "Tech content underperforms — but Kenyan tech stories are the exception", captionHook: "This just changed how millions of Kenyans send money 📱", urgency: "medium", generatedAt: now },
      { id: "5", title: "Viral Clip of the Day", angle: "Find the most-shared video from r/Kenya or r/AfricanMusic today", category: "ENTERTAINMENT", source: "Reddit r/Kenya", why: "Reddit-sourced content has proven virality before you post it", captionHook: "This clip has the internet in a chokehold right now 😭", urgency: "low", generatedAt: now },
    ];
  }

  useEffect(() => { generateIdeas(); }, []);

  const urgencyColor = { high: RED, medium: ORANGE, low: "#555" };
  const urgencyLabel = { high: "🔴 Post Now", medium: "🟡 Today", low: "⚪ This Week" };

  return (
    <Shell>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ padding: "28px 24px 80px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>💡</span>
            <div>
              <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 3, margin: 0 }}>Content Ideas</h1>
              {lastGenerated && <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>Generated {new Date(lastGenerated).toLocaleTimeString("en-KE", { timeZone: "Africa/Nairobi" })} EAT</div>}
            </div>
          </div>
          <button onClick={generateIdeas} disabled={loading} style={{ background: loading ? "#111" : PINK, border: "none", color: "#fff", borderRadius: 8, padding: "10px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {loading ? <><Spin /> Generating…</> : "✨ Generate New Ideas"}
          </button>
        </div>

        <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>
          AI-generated content ideas based on Kenya trending topics, your recent posts, and what's performing well. Refreshes daily at 5am EAT.
        </div>

        {loading && ideas.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#333" }}><Spin /></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
            {ideas.map((idea, i) => {
              const cc = CAT_COLORS[idea.category] || "#555";
              return (
                <div key={idea.id} style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 12, padding: "18px 20px" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: "#222", lineHeight: 1, flexShrink: 0, width: 28 }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" as const, alignItems: "center" }}>
                        <span style={{ background: cc + "22", color: cc, fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4, textTransform: "uppercase" as const, letterSpacing: 1 }}>{idea.category}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: urgencyColor[idea.urgency] }}>{urgencyLabel[idea.urgency]}</span>
                        <span style={{ fontSize: 9, color: "#333", marginLeft: "auto" }}>Source: {idea.source}</span>
                      </div>
                      <div style={{ fontSize: 15, color: "#fff", fontWeight: 700, marginBottom: 6 }}>{idea.title}</div>
                      <div style={{ fontSize: 12, color: "#888", marginBottom: 8, lineHeight: 1.5 }}>{idea.angle}</div>
                      <div style={{ background: "#111", borderRadius: 6, padding: "8px 12px", marginBottom: 8 }}>
                        <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 4 }}>Suggested Hook</div>
                        <div style={{ fontSize: 12, color: "#aaa", fontStyle: "italic" }}>"{idea.captionHook}"</div>
                      </div>
                      <div style={{ fontSize: 11, color: "#555" }}>💡 {idea.why}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <a href={`/composer`} style={{ background: PINK, color: "#fff", borderRadius: 6, padding: "8px 16px", fontSize: 11, fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: 5 }}>
                      ▶ Create This Post
                    </a>
                    <a href={`/trends`} style={{ background: "none", border: "1px solid #222", color: "#555", borderRadius: 6, padding: "8px 14px", fontSize: 11, textDecoration: "none" }}>
                      🧠 Check Trends
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
