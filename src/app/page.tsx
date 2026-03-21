"use client";
import { useState } from "react";

const ACCENT = "#F47B20";

export default function Home() {
  const [dryRunResult, setDryRunResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imgKey, setImgKey] = useState(0);

  async function runDryRun() {
    setLoading(true);
    setDryRunResult(null);
    try {
      const res = await fetch("/api/dry-run");
      const data = await res.json();
      setDryRunResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setDryRunResult("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", padding: "2rem", maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 40 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.02em" }}>
            <span style={{ color: ACCENT }}>PPP TV</span> Auto Poster
          </h1>
          <p style={{ color: "#888", marginTop: 4 }}>
            Scrapes ppptv-v2.vercel.app → generates branded images → posts to Instagram &amp; Facebook
          </p>
        </div>
      </div>

      {/* Status cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 40 }}>
        {[
          { label: "News Source", value: "ppptv-v2.vercel.app", ok: true },
          { label: "Image Template", value: "1080×1080 JPEG", ok: true },
          { label: "Social APIs", value: "Awaiting tokens", ok: false },
        ].map((card) => (
          <div key={card.label} style={{ background: "#161616", border: "1px solid #222", borderRadius: 8, padding: "16px 20px" }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>{card.label}</div>
            <div style={{ fontWeight: 700, color: card.ok ? "#4ade80" : ACCENT }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Image preview */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Image Template Preview</h2>
          <button
            onClick={() => setImgKey((k) => k + 1)}
            style={{ background: ACCENT, color: "#fff", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer" }}
          >
            Refresh
          </button>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <img
            key={imgKey}
            src={`/api/preview-image?t=${imgKey}`}
            alt="Template preview"
            style={{ width: 360, height: 360, borderRadius: 8, border: "1px solid #222", objectFit: "cover" }}
          />
          <div style={{ flex: 1, minWidth: 240 }}>
            <p style={{ color: "#888", fontSize: 14, lineHeight: 1.7 }}>
              This is the auto-generated image template. It uses the actual article headline, category tag, and thumbnail from the live RSS feed.
            </p>
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>Test with custom headline:</p>
              <a
                href="/api/preview-image?title=CHUCK+NORRIS+PASSES+AWAY+AT+86&category=TV+%26+FILM"
                target="_blank"
                rel="noreferrer"
                style={{ color: ACCENT, fontSize: 13 }}
              >
                /api/preview-image?title=CHUCK+NORRIS+PASSES+AWAY+AT+86
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Dry run */}
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Dry Run (no posting)</h2>
        <p style={{ color: "#888", fontSize: 14, marginBottom: 16 }}>
          Scrapes the RSS feed, generates images, but skips the actual Instagram/Facebook API calls. Safe to run anytime.
        </p>
        <button
          onClick={runDryRun}
          disabled={loading}
          style={{ background: "#1a1a1a", color: "#fff", border: `1px solid ${ACCENT}`, borderRadius: 6, padding: "10px 24px", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Running…" : "Run Dry Run"}
        </button>
        {dryRunResult && (
          <pre style={{ marginTop: 16, background: "#111", border: "1px solid #222", borderRadius: 8, padding: 16, fontSize: 12, color: "#4ade80", overflow: "auto", maxHeight: 400 }}>
            {dryRunResult}
          </pre>
        )}
      </div>

      {/* Setup checklist */}
      <div style={{ background: "#161616", border: "1px solid #222", borderRadius: 8, padding: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Setup Checklist</h2>
        {[
          { done: true, label: "Next.js app deployed on Vercel" },
          { done: true, label: "RSS scraper + image generator ready" },
          { done: true, label: "Cloudflare Worker deployed with cron (every 30 min)" },
          { done: true, label: "Cloudflare KV (SEEN_ARTICLES) created and bound" },
          { done: false, label: "Add INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_ACCOUNT_ID to Vercel" },
          { done: false, label: "Add FACEBOOK_ACCESS_TOKEN + FACEBOOK_PAGE_ID to Vercel" },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
            <span style={{ color: item.done ? "#4ade80" : "#555", fontSize: 18, lineHeight: 1.2 }}>
              {item.done ? "✓" : "○"}
            </span>
            <span style={{ color: item.done ? "#ccc" : "#666", fontSize: 14 }}>{item.label}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
