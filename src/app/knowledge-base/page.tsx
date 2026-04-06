"use client";
import { useState, useEffect, useCallback } from "react";
import Shell from "../shell";

interface KBSection {
  id: string;
  title: string;
  content: string;
  updated_at?: string | null;
}

const SECTION_META: Record<string, { icon: string; desc: string; color: string }> = {
  brand_voice:      { icon: "📣", desc: "Who PPP TV is, what we sound like, what we cover — the AI's identity",       color: "#E50914" },
  headline_guide:   { icon: "🎯", desc: "Formulas, rules and examples for writing thumbnail headlines",                  color: "#FF007A" },
  caption_guide:    { icon: "✍️", desc: "How to write captions — Gen Z voice, structure, tone and rules",              color: "#a855f7" },
  kenya_knowledge:  { icon: "🇰🇪", desc: "Artists, celebs, sports stars, slang — the AI's Kenya brain",               color: "#22c55e" },
  gen_z_guide:      { icon: "⚡", desc: "How to win the Kenyan Gen Z audience — what they like and hate",              color: "#f97316" },
  video_topics:     { icon: "🎬", desc: "What videos to scrape — priority topics and TikTok accounts",                  color: "#06b6d4" },
  hashtag_strategy: { icon: "#️⃣", desc: "Hashtag sets by category and how to use them",                               color: "#eab308" },
};

const RED = "#E50914";
const PINK = "#FF007A";
const GREEN = "#4ade80";

