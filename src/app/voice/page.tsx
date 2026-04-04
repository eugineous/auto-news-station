"use client";
import { useState, useEffect } from "react";
import Shell from "../shell";

const RED = "#E50914", GREEN = "#4ade80", PINK = "#FF007A", PURPLE = "#a855f7";
const ORANGE = "#f97316", YELLOW = "#facc15";

const CATEGORIES = ["CELEBRITY","MUSIC","SPORTS","TV & FILM","ENTERTAINMENT","COMEDY","TECHNOLOGY","GENERAL"];

const DEFAULT_PROMPTS: Record<string, string> = {
  CELEBRITY: "Write a PPP TV Kenya caption for this celebrity story. Lead with the most dramatic or emotional element. Use a conversational Kenyan voice — warm, plugged-in, like a friend who knows everyone. Reference Nairobi culture where relevant.",
  MUSIC: "Write a PPP TV Kenya caption for this music story. Lead with the artist's energy or the song's vibe. Make the reader feel the music. Reference Kenyan music culture, Afrobeats, or Bongo where relevant.",
  SPORTS: "Write a PPP TV Kenya caption for this sports story. Lead with the stakes or the result. Use the language of a passionate Kenyan sports fan. Reference Harambee Stars, local leagues, or Kenyan athletes where relevant.",
  "TV & FILM": "Write a PPP TV Kenya caption for this TV/film story. Lead with what makes this unmissable. Reference Nollywood, Kenyan productions, or streaming culture where relevant.",
  ENTERTAINMENT: "Write a PPP TV Kenya caption for this entertainment story. Lead with the most shareable element. Keep it energetic and current.",
  COMEDY: "Write a PPP TV Kenya caption for this comedy content. Match the energy — if it's chaotic, be chaotic. If it's dry, be dry. Make the reader laugh before they even watch.",
  TECHNOLOGY: "Write a PPP TV Kenya caption for this tech story. Explain the impact in plain language. Connect it to how Kenyans use tech — M-Pesa, Safaricom, mobile-first culture.",
  GENERAL: "Write a PPP TV Kenya caption for this story. Lead with the most interesting fact. Keep it conversational and engaging.",
};

const TONE_OPTIONS = [
  { id: "broadcast", label: "Broadcast English", desc: "Formal, journalistic, CNN anchor style" },
  { id: "warm_kenyan", label: "Warm Kenyan", desc: "Conversational, local references, relatable" },
  { id: "sheng", label: "Sheng / Street", desc: "Gen Z energy, slang, TikTok-style" },
];

const BANNED_DEFAULTS = ["betting", "gambling", "casino", "loan shark", "pyramid scheme", "politics", "election", "vote"];

