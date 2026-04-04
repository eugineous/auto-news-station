"use client";
import { useState } from "react";
import Shell from "../shell";

const RED = "#E50914";
const WORKER_URL = "https://auto-ppp-tv.euginemicah.workers.dev";

export default function SettingsPage() {
  const [workerStatus, setWorkerStatus] = useState<{ latency?: number; error?: string } | null>(null);
  const [testingWorker, setTestingWorker] = useState(false);

  async function testWorker() {
    setTestingWorker(true);
    setWorkerStatus(null);
    const start = Date.now();
    try {
      const r = await fetch(WORKER_URL, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setWorkerStatus({ latency: Date.now() - start });
    } catch (e: any) {
      setWorkerStatus({ error: e.message || "Connection failed" });
    }
    setTestingWorker(false);
  }
  const config = [
    { section: "Auto-Poster", items: [
      { key: "Schedule", value: "Every 15 minutes", note: "Configured in cloudflare/wrangler.toml" },
      { key: "Peak Hours", value: "6:00 AM – 11:00 PM EAT", note: "Posts only during these hours" },
      { key: "Daily Cap", value: "24 posts/day", note: "Resets at midnight EAT" },
      { key: "Posts Per Run", value: "1 post", note: "One article per cron trigger" },
    ]},
    { section: "AI & Content", items: [
      { key: "AI Model", value: "Gemini 2.5 Flash", note: "Google Generative AI" },
      { key: "Caption Style", value: "Lede-first, no headline repeat", note: "Single paragraph" },
      { key: "Image Size", value: "1080 × 1350 px (4:5)", note: "Optimal for Instagram feed" },
      { key: "Image Quality", value: "JPEG 93%", note: "High quality with compression" },
    ]},
    { section: "Deduplication", items: [
      { key: "Storage", value: "Cloudflare KV", note: "Prevents re-posting same article" },
      { key: "TTL", value: "30 days", note: "Articles expire after 30 days" },
      { key: "Filter", value: "Kenya-focused content", note: "Scraper filters by relevance" },
    ]},
    { section: "Deployment", items: [
      { key: "Frontend", value: "Vercel (Next.js 14)", note: "Auto-deploys from main branch" },
      { key: "Worker", value: "Cloudflare Workers", note: "Cron scheduler" },
      { key: "Worker Name", value: "auto-ppp-tv", note: "See cloudflare/wrangler.toml" },
    ]},
  ];

  return (
    <Shell>
      <div style={{ padding: "32px 24px", maxWidth: 700, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 2, marginBottom: 4 }}>
            System <span style={{ color: RED }}>Settings</span>
          </div>
          <p style={{ fontSize: 13, color: "#555" }}>Configuration overview for the PPP TV auto-poster platform.</p>
        </div>

        {config.map(section => (
          <div key={section.section} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 3, fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>{section.section}</div>
            <div style={{ background: "#1f1f1f", border: "1px solid #2a2a2a", borderRadius: 10, overflow: "hidden" }}>
              {section.items.map((item, i) => (
                <div key={item.key} style={{ padding: "14px 18px", borderBottom: i < section.items.length - 1 ? "1px solid #1a1a1a" : "none", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{item.key}</div>
                    <div style={{ fontSize: 11, color: "#444" }}>{item.note}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#888", fontWeight: 600, textAlign: "right", flexShrink: 0 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ background: "#1a0a0a", border: "1px solid #2a1a1a", borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ fontSize: 12, color: "#888", fontWeight: 700, marginBottom: 6 }}>🔑 Environment Variables</div>
          <div style={{ fontSize: 12, color: "#555", lineHeight: 1.7 }}>
            Configure API keys in your Vercel project settings:<br />
            <code style={{ color: "#666", fontSize: 11 }}>FACEBOOK_ACCESS_TOKEN · FACEBOOK_PAGE_ID · INSTAGRAM_BUSINESS_ACCOUNT_ID · GEMINI_API_KEY · AUTOMATE_SECRET · CLOUDFLARE_WORKER_URL · WORKER_SECRET</code>
          </div>
        </div>

        <div style={{ background: "#1f1f1f", border: "1px solid #2a2a2a", borderRadius: 10, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Worker Connection</div>
            <div style={{ fontSize: 11, color: "#444" }}>{WORKER_URL}</div>
            {workerStatus && (
              <div style={{ fontSize: 12, marginTop: 4, color: workerStatus.error ? "#f87171" : "#4ade80", fontWeight: 600 }}>
                {workerStatus.error ? `✗ ${workerStatus.error}` : `✓ ${workerStatus.latency}ms`}
              </div>
            )}
          </div>
          <button onClick={testWorker} disabled={testingWorker} style={{ background: testingWorker ? "#111" : "#0a0a0a", border: "1px solid #2a2a2a", color: testingWorker ? "#444" : "#888", borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: testingWorker ? "not-allowed" : "pointer", whiteSpace: "nowrap" as const }}>
            {testingWorker ? "Testing…" : "Test Worker"}
          </button>
        </div>
      </div>
    </Shell>
  );
}
