"use client";
import { useState } from "react";

const ACCENT = "#F47B20";

interface DryRunArticle {
  id: string;
  title: string;
  category: string;
  imageGenerated: boolean;
  captionLength: { instagram: number; facebook: number };
  error?: string;
}

interface DryRunResult {
  totalArticlesFound: number;
  newArticles: number;
  dryRunSample: DryRunArticle[];
  note: string;
}

export default function Home() {
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<DryRunArticle | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runDryRun() {
    setLoading(true);
    setError(null);
    setDryRunResult(null);
    setSelectedArticle(null);
    setPreviewSrc(null);
    try {
      const res = await fetch("/api/dry-run");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDryRunResult(data);
      // Auto-select first successful article
      const first = data.dryRunSample?.find((a: DryRunArticle) => a.imageGenerated);
      if (first) selectArticle(first);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function selectArticle(article: DryRunArticle) {
    setSelectedArticle(article);
    setPreviewLoading(true);
    setPreviewSrc(null);
    // Set src directly — onLoad/onError on the <img> tag handles the rest
    const url = `/api/preview-image?title=${encodeURIComponent(article.title)}&category=${encodeURIComponent(article.category)}&t=${Date.now()}`;
    setPreviewSrc(url);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", padding: "2rem", maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 36 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.02em", margin: 0 }}>
            <span style={{ color: ACCENT }}>PPP TV</span> Auto Poster
          </h1>
          <p style={{ color: "#666", marginTop: 6, fontSize: 14 }}>
            Scrapes ppptv-v2.vercel.app → generates branded images → posts to Instagram &amp; Facebook
          </p>
        </div>
      </div>

      {/* Status cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 36 }}>
        {[
          { label: "News Source", value: "ppptv-v2.vercel.app", ok: true },
          { label: "Image Template", value: "1080×1350 (4:5)", ok: true },
          { label: "Social APIs", value: "Awaiting tokens", ok: false },
        ].map((card) => (
          <div key={card.label} style={{ background: "#111", border: "1px solid #222", borderRadius: 8, padding: "14px 18px" }}>
            <div style={{ fontSize: 11, color: "#555", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.1em" }}>{card.label}</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: card.ok ? "#4ade80" : ACCENT }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Main action */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <button
            onClick={runDryRun}
            disabled={loading}
            style={{
              background: loading ? "#222" : ACCENT,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "12px 28px",
              fontWeight: 800,
              fontSize: 15,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              letterSpacing: "0.02em",
            }}
          >
            {loading ? "Fetching articles…" : "🔄 Fetch Live Articles + Preview Images"}
          </button>
          {dryRunResult && (
            <span style={{ color: "#666", fontSize: 13 }}>
              {dryRunResult.totalArticlesFound} articles found · {dryRunResult.dryRunSample.length} previewed
            </span>
          )}
        </div>

        {error && (
          <div style={{ background: "#1a0a0a", border: "1px solid #5a1a1a", borderRadius: 8, padding: "12px 16px", color: "#f87171", fontSize: 13, marginBottom: 16 }}>
            ⚠ {error}
          </div>
        )}
      </div>

      {/* Preview layout */}
      {dryRunResult && (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, marginBottom: 40 }}>

          {/* Article list */}
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Articles</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dryRunResult.dryRunSample.map((article) => (
                <button
                  key={article.id}
                  onClick={() => article.imageGenerated && selectArticle(article)}
                  style={{
                    background: selectedArticle?.id === article.id ? "#1a1a1a" : "#111",
                    border: `1px solid ${selectedArticle?.id === article.id ? ACCENT : "#222"}`,
                    borderRadius: 8,
                    padding: "12px 14px",
                    textAlign: "left",
                    cursor: article.imageGenerated ? "pointer" : "default",
                    opacity: article.imageGenerated ? 1 : 0.5,
                  }}
                >
                  <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, marginBottom: 4, letterSpacing: "0.08em" }}>
                    {article.category}
                  </div>
                  <div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.4 }}>
                    {article.title.slice(0, 80)}{article.title.length > 80 ? "…" : ""}
                  </div>
                  {article.error && (
                    <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>⚠ {article.error.slice(0, 60)}</div>
                  )}
                  {article.imageGenerated && (
                    <div style={{ fontSize: 11, color: "#4ade80", marginTop: 6 }}>✓ Image ready</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Image preview */}
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
              Generated Image {selectedArticle ? `— ${selectedArticle.category}` : ""}
            </div>
            <div
              style={{
                background: "#111",
                border: "1px solid #222",
                borderRadius: 10,
                overflow: "hidden",
                aspectRatio: "4 / 5",
                maxWidth: 432,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                cursor: previewSrc ? "zoom-in" : "default",
              }}
              onClick={() => previewSrc && setLightbox(true)}
            >
              {previewLoading && !previewSrc && (
                <div style={{ color: "#444", fontSize: 14 }}>Generating image…</div>
              )}
              {!previewLoading && !previewSrc && !selectedArticle && (
                <div style={{ color: "#333", fontSize: 14 }}>Select an article to preview</div>
              )}
              {!previewLoading && !previewSrc && selectedArticle && (
                <div style={{ color: "#f87171", fontSize: 13 }}>Image generation failed</div>
              )}
              {previewSrc && (
                <>
                  {previewLoading && (
                    <div style={{ position: "absolute", color: "#444", fontSize: 14 }}>Generating image…</div>
                  )}
                  <img
                    src={previewSrc}
                    alt="Generated post"
                    onLoad={() => setPreviewLoading(false)}
                    onError={() => { setPreviewLoading(false); setPreviewSrc(null); }}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: previewLoading ? "none" : "block" }}
                  />
                  {!previewLoading && (
                    <div style={{
                      position: "absolute",
                      bottom: 10,
                      right: 10,
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      fontSize: 11,
                      padding: "4px 8px",
                      borderRadius: 4,
                    }}>
                      Click to enlarge
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Caption lengths */}
            {selectedArticle?.imageGenerated && (
              <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                <div style={{ background: "#111", border: "1px solid #222", borderRadius: 6, padding: "8px 14px", fontSize: 12 }}>
                  <span style={{ color: "#555" }}>Instagram caption: </span>
                  <span style={{ color: "#4ade80", fontWeight: 700 }}>{selectedArticle.captionLength.instagram} chars</span>
                </div>
                <div style={{ background: "#111", border: "1px solid #222", borderRadius: 6, padding: "8px 14px", fontSize: 12 }}>
                  <span style={{ color: "#555" }}>Facebook caption: </span>
                  <span style={{ color: "#4ade80", fontWeight: 700 }}>{selectedArticle.captionLength.facebook} chars</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && previewSrc && (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            cursor: "zoom-out",
          }}
        >
          <img
            src={previewSrc}
            alt="Full size preview"
            style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8, boxShadow: "0 0 60px rgba(0,0,0,0.8)" }}
          />
          <div style={{ position: "absolute", top: 20, right: 24, color: "#666", fontSize: 13 }}>Click anywhere to close</div>
        </div>
      )}

      {/* Setup checklist */}
      <div style={{ background: "#111", border: "1px solid #222", borderRadius: 8, padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>Setup Checklist</div>
        {[
          { done: true, label: "Next.js app deployed on Vercel" },
          { done: true, label: "RSS scraper + image generator ready" },
          { done: true, label: "Cloudflare Worker deployed with cron (every 30 min)" },
          { done: true, label: "Cloudflare KV (SEEN_ARTICLES) created and bound" },
          { done: false, label: "Add INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_ACCOUNT_ID to Vercel" },
          { done: false, label: "Add FACEBOOK_ACCESS_TOKEN + FACEBOOK_PAGE_ID to Vercel" },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
            <span style={{ color: item.done ? "#4ade80" : "#444", fontSize: 16, lineHeight: 1.3 }}>
              {item.done ? "✓" : "○"}
            </span>
            <span style={{ color: item.done ? "#bbb" : "#555", fontSize: 13 }}>{item.label}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