export default function VoicePage() {
  const [prompts, setPrompts] = useState<Record<string, string>>(DEFAULT_PROMPTS);
  const [selectedCat, setSelectedCat] = useState("CELEBRITY");
  const [defaultTone, setDefaultTone] = useState("warm_kenyan");
  const [bannedWords, setBannedWords] = useState<string[]>(BANNED_DEFAULTS);
  const [newBanned, setNewBanned] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handlePreview() {
    if (!previewUrl.trim()) return;
    setPreviewing(true); setPreviewResult(null);
    try {
      const r = await fetch("/api/preview-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: previewUrl.trim() }) });
      const d = await r.json() as any;
      setPreviewResult(d);
    } catch (e: any) { setPreviewResult({ error: e.message }); }
    setPreviewing(false);
  }

  function handleSave() {
    // In production this would persist to Supabase/env
    // For now store in localStorage as a quick win
    localStorage.setItem("ppptv_voice_prompts", JSON.stringify(prompts));
    localStorage.setItem("ppptv_default_tone", defaultTone);
    localStorage.setItem("ppptv_banned_words", JSON.stringify(bannedWords));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  useEffect(() => {
    const p = localStorage.getItem("ppptv_voice_prompts");
    const t = localStorage.getItem("ppptv_default_tone");
    const b = localStorage.getItem("ppptv_banned_words");
    if (p) setPrompts(JSON.parse(p));
    if (t) setDefaultTone(t);
    if (b) setBannedWords(JSON.parse(b));
  }, []);

  return (
    <Shell>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ padding: "28px 24px 80px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>🎙️</span>
            <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 3, margin: 0 }}>Brand Voice Editor</h1>
          </div>
          <button onClick={handleSave} style={{ background: saved ? GREEN : PINK, border: "none", color: "#fff", borderRadius: 8, padding: "10px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {saved ? "✓ Saved" : "Save Changes"}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16 }}>
          {/* Category list */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
            <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 6 }}>Category Prompts</div>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setSelectedCat(c)} style={{ background: selectedCat === c ? PINK + "22" : "#0a0a0a", border: `1px solid ${selectedCat === c ? PINK + "66" : "#1a1a1a"}`, borderRadius: 6, padding: "8px 12px", cursor: "pointer", textAlign: "left" as const, fontSize: 11, color: selectedCat === c ? PINK : "#888", fontWeight: selectedCat === c ? 700 : 400 }}>
                {c}
              </button>
            ))}
          </div>

          {/* Prompt editor */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 8 }}>System Prompt — {selectedCat}</div>
              <textarea
                value={prompts[selectedCat] || ""}
                onChange={e => setPrompts(p => ({ ...p, [selectedCat]: e.target.value }))}
                rows={6}
                style={{ width: "100%", background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 7, padding: "11px 13px", color: "#e5e5e5", fontSize: 13, outline: "none", resize: "vertical" as const, fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box" as const }}
              />
              <div style={{ fontSize: 10, color: "#333", marginTop: 4 }}>This prompt is injected into Gemini when generating captions for {selectedCat} content.</div>
            </div>

            {/* Default tone */}
            <div>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 8 }}>Default Caption Tone</div>
              <div style={{ display: "flex", gap: 8 }}>
                {TONE_OPTIONS.map(t => (
                  <button key={t.id} onClick={() => setDefaultTone(t.id)} style={{ flex: 1, background: defaultTone === t.id ? PURPLE + "22" : "#0a0a0a", border: `1px solid ${defaultTone === t.id ? PURPLE + "66" : "#1a1a1a"}`, borderRadius: 8, padding: "10px 12px", cursor: "pointer", textAlign: "left" as const }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: defaultTone === t.id ? PURPLE : "#888", marginBottom: 3 }}>{t.label}</div>
                    <div style={{ fontSize: 10, color: "#444" }}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Banned words */}
            <div>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 8 }}>Banned Words / Topics</div>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 8 }}>
                {bannedWords.map(w => (
                  <span key={w} style={{ background: "#1a0a0a", border: "1px solid #3a1010", color: "#f87171", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, display: "flex", alignItems: "center", gap: 5 }}>
                    {w}
                    <button onClick={() => setBannedWords(b => b.filter(x => x !== w))} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={newBanned} onChange={e => setNewBanned(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newBanned.trim()) { setBannedWords(b => [...b, newBanned.trim().toLowerCase()]); setNewBanned(""); } }} placeholder="Add banned word or topic…" style={{ flex: 1, background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 6, padding: "8px 12px", color: "#e5e5e5", fontSize: 12, outline: "none" }} />
                <button onClick={() => { if (newBanned.trim()) { setBannedWords(b => [...b, newBanned.trim().toLowerCase()]); setNewBanned(""); } }} style={{ background: PINK, border: "none", color: "#fff", borderRadius: 6, padding: "8px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Add</button>
              </div>
            </div>

            {/* Caption preview */}
            <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, padding: "16px 18px" }}>
              <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 10 }}>Preview Caption with Current Settings</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input value={previewUrl} onChange={e => setPreviewUrl(e.target.value)} placeholder="Paste any URL to preview caption…" style={{ flex: 1, background: "#111", border: "1px solid #222", borderRadius: 6, padding: "8px 12px", color: "#e5e5e5", fontSize: 12, outline: "none" }} />
                <button onClick={handlePreview} disabled={!previewUrl.trim() || previewing} style={{ background: previewing ? "#111" : PURPLE, border: "none", color: "#fff", borderRadius: 6, padding: "8px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {previewing ? "…" : "Preview"}
                </button>
              </div>
              {previewResult?.ai?.caption && (
                <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6, whiteSpace: "pre-line" as const, background: "#111", borderRadius: 6, padding: "10px 12px" }}>
                  {previewResult.ai.caption}
                </div>
              )}
              {previewResult?.error && <div style={{ fontSize: 11, color: "#f87171" }}>{previewResult.error}</div>}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
