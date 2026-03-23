"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const CATS = ["AUTO","CELEBRITY","MUSIC","TV & FILM","FASHION","EVENTS","AWARDS","EAST AFRICA","GENERAL"];

interface LogEntry {
  articleId: string; title: string; url: string; category: string;
  sourceType?: string; manualPost?: boolean; isBreaking?: boolean;
  instagram: { success: boolean; postId?: string; error?: string };
  facebook: { success: boolean; postId?: string; error?: string };
  postedAt: string;
}
interface ScrapedInfo {
  type: string; title: string; description: string; imageUrl: string;
  sourceName: string; isVideo?: boolean; videoEmbedUrl?: string | null; videoUrl?: string | null;
}
interface Preview { scraped: ScrapedInfo; ai: { clickbaitTitle: string; caption: string }; category: string; imageBase64: string }
interface Retry { loading: boolean; done?: boolean; error?: string }

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  return Math.floor(h / 24) + "d";
}

export default function Dashboard() {
  const [tab, setTab] = useState<"post" | "log" | "stats">("post");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [cat, setCat] = useState("AUTO");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [prevLoading, setPrevLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const [retries, setRetries] = useState<Record<string, Retry>>({});
  const [igTitle, setIgTitle] = useState("");
  const [igCaption, setIgCaption] = useState("");
  const [needsManual, setNeedsManual] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(label); setTimeout(() => setCopied(null), 2000); }).catch(() => {});
  }

  const fetchLog = useCallback(async () => {
    try {
      const r = await fetch("/api/post-log");
      if (r.ok) { const d = await r.json(); setLog(d.log || []); }
    } catch {}
    finally { setLogLoading(false); }
  }, []);

  useEffect(() => { fetchLog(); const t = setInterval(fetchLog, 60000); return () => clearInterval(t); }, [fetchLog]);
  useEffect(() => { setNeedsManual(false); setIgTitle(""); setIgCaption(""); setErr(null); setPreview(null); setOk(null); setShowPlayer(false); }, [url]);

  async function doPreview(overrideTitle?: string, overrideCaption?: string) {
    if (!url.trim()) return;
    setPrevLoading(true); setErr(null); setPreview(null); setOk(null); setShowPlayer(false);
    try {
      const body: Record<string, string> = { url: url.trim() };
      if (cat !== "AUTO") body.category = cat;
      if (overrideTitle) body.manualTitle = overrideTitle;
      if (overrideCaption) body.manualCaption = overrideCaption;
      const r = await fetch("/api/preview-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.error === "INSTAGRAM_MANUAL") { setNeedsManual(true); setPrevLoading(false); return; }
      if (!r.ok || d.error) throw new Error(d.error || "Preview failed");
      setNeedsManual(false); setPreview(d);
    } catch (e: any) { setErr(e.message); }
    finally { setPrevLoading(false); }
  }

  async function doPost() {
    if (!preview) return;
    setPosting(true); setErr(null); setOk(null);
    try {
      const body: Record<string, string> = { url: url.trim() };
      if (cat !== "AUTO") body.category = cat;
      if (needsManual && igTitle) body.manualTitle = igTitle;
      if (needsManual && igCaption) body.manualCaption = igCaption;
      const r = await fetch("/api/post-from-url-proxy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Post failed");
      const ig = d.instagram?.success, fb = d.facebook?.success;
      setOk((ig && fb) ? "Posted to IG + FB" : ig ? "Posted to IG only" : fb ? "Posted to FB only" : "Both failed: " + ((d.instagram?.error || d.facebook?.error) || "unknown"));
      if (ig || fb) { setUrl(""); setPreview(null); setNeedsManual(false); setTimeout(fetchLog, 2000); }
    } catch (e: any) { setErr(e.message); }
    finally { setPosting(false); }
  }

  async function doRetry(entry: LogEntry, platform: "instagram" | "facebook") {
    const key = entry.articleId + "_" + platform;
    setRetries(s => ({ ...s, [key]: { loading: true } }));
    try {
      const r = await fetch("/api/retry-post", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId: entry.articleId, title: entry.title, caption: entry.title, articleUrl: entry.url, category: entry.category, platform }) });
      const d = await r.json();
      const success = platform === "instagram" ? d.instagram?.success : d.facebook?.success;
      setRetries(s => ({ ...s, [key]: { loading: false, done: success, error: success ? undefined : (d.error || "Failed") } }));
      if (success) setTimeout(fetchLog, 1500);
    } catch (e: any) { setRetries(s => ({ ...s, [key]: { loading: false, error: e.message } })); }
  }

  const todayCount = log.filter(p => new Date(p.postedAt).toDateString() === new Date().toDateString()).length;
  const successCount = log.filter(p => p.instagram.success || p.facebook.success).length;
  const igCount = log.filter(p => p.instagram.success).length;
  const fbCount = log.filter(p => p.facebook.success).length;
  const catCounts = CATS.reduce((a, c) => ({ ...a, [c]: log.filter(p => p.category === c).length }), {} as Record<string, number>);
  const maxCat = Math.max(1, ...Object.values(catCounts));
  const isVideo = preview?.scraped?.isVideo;
  const embedUrl = preview?.scraped?.videoEmbedUrl;
  const videoTypeLabel = preview?.scraped?.type === "youtube" ? "YouTube" : preview?.scraped?.type === "tiktok" ? "TikTok" : preview?.scraped?.type === "instagram" ? "Instagram Reel" : "Video";

  return (
    <div style={{ minHeight: "100dvh", background: "#000", color: "#fff", fontFamily: "'Inter',system-ui,sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
        html,body{height:100%;background:#000}
        input,button,textarea{font-family:inherit}
        input::placeholder,textarea::placeholder{color:#555}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-track{background:#000}
        ::-webkit-scrollbar-thumb{background:#333;border-radius:2px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.2}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .fade{animation:fadeUp .2s ease}
        .inp{width:100%;background:#0a0a0a;border:1px solid #222;border-radius:6px;padding:13px 14px;color:#fff;font-size:15px;outline:none;transition:border-color .15s}
        .inp:focus{border-color:#FF007A}
        .btn-primary{background:#FF007A;color:#fff;border:none;border-radius:6px;padding:13px 22px;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:.3px;transition:opacity .15s;white-space:nowrap}
        .btn-primary:hover:not(:disabled){opacity:.85}
        .btn-primary:disabled{opacity:.35;cursor:not-allowed}
        .btn-ghost{background:none;border:1px solid #222;color:#888;border-radius:6px;padding:9px 14px;font-size:13px;cursor:pointer;transition:all .15s}
        .btn-ghost:hover{border-color:#444;color:#ccc}
        .btn-danger{background:#1a0a0a;border:1px solid #3a1a1a;color:#f87171;border-radius:4px;padding:3px 10px;font-size:11px;cursor:pointer}
        .btn-danger:hover:not(:disabled){background:#2a0a0a}
        .card{background:#0a0a0a;border:1px solid #111;border-radius:10px}
        .tag{display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
        .cat-pill{padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid #1a1a1a;background:#0a0a0a;color:#555;transition:all .15s;white-space:nowrap}
        .cat-pill.active{background:#FF007A;color:#fff;border-color:#FF007A}
        .nav-tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px 0;background:none;border:none;color:#444;cursor:pointer;transition:color .15s;font-size:10px;letter-spacing:1px;font-weight:700;text-transform:uppercase}
        .nav-tab.active{color:#FF007A}
        .tab-btn{background:none;border:none;color:#444;font-size:13px;font-weight:600;cursor:pointer;padding:8px 0;border-bottom:2px solid transparent;transition:all .15s;letter-spacing:.3px}
        .tab-btn.active{color:#fff;border-bottom-color:#FF007A}
        @media(min-width:640px){.mobile-nav{display:none!important}.desktop-tabs{display:flex!important}}
        @media(max-width:639px){.desktop-tabs{display:none!important}.mobile-nav{display:flex!important}}
      `}</style>

      {/* Header */}
      <header style={{ padding: "14px 16px", borderBottom: "1px solid #111", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#000", zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#E50914", animation: "pulse 1.5s infinite" }} />
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 1 }}>
            AUTO <span style={{ color: "#E50914" }}>PPP TV</span>
          </span>
          <span style={{ fontSize: 10, color: "#444", letterSpacing: 2, textTransform: "uppercase" }}>LIVE</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "#555" }}>{todayCount}/24 today</span>
          <Link href="/composer" style={{ fontSize: 12, color: "#FF007A", textDecoration: "none", fontWeight: 600 }}>+ Video</Link>
        </div>
      </header>

      {/* Desktop tabs */}
      <div className="desktop-tabs" style={{ display: "none", gap: 24, padding: "0 16px", borderBottom: "1px solid #111" }}>
        {(["post", "log", "stats"] as const).map(t => (
          <button key={t} className={`tab-btn${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t === "post" ? "Post" : t === "log" ? `Feed (${log.length})` : "Stats"}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px", paddingBottom: 80, maxWidth: 600, width: "100%", margin: "0 auto" }}>

        {/* POST TAB */}
        {tab === "post" && (
          <div className="fade">
            <input className="inp" placeholder="Paste article / YouTube / TikTok / Twitter URL..." value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && doPreview()} style={{ marginBottom: 12 }} />

            {/* Category pills */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {CATS.map(c => (
                <button key={c} className={`cat-pill${cat === c ? " active" : ""}`} onClick={() => setCat(c)}>{c}</button>
              ))}
            </div>

            {/* Manual IG fields */}
            {needsManual && (
              <div className="card fade" style={{ padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "#FF007A", marginBottom: 10, fontWeight: 600 }}>Instagram needs manual title + caption</div>
                <input className="inp" placeholder="Headline / title..." value={igTitle} onChange={e => setIgTitle(e.target.value)} style={{ marginBottom: 8 }} />
                <textarea className="inp" placeholder="Caption..." value={igCaption} onChange={e => setIgCaption(e.target.value)} rows={3} style={{ resize: "vertical" }} />
                <button className="btn-primary" style={{ marginTop: 10, width: "100%" }} onClick={() => doPreview(igTitle, igCaption)} disabled={!igTitle || !igCaption || prevLoading}>
                  {prevLoading ? "Generating..." : "Generate Preview"}
                </button>
              </div>
            )}

            {!needsManual && (
              <button className="btn-primary" style={{ width: "100%", marginBottom: 14 }} onClick={() => doPreview()} disabled={!url.trim() || prevLoading}>
                {prevLoading ? <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> : "Preview"}
              </button>
            )}

            {err && <div style={{ background: "#1a0a0a", border: "1px solid #3a1a1a", borderRadius: 6, padding: "10px 14px", color: "#f87171", fontSize: 13, marginBottom: 12 }}>{err}</div>}
            {ok && <div style={{ background: "#0a1a0a", border: "1px solid #1a3a1a", borderRadius: 6, padding: "10px 14px", color: "#4ade80", fontSize: 13, marginBottom: 12 }}>{ok}</div>}

            {preview && (
              <div className="card fade" style={{ overflow: "hidden", marginBottom: 12 }}>
                {/* Thumbnail */}
                <div style={{ position: "relative", cursor: "zoom-in" }} onClick={() => setLightbox(true)}>
                  <img src={preview.imageBase64} alt="" style={{ width: "100%", display: "block", aspectRatio: "4/5", objectFit: "cover" }} />
                  <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.7)", borderRadius: 4, padding: "3px 8px", fontSize: 10, color: "#fff" }}>4:5</div>
                </div>

                {/* Video player toggle */}
                {isVideo && embedUrl && (
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid #111" }}>
                    <button className="btn-ghost" style={{ width: "100%", fontSize: 12 }} onClick={() => setShowPlayer(p => !p)}>
                      {showPlayer ? "Hide" : "Play"} {videoTypeLabel}
                    </button>
                    {showPlayer && (
                      <div style={{ marginTop: 10, borderRadius: 6, overflow: "hidden", aspectRatio: "16/9" }}>
                        <iframe src={embedUrl} style={{ width: "100%", height: "100%", border: "none" }} allowFullScreen />
                      </div>
                    )}
                  </div>
                )}

                {/* AI content */}
                <div style={{ padding: 14 }}>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, lineHeight: 1.3, marginBottom: 8, letterSpacing: .5 }}>{preview.ai.clickbaitTitle}</div>
                  <div style={{ fontSize: 13, color: "#666", lineHeight: 1.6, marginBottom: 12 }}>{preview.ai.caption}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                    <span className="tag" style={{ background: "#FF007A", color: "#fff" }}>{preview.category}</span>
                    {isVideo && <span className="tag" style={{ background: "#1a1a1a", color: "#888" }}>{videoTypeLabel}</span>}
                    <button onClick={() => copyText(preview.ai.clickbaitTitle, "title")} className="btn-ghost" style={{ padding: "2px 8px", fontSize: 10 }}>{copied === "title" ? "Copied!" : "Copy Title"}</button>
                    <button onClick={() => copyText(preview.ai.caption, "caption")} className="btn-ghost" style={{ padding: "2px 8px", fontSize: 10 }}>{copied === "caption" ? "Copied!" : "Copy Caption"}</button>
                  </div>
                  <button className="btn-primary" style={{ width: "100%" }} onClick={doPost} disabled={posting}>
                    {posting ? <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> : "Post to IG + FB"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* LOG TAB */}
        {tab === "log" && (
          <div className="fade">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#444", letterSpacing: 1, textTransform: "uppercase" }}>Post Log</div>
              <button className="btn-ghost" style={{ padding: "5px 12px", fontSize: 11 }} onClick={fetchLog}>↻ Refresh</button>
            </div>
            {logLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: "#333" }}>Loading...</div>
            ) : log.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#333" }}>No posts yet</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {log.slice().reverse().map(entry => {
                  const igKey = entry.articleId + "_instagram", fbKey = entry.articleId + "_facebook";
                  const igR = retries[igKey], fbR = retries[fbKey];
                  return (
                    <div key={entry.articleId} className="card" style={{ padding: "14px 16px" }}>
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, lineHeight: 1.4, marginBottom: 8, letterSpacing: .5 }}>{entry.title}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
                        <span className="tag" style={{ background: "#FF007A", color: "#fff" }}>{entry.category}</span>
                        {entry.isBreaking && <span className="tag" style={{ background: "#E50914", color: "#fff" }}>BREAKING</span>}
                        {entry.manualPost && <span className="tag" style={{ background: "#222", color: "#888" }}>MANUAL</span>}
                        <span style={{ fontSize: 11, color: "#444" }}>{ago(entry.postedAt)}</span>
                        {entry.url && <button onClick={() => copyText(entry.url, "log_" + entry.articleId)} style={{ background: "none", border: "1px solid #1a1a1a", borderRadius: 3, padding: "1px 7px", fontSize: 10, color: "#444", cursor: "pointer" }}>{copied === ("log_" + entry.articleId) ? "✓" : "Copy"}</button>}
                      </div>
                      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                        {(["instagram", "facebook"] as const).map(platform => {
                          const key = entry.articleId + "_" + platform;
                          const r = retries[key];
                          const success = platform === "instagram" ? entry.instagram.success : entry.facebook.success;
                          const label = platform === "instagram" ? "IG" : "FB";
                          return (
                            <div key={platform} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 11, color: "#333" }}>{label}:</span>
                              {success || r?.done
                                ? <span style={{ fontSize: 11, color: "#4ade80" }}>✓</span>
                                : <button onClick={() => doRetry(entry, platform)} disabled={r?.loading} className="btn-danger" style={{ padding: "2px 10px", fontSize: 11, opacity: r?.loading ? .4 : 1 }}>
                                    {r?.loading ? "..." : "↺ Retry"}
                                  </button>
                              }
                            </div>
                          );
                        })}
                      </div>
                      {(retries[igKey]?.error || retries[fbKey]?.error) && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{retries[igKey]?.error || retries[fbKey]?.error}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STATS TAB */}
        {tab === "stats" && (
          <div className="fade">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {([["Today", todayCount, "#FF007A"], ["Total", successCount, "#fff"], ["IG", igCount, "#E1306C"], ["FB", fbCount, "#1877f2"]] as const).map(([l, v, c]) => (
                <div key={l} className="card" style={{ padding: "20px 18px" }}>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 44, color: c, lineHeight: 1, letterSpacing: 1 }}>{v}</div>
                  <div style={{ fontSize: 10, color: "#444", marginTop: 5, letterSpacing: 2, fontWeight: 700, textTransform: "uppercase" }}>{l}</div>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: "16px 18px", marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "#444", letterSpacing: 2, fontWeight: 700, textTransform: "uppercase", marginBottom: 14 }}>By Category</div>
              {CATS.filter(c => catCounts[c] > 0).map(c => (
                <div key={c} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "#555", width: 90, flexShrink: 0, letterSpacing: .3 }}>{c}</div>
                  <div style={{ flex: 1, background: "#111", borderRadius: 2, height: 4 }}>
                    <div style={{ width: `${Math.round(catCounts[c] / maxCat * 100)}%`, background: "#FF007A", borderRadius: 2, height: 4, transition: "width .4s" }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#444", width: 16, textAlign: "right" }}>{catCounts[c]}</div>
                </div>
              ))}
              {CATS.every(c => catCounts[c] === 0) && <div style={{ color: "#333", fontSize: 12 }}>No data yet</div>}
            </div>
            <div className="card" style={{ padding: "16px 18px" }}>
              <div style={{ fontSize: 10, color: "#444", letterSpacing: 2, fontWeight: 700, textTransform: "uppercase", marginBottom: 14 }}>Config</div>
              {[["Schedule", "Every 15 min"], ["Peak Hours", "6am-11pm EAT"], ["Daily Cap", "24/day"], ["Per Run", "1 post"], ["Dedup", "Cloudflare KV"], ["Filter", "Kenya only"]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #0f0f0f", fontSize: 12 }}>
                  <span style={{ color: "#444" }}>{k}</span>
                  <span style={{ fontWeight: 600, color: "#888" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>

      {/* Mobile bottom nav */}
      <nav className="mobile-nav" style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#000", borderTop: "1px solid #111", zIndex: 50 }}>
        {([{ id: "post", icon: "📤", label: "Post" }, { id: "log", icon: "📋", label: "Feed", badge: log.length }, { id: "stats", icon: "📊", label: "Stats" }] as any[]).map((n) => (
          <button key={n.id} className={`nav-tab${tab === n.id ? " active" : ""}`} onClick={() => setTab(n.id)}>
            <span style={{ fontSize: 18 }}>{n.icon}</span>
            <span style={{ fontSize: 9, letterSpacing: 1 }}>
              {n.label}
              {n.badge > 0 ? <span style={{ background: "#E50914", borderRadius: 8, padding: "0 4px", fontSize: 9, marginLeft: 3 }}>{n.badge}</span> : null}
            </span>
          </button>
        ))}
      </nav>

      {/* Lightbox */}
      {lightbox && preview?.imageBase64 && (
        <div onClick={() => setLightbox(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.97)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
          <img src={preview.imageBase64} alt="" style={{ maxWidth: "95vw", maxHeight: "90dvh", borderRadius: 6, objectFit: "contain" }} />
        </div>
      )}
    </div>
  );
}
