"use client";
import { useState, useRef, useCallback, useEffect } from "react";

const PINK = "#FF007A";

type Tab = "video" | "carousel";
type Status = "idle" | "loading" | "success" | "error";

async function getSecret(): Promise<string> {
  const r = await fetch("/api/automate-secret");
  if (r.ok) { const d = await r.json(); return d.secret || ""; }
  return "";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ── Branded thumbnail preview ─────────────────────────────────────────────────
// imageUrl can be a remote URL (video tab) or a base64 string (carousel cover upload)
function ThumbnailPreview({ headline, category, imageUrl, imageBase64 }: { headline: string; category: string; imageUrl?: string; imageBase64?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!headline.trim()) { setSrc(null); return; }
    if (!imageUrl && !imageBase64) { setSrc(null); return; }

    setLoading(true);
    setSrc(null);

    if (imageBase64) {
      // POST with base64 for uploaded files
      fetch("/api/preview-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: headline, category, imageBase64 }),
      }).then(r => {
        if (!r.ok) { setLoading(false); return; }
        return r.blob();
      }).then(blob => {
        if (!blob) return;
        setSrc(URL.createObjectURL(blob));
        setLoading(false);
      }).catch(() => setLoading(false));
    } else if (imageUrl) {
      // GET with remote URL for video tab
      const params = new URLSearchParams({ title: headline, category, imageUrl });
      const url = `/api/preview-image?${params}`;
      const img = new Image();
      img.onload = () => { setSrc(url); setLoading(false); };
      img.onerror = () => { setSrc(null); setLoading(false); };
      img.src = url;
    }
  }, [headline, category, imageUrl, imageBase64]);

  if (!imageUrl && !imageBase64) return null;

  return (
    <div style={{ width: "100%", maxWidth: 280, aspectRatio: "4/5", background: "#111", borderRadius: 8, overflow: "hidden", position: "relative", border: "1px solid #222" }}>
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 11, color: "#555" }}>Generating...</span>
        </div>
      )}
      {src && <img src={src} alt="thumbnail preview" style={{ width: "100%", height: "100%", objectFit: "cover", display: loading ? "none" : "block" }} />}
      <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.7)", borderRadius: 4, padding: "2px 7px", fontSize: 10, color: "#fff" }}>4:5</div>
    </div>
  );
}