function ago(iso?: string | null) {
  if (!iso) return "never saved";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SectionCard({
  section,
  onSave,
  onReset,
  defaultContent,
}: {
  section: KBSection;
  onSave: (id: string, content: string) => Promise<void>;
  onReset: (id: string) => void;
  defaultContent: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.content);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const meta = SECTION_META[section.id] || { icon: "📄", desc: "", color: "#555" };
  const isDirty = draft !== section.content;
  const isDefault = section.content === defaultContent;

  // Sync draft when section content changes externally
  useEffect(() => { if (!editing) setDraft(section.content); }, [section.content, editing]);

  async function handleSave() {
    setSaving(true);
    await onSave(section.id, draft);
    setSaving(false);
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    setDraft(defaultContent);
    onReset(section.id);
  }

  const lineCount = draft.split("\n").length;
  const textareaH = Math.min(Math.max(lineCount * 22 + 40, 200), 600);

  return (
    <div style={{
      background: "#111", border: `1px solid ${editing ? meta.color + "55" : "#1e1e1e"}`,
      borderRadius: 12, overflow: "hidden", transition: "border-color .2s",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px", display: "flex", alignItems: "center", gap: 12,
        borderBottom: editing ? `1px solid ${meta.color}22` : "1px solid #1a1a1a",
        background: editing ? meta.color + "08" : "transparent",
        cursor: "pointer",
      }} onClick={() => { if (!editing) { setEditing(true); setDraft(section.content); } }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>{meta.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{section.title}</div>
          <div style={{ fontSize: 11, color: "#555" }}>{meta.desc}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {!isDefault && (
            <span style={{ fontSize: 9, background: meta.color + "22", color: meta.color, border: `1px solid ${meta.color}44`, borderRadius: 4, padding: "2px 7px", fontWeight: 700, letterSpacing: 1 }}>
              CUSTOM
            </span>
          )}
          <span style={{ fontSize: 10, color: "#444" }}>{ago(section.updated_at)}</span>
          {saved && <span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>✓ Saved</span>}
          {!editing && (
            <span style={{ fontSize: 11, color: meta.color, fontWeight: 700, letterSpacing: 1 }}>EDIT ›</span>
          )}
        </div>
      </div>

      {/* Content */}
      {editing ? (
        <div style={{ padding: "16px 20px" }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
            style={{
              width: "100%", height: textareaH, background: "#0a0a0a",
              border: "1px solid #2a2a2a", borderRadius: 8,
              color: "#e5e5e5", fontSize: 13, lineHeight: 1.6,
              padding: "14px 16px", fontFamily: "monospace",
              outline: "none", resize: "vertical", boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              style={{
                background: saving ? "#333" : meta.color, color: "#fff", border: "none",
                borderRadius: 7, padding: "10px 22px", fontSize: 13, fontWeight: 800,
                cursor: saving || !isDirty ? "not-allowed" : "pointer", opacity: !isDirty ? 0.4 : 1,
              }}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              onClick={() => { setEditing(false); setDraft(section.content); }}
              style={{ background: "none", border: "1px solid #333", color: "#aaa", borderRadius: 7, padding: "9px 18px", fontSize: 13, cursor: "pointer" }}
            >
              Cancel
            </button>
            {!isDefault && (
              <button
                onClick={handleReset}
                style={{ background: "none", border: "1px solid #333", color: "#666", borderRadius: 7, padding: "9px 18px", fontSize: 12, cursor: "pointer", marginLeft: "auto" }}
              >
                Reset to Default
              </button>
            )}
            <span style={{ fontSize: 10, color: "#444", marginLeft: "auto" }}>
              {draft.split("\n").length} lines · {draft.length} chars
            </span>
          </div>
        </div>
      ) : (
        <div
          style={{ padding: "14px 20px 16px", cursor: "pointer" }}
          onClick={() => { setEditing(true); setDraft(section.content); }}
        >
          <pre style={{
            margin: 0, fontSize: 11, color: "#555", lineHeight: 1.5,
            fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word",
            maxHeight: 120, overflow: "hidden",
            maskImage: "linear-gradient(to bottom, #fff 60%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, #fff 60%, transparent 100%)",
          }}>
            {section.content.slice(0, 400)}
          </pre>
          <div style={{ marginTop: 8, fontSize: 10, color: "#444" }}>
            Click to edit — {section.content.split("\n").length} lines
          </div>
        </div>
      )}
    </div>
  );
}

export default function KnowledgeBasePage() {
  const [sections, setSections] = useState<KBSection[]>([]);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [testUrl, setTestUrl] = useState("");
  const [testResult, setTestResult] = useState<{
    headline?: string;
    caption?: string;
    wordCount?: number;
    charCount?: number;
    usingLiveKB?: boolean;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const [activeTab, setActiveTab] = useState<"sections" | "workflows" | "test">("sections");

  useEffect(() => {
    load();
    // Load defaults from API
    fetch("/api/knowledge-base")
      .then(r => r.json())
      .then(d => {
        const defMap: Record<string, string> = {};
        for (const s of (d.sections || [])) defMap[s.id] = s.content;
        // We need the hardcoded defaults, not the saved ones, for the reset button
        // The API returns merged (db wins). We store whatever comes back as our "saved" state.
      })
      .catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/knowledge-base", { credentials: "include" });
      const d = await r.json();
      setSections(d.sections || []);
      // Also fetch defaults from gemini module via a special param
      const dr = await fetch("/api/knowledge-base?defaults=1", { credentials: "include" });
      const dd = await dr.json();
      const defMap: Record<string, string> = {};
      for (const s of (dd.defaults || [])) defMap[s.id] = s.content;
      setDefaults(defMap);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  const handleSave = useCallback(async (id: string, content: string) => {
    const section = sections.find(s => s.id === id);
    const res = await fetch("/api/knowledge-base", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title: section?.title || id, content }),
    });
    if (res.ok) {
      setSections(prev => prev.map(s => s.id === id ? { ...s, content, updated_at: new Date().toISOString() } : s));
    }
  }, [sections]);

  const handleReset = useCallback(async (id: string) => {
    const def = defaults[id];
    if (!def) return;
    await fetch("/api/knowledge-base", {
      method: "DELETE", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setSections(prev => prev.map(s => s.id === id ? { ...s, content: def, updated_at: null } : s));
  }, [defaults]);

  async function runTest() {
    if (!testUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/preview-url", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: testUrl }),
      });
      const d = await r.json();
      const caption = d.ai?.caption;
      setTestResult({
        headline: d.ai?.clickbaitTitle || d.scraped?.title,
        caption,
        wordCount: caption ? caption.split(/\s+/).filter(Boolean).length : undefined,
        charCount: caption ? caption.length : undefined,
        usingLiveKB: d.usingLiveKB,
      });
    } catch (e: any) {
      setTestResult({ headline: "Error: " + e.message });
    }
    setTesting(false);
  }

  const TABS = [
    { id: "sections" as const, label: "AI Brain Sections", icon: "🧠" },
    { id: "workflows" as const, label: "How It Works", icon: "⚙️" },
    { id: "test" as const,     label: "Test the AI",     icon: "🧪" },
  ];

  return (
    <Shell>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 80px" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 28 }}>🧠</span>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>
              Knowledge Base
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#666", lineHeight: 1.5 }}>
            This is your AI's brain — everything it knows about PPP TV, Kenya, and how to write.
            Edit any section and the AI uses your changes immediately. No code required.
          </p>
        </div>

        {/* Status bar */}
        <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8, padding: "10px 16px", marginBottom: 24, display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "#666" }}>
            <span style={{ color: GREEN, fontWeight: 700 }}>●</span> {sections.length} sections loaded
          </div>
          <div style={{ fontSize: 12, color: "#666" }}>
            <span style={{ color: "#a855f7", fontWeight: 700 }}>●</span>{" "}
            {sections.filter(s => defaults[s.id] && s.content !== defaults[s.id]).length} customised
          </div>
          <div style={{ fontSize: 12, color: "#666" }}>
            <span style={{ color: "#f97316", fontWeight: 700 }}>●</span> Changes take effect on next post
          </div>
          <div style={{ fontSize: 12, color: "#666" }}>
            <span style={{ color: testResult?.usingLiveKB ? GREEN : "#f97316", fontWeight: 700 }}>●</span>{" "}
            {testResult ? (testResult.usingLiveKB ? "Using live KB" : "Using defaults") : "KB status unknown"}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 28, borderBottom: "1px solid #1a1a1a", paddingBottom: 0 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "10px 18px", fontSize: 13, fontWeight: 700,
                color: activeTab === t.id ? "#fff" : "#555",
                borderBottom: activeTab === t.id ? `2px solid ${RED}` : "2px solid transparent",
                marginBottom: -1, display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Sections Tab */}
        {activeTab === "sections" && (
          <div>
            {loading ? (
              <div style={{ textAlign: "center", padding: 60, color: "#555" }}>Loading knowledge base…</div>
            ) : error ? (
              <div style={{ textAlign: "center", padding: 40, color: "#f87171" }}>{error}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sections.map(s => (
                  <SectionCard
                    key={s.id}
                    section={s}
                    onSave={handleSave}
                    onReset={handleReset}
                    defaultContent={defaults[s.id] || s.content}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Workflows Tab */}
        {activeTab === "workflows" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              {
                title: "📸 Image Post Pipeline (every 12–20 min)",
                steps: [
                  "Worker cron fires every 5 min — jitter logic decides whether to actually post",
                  "Scrapes 50+ RSS feeds (Tuko, Mpasho, Ghafla, TMZ, ESPN, BBC, Rolling Stone…)",
                  "Scores articles by recency + Kenyan relevance + viral potential",
                  "Deduplicates against Supabase post log (no repeats)",
                  "Gemini 2.5 Flash generates: thumbnail headline + caption in parallel",
                  "Sharp generates branded PPP TV image with headline overlay",
                  "Posts to Instagram + Facebook simultaneously",
                  "Hashtags posted as first comment (algorithm hack)",
                  "Logs result to Supabase",
                ],
              },
              {
                title: "🎬 Video Post Pipeline (every 12–20 min, alternating)",
                steps: [
                  "Fetches videos from: TikWM account feeds (100+ accounts), TikWM search (90+ keywords), Reddit top posts, YouTube RSS (14 channels), Dailymotion, Nitter/Twitter RSS, Mutembei TV Facebook",
                  "Scores by: viral score + recency + Kenyan content boost (+25) + play count boost + upvote boost",
                  "Resolves direct MP4 via: Cobalt API, YouTube resolver, or direct URL",
                  "Downloads video → stages to Cloudflare R2 (temporary)",
                  "Gemini generates caption for the video content",
                  "Generates 9:16 branded cover image (used as thumbnail)",
                  "Posts as Instagram Reel + Facebook Video simultaneously",
                  "Deletes from R2 after posting (cleanup)",
                ],
              },
              {
                title: "⚡ Jitter System (shadow ban prevention)",
                steps: [
                  "Cron fires every 5 minutes but MOST ticks are skipped",
                  "Random wait: 12–20 minutes between posts (mimics human behaviour)",
                  "Hard minimum: never post twice within 10 minutes",
                  "Force post: if nothing posted in 90 minutes, override jitter and post",
                  "Dead zone: no posts 1am–5:45am EAT (audience is asleep)",
                  "Off-peak (6am–7am, 10pm–1am): 85% chance to post",
                  "Daily cap: maximum 48 posts/day (safe zone, IG limit is 50)",
                ],
              },
              {
                title: "🎬 War Room (manual posting)",
                steps: [
                  "Compose tab: paste a URL → scrape → AI writes headline + caption → post to IG/FB",
                  "Studio tab: paste any URL → AI generates headline + caption → pick ratio → preview → post",
                  "Cockpit tab: live monitor of agent status, recent posts, toggle agent ON/OFF",
                  "Sources tab: live preview of what videos are queued for next post",
                  "Agent tab: agent logs, A/B variant tracking, performance metrics",
                  "Queue tab: scheduled post queue management",
                ],
              },
            ].map(({ title, steps }) => (
              <div key={title} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "20px 22px" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 14 }}>{title}</div>
                <ol style={{ margin: 0, padding: "0 0 0 20px" }}>
                  {steps.map((step, i) => (
                    <li key={i} style={{ fontSize: 12, color: "#aaa", lineHeight: 1.8, marginBottom: 2 }}>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}

        {/* Test Tab */}
        {activeTab === "test" && (
          <div>
            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "24px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
                🧪 Test the AI Writing System
              </div>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>
                Paste any article URL and see exactly what headline + caption the AI would generate with your current knowledge base settings.
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                <input
                  value={testUrl}
                  onChange={e => setTestUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") runTest(); }}
                  placeholder="https://tuko.co.ke/… or any article URL"
                  style={{
                    flex: 1, background: "#0a0a0a", border: "1px solid #2a2a2a",
                    borderRadius: 8, padding: "11px 14px", color: "#e5e5e5", fontSize: 13,
                    outline: "none",
                  }}
                />
                <button
                  onClick={runTest}
                  disabled={testing || !testUrl.trim()}
                  style={{
                    background: testUrl && !testing ? PINK : "#222", color: "#fff", border: "none",
                    borderRadius: 8, padding: "11px 24px", fontSize: 13, fontWeight: 800,
                    cursor: testing || !testUrl ? "not-allowed" : "pointer",
                  }}
                >
                  {testing ? "Testing…" : "Generate"}
                </button>
              </div>

              {testResult && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {testResult.headline && (
                    <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: RED, letterSpacing: 2, marginBottom: 8 }}>HEADLINE (goes on thumbnail)</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: 1 }}>{testResult.headline}</div>
                    </div>
                  )}
                  {testResult.caption && (
                    <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: PINK, letterSpacing: 2, marginBottom: 8 }}>CAPTION (goes on Instagram/Facebook)</div>
                      <pre style={{ margin: 0, fontSize: 13, color: "#ccc", lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                        {testResult.caption}
                      </pre>
                      {testResult.wordCount !== undefined && (
                        <div style={{ fontSize: 11, color: "#555", marginTop: 8 }}>
                          {testResult.wordCount} words · {testResult.charCount} chars
                          {testResult.wordCount > 180 && <span style={{ color: "#f87171", marginLeft: 8 }}>⚠ Over 180 words</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