// ── Video Tab ─────────────────────────────────────────────────────────────────
function VideoTab() {
  const [url, setUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [caption, setCaption] = useState("");
  const [thumbUrl, setThumbUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<any>(null);

  async function fetchVideoInfo() {
    if (!url.trim()) return;
    setFetching(true);
    try {
      const r = await fetch("/api/preview-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const d = await r.json();
      const img = d.scraped?.imageUrl || d.scraped?.videoThumbnailUrl || "";
      if (img) setThumbUrl(img);
      if (!headline && d.scraped?.title) setHeadline(d.scraped.title.toUpperCase().slice(0, 100));
    } catch {}
    setFetching(false);
  }

  async function handlePost() {
    if (!url.trim() || !headline.trim() || !caption.trim()) return;
    setStatus("loading"); setResult(null);
    try {
      const secret = await getSecret();
      const r = await fetch("/api/post-video", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + secret },
        body: JSON.stringify({ url: url.trim(), headline: headline.trim(), caption: caption.trim(), category: "TRENDING" }),
      });
      const d = await r.json();
      setResult(d);
      setStatus(d.instagram?.success || d.facebook?.success ? "success" : "error");
    } catch (err: any) { setResult({ error: err.message }); setStatus("error"); }
  }

  const canPost = url.trim() && headline.trim() && caption.trim() && status !== "loading";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* URL */}
      <div>
        <label style={labelStyle}>Video URL</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={url} onChange={e => setUrl(e.target.value)}
            onBlur={fetchVideoInfo}
            placeholder="YouTube, TikTok, Instagram, or direct .mp4 URL"
            style={inputStyle}
          />
          <button onClick={fetchVideoInfo} disabled={!url.trim() || fetching} style={ghostBtnStyle}>
            {fetching ? "..." : "Fetch"}
          </button>
        </div>
        <p style={hintStyle}>Paste URL → app fetches thumbnail + downloads video for posting</p>
      </div>

      {/* Headline */}
      <div>
        <label style={labelStyle}>Headline <span style={{ color: "#555", fontWeight: 400 }}>(appears on thumbnail image)</span></label>
        <input
          value={headline}
          onChange={e => setHeadline(e.target.value.toUpperCase())}
          placeholder="TYPE YOUR HEADLINE IN CAPS"
          maxLength={120}
          style={{ ...inputStyle, textTransform: "uppercase", letterSpacing: 1 }}
        />
        <p style={hintStyle}>{headline.length}/120 chars</p>
      </div>

      {/* Live thumbnail preview */}
      {(thumbUrl || headline) && (
        <div>
          <label style={labelStyle}>Thumbnail Preview</label>
          <ThumbnailPreview headline={headline} category="TRENDING" imageUrl={thumbUrl} />
          {!thumbUrl && <p style={{ ...hintStyle, color: "#FF007A" }}>Paste a URL above to auto-fetch the thumbnail image</p>}
        </div>
      )}

      {/* Caption */}
      <div>
        <label style={labelStyle}>Caption <span style={{ color: "#555", fontWeight: 400 }}>(Instagram & Facebook post text)</span></label>
        <textarea
          value={caption} onChange={e => setCaption(e.target.value)}
          placeholder="Write your caption here..."
          rows={6}
          style={{ ...inputStyle, resize: "vertical" as const }}
        />
      </div>

      <button onClick={handlePost} disabled={!canPost}
        style={{ width: "100%", padding: "15px 0", fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" as const, color: "#fff", background: canPost ? PINK : "#1a1a1a", border: "none", borderRadius: 8, cursor: canPost ? "pointer" : "not-allowed", opacity: canPost ? 1 : 0.5, transition: "opacity .15s" }}>
        {status === "loading" ? "Posting video... (~60s)" : "Post Video to IG + FB"}
      </button>

      <PostResult status={status} result={result} />
    </div>
  );
}

// ── Carousel Tab ──────────────────────────────────────────────────────────────
interface CarouselItem { type: "image"; file: File; base64: string; preview: string; }

function CarouselTab() {
  const [cover, setCover] = useState<CarouselItem | null>(null);
  const [slides, setSlides] = useState<CarouselItem[]>([]);
  const [headline, setHeadline] = useState("");
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<any>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const slidesRef = useRef<HTMLInputElement>(null);

  const loadImage = useCallback(async (file: File): Promise<CarouselItem> => {
    const base64 = await fileToBase64(file);
    const preview = URL.createObjectURL(file);
    return { type: "image", file, base64, preview };
  }, []);

  async function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCover(await loadImage(file));
  }

  async function onSlidesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
    const loaded = await Promise.all(files.map(loadImage));
    setSlides(prev => [...prev, ...loaded].slice(0, 9));
  }

  function removeSlide(i: number) { setSlides(prev => prev.filter((_, idx) => idx !== i)); }

  async function handlePost() {
    if (!cover || slides.length === 0 || !caption.trim()) return;
    setStatus("loading"); setResult(null);
    try {
      const items = [cover, ...slides].map(item => ({ type: "image", base64: item.base64 }));
      const secret = await getSecret();
      const r = await fetch("/api/post-carousel", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + secret },
        body: JSON.stringify({ items, caption: caption.trim(), headline: headline.trim() }),
      });
      const d = await r.json();
      setResult(d);
      setStatus(d.instagram?.success || d.facebook?.success ? "success" : "error");
    } catch (err: any) { setResult({ error: err.message }); setStatus("error"); }
  }

  const canPost = cover && slides.length > 0 && caption.trim() && status !== "loading";
  const totalItems = (cover ? 1 : 0) + slides.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={hintStyle}>Cover image = first slide with PPP TV branded overlay. Add up to 9 more images after it.</p>

      {/* Cover */}
      <div>
        <label style={labelStyle}>Cover Image <span style={{ color: "#555", fontWeight: 400 }}>(required · gets PPP TV overlay)</span></label>
        <input ref={coverRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onCoverChange} />
        {cover ? (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <img src={cover.preview} alt="cover" style={{ width: 100, height: 125, objectFit: "cover", borderRadius: 6, display: "block" }} />
              <button onClick={() => setCover(null)}
                style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,.8)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              <span style={{ position: "absolute", bottom: 4, left: 4, background: PINK, color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: "2px 6px", borderRadius: 3 }}>COVER</span>
            </div>
            {headline && (
              <div style={{ flex: 1 }}>
                <p style={{ ...hintStyle, marginBottom: 8 }}>Thumbnail preview:</p>
                <ThumbnailPreview headline={headline} category="TRENDING" imageBase64={cover.base64} />
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => coverRef.current?.click()}
            style={{ width: "100%", padding: "32px 0", background: "#0a0a0a", border: "2px dashed #222", borderRadius: 8, color: "#555", fontSize: 13, cursor: "pointer" }}>
            + Upload Cover Image
          </button>
        )}
      </div>

      {/* Headline */}
      <div>
        <label style={labelStyle}>Headline <span style={{ color: "#555", fontWeight: 400 }}>(appears on cover thumbnail)</span></label>
        <input
          value={headline} onChange={e => setHeadline(e.target.value.toUpperCase())}
          placeholder="TYPE YOUR HEADLINE IN CAPS"
          maxLength={120}
          style={{ ...inputStyle, textTransform: "uppercase" as const, letterSpacing: 1 }}
        />
      </div>

      {/* Slides */}
      <div>
        <label style={labelStyle}>Slides <span style={{ color: "#555", fontWeight: 400 }}>(slides 2–10 · images only)</span></label>
        <input ref={slidesRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onSlidesChange} />
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8, marginBottom: 8 }}>
          {slides.map((item, i) => (
            <div key={i} style={{ position: "relative", width: 80, height: 100, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
              <img src={item.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button onClick={() => removeSlide(i)}
                style={{ position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,.8)", border: "none", color: "#fff", fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              <span style={{ position: "absolute", bottom: 3, left: 3, background: "#111", color: "#aaa", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3 }}>{i + 2}</span>
            </div>
          ))}
          {slides.length < 9 && (
            <button onClick={() => slidesRef.current?.click()}
              style={{ width: 80, height: 100, borderRadius: 6, background: "#0a0a0a", border: "2px dashed #222", color: "#555", fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
          )}
        </div>
        <p style={hintStyle}>{totalItems}/10 items total</p>
      </div>

      {/* Caption */}
      <div>
        <label style={labelStyle}>Caption</label>
        <textarea
          value={caption} onChange={e => setCaption(e.target.value)}
          placeholder="Write your caption here..."
          rows={6}
          style={{ ...inputStyle, resize: "vertical" as const }}
        />
      </div>

      <button onClick={handlePost} disabled={!canPost}
        style={{ width: "100%", padding: "15px 0", fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" as const, color: "#fff", background: canPost ? PINK : "#1a1a1a", border: "none", borderRadius: 8, cursor: canPost ? "pointer" : "not-allowed", opacity: canPost ? 1 : 0.5, transition: "opacity .15s" }}>
        {status === "loading" ? "Posting carousel..." : `Post Carousel (${totalItems} slides) to IG + FB`}
      </button>

      <PostResult status={status} result={result} />
    </div>
  );
}

// ── Shared result component ───────────────────────────────────────────────────
function PostResult({ status, result }: { status: Status; result: any }) {
  if (!result || status === "idle" || status === "loading") return null;
  const ok = status === "success";
  return (
    <div style={{ borderRadius: 8, padding: "14px 16px", background: ok ? "rgba(16,185,129,.08)" : "rgba(239,68,68,.08)", border: `1px solid ${ok ? "#10b981" : "#ef4444"}` }}>
      {ok ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 700, color: "#4ade80", fontSize: 13 }}>Posted successfully</span>
          {result.instagram?.success && <span style={{ fontSize: 12, color: "#aaa" }}>Instagram ✓ {result.instagram.postId}</span>}
          {result.facebook?.success && <span style={{ fontSize: 12, color: "#aaa" }}>Facebook ✓ {result.facebook.postId}</span>}
          {!result.instagram?.success && <span style={{ fontSize: 12, color: "#f87171" }}>Instagram ✗ {result.instagram?.error}</span>}
          {!result.facebook?.success && <span style={{ fontSize: 12, color: "#f87171" }}>Facebook ✗ {result.facebook?.error}</span>}
        </div>
      ) : (
        <span style={{ color: "#f87171", fontSize: 13 }}>{result.error || "Post failed"}</span>
      )}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = { display: "block", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#666", marginBottom: 8 };
const inputStyle: React.CSSProperties = { width: "100%", background: "#0a0a0a", border: "1px solid #222", borderRadius: 6, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" };
const hintStyle: React.CSSProperties = { fontSize: 11, color: "#444", marginTop: 5 };
const ghostBtnStyle: React.CSSProperties = { background: "#111", border: "1px solid #333", color: "#888", borderRadius: 6, padding: "12px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ComposerPage() {
  const [tab, setTab] = useState<Tab>("video");

  return (
    <div style={{ minHeight: "100dvh", background: "#000", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0} input,button,textarea,select{font-family:inherit} input::placeholder,textarea::placeholder{color:#444} textarea{font-family:inherit}`}</style>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <a href="/dashboard" style={{ fontSize: 11, color: "#444", textDecoration: "none", letterSpacing: 1 }}>← DASHBOARD</a>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: PINK }} />
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 2 }}>
              AUTO <span style={{ color: PINK }}>PPP TV</span>
            </span>
            <span style={{ fontSize: 10, color: "#444", letterSpacing: 2 }}>COMPOSER</span>
          </div>
          <p style={{ fontSize: 12, color: "#444", marginTop: 6 }}>Manually post a video or carousel to Instagram & Facebook</p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, padding: 4, background: "#0a0a0a", borderRadius: 8, border: "1px solid #111" }}>
          {([["video", "🎬  Video Post"], ["carousel", "🖼  Carousel"]] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none", borderRadius: 6, cursor: "pointer", transition: "all .15s", background: tab === t ? PINK : "transparent", color: tab === t ? "#fff" : "#555" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "video" ? <VideoTab /> : <CarouselTab />}
      </div>
    </div>
  );
}
