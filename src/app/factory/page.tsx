"use client";
import { useState } from "react";
import Shell from "../shell";

const PINK = "#FF007A";
const GREEN = "#4ade80";
const RED = "#f87171";
const PURPLE = "#a855f7";
const ORANGE = "#f97316";
const YELLOW = "#facc15";

const CATS = ["AUTO","CELEBRITY","MUSIC","TV & FILM","FASHION","EVENTS","AWARDS","EAST AFRICA","GENERAL","SPORTS","BUSINESS","POLITICS","TECHNOLOGY","HEALTH","SCIENCE","LIFESTYLE","COMEDY","INFLUENCERS"];

interface BulkItem {
  url: string;
  headline: string;
  caption: string;
  category: string;
  status: "pending" | "fetching" | "ready" | "posting" | "done" | "error";
  error?: string;
  ig?: boolean;
  fb?: boolean;
}

function Spin() {
  return <span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid rgba(255,255,255,.15)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />;
}

const STATUS_COLOR: Record<string, string> = {
  pending: "#444", fetching: YELLOW, ready: PURPLE, posting: ORANGE, done: GREEN, error: RED,
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", fetching: "Fetching…", ready: "Ready", posting: "Posting…", done: "Posted ✓", error: "Failed",
};

export default function FactoryPage() {
  const [mode, setMode] = useState<"bulk" | "clone">("bulk");
  const [bulkInput, setBulkInput] = useState("");
  const [items, setItems] = useState<BulkItem[]>([]);
  const [running, setRunning] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneResult, setCloneResult] = useState<any>(null);
  const [cloneLoading, setCloneLoading] = useState(false);

  function updateItem(i: number, patch: Partial<BulkItem>) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, ...patch } : item));
  }

  async function loadBulk() {
    const urls = bulkInput.split("\n").map(u => u.trim()).filter(Boolean).slice(0, 10);
    if (!urls.length) return;
    const newItems: BulkItem[] = urls.map(url => ({ url, headline: "", caption: "", category: "GENERAL", status: "fetching" }));
    setItems(newItems);

    for (let i = 0; i < newItems.length; i++) {
      try {
        const r = await fetch("/api/preview-url", { credentials: "include", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: newItems[i].url }) });
        const d = await r.json() as any;
        updateItem(i, {
          headline: (d.ai?.clickbaitTitle || d.scraped?.title || "").toUpperCase().slice(0, 120),
          caption: d.ai?.caption || "",
          category: d.category || "GENERAL",
          status: "ready",
        });
      } catch {
        updateItem(i, { status: "error", error: "Failed to fetch" });
      }
    }
  }

  async function repostItem(i: number) {
    setRunning(true);
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, status: "posting" } : item));
    try {
      const item = items[i];
      const resp = await fetch("/api/post-video", {
        credentials: "include", method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url, headline: item.headline, caption: item.caption + `\n\nSource: ${item.url}`, category: item.category }),
      });
      if (!resp.body) throw new Error("No response body");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", finalEvt: any = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try { const evt = JSON.parse(line.slice(6)); if (evt.done) finalEvt = evt; } catch {}
        }
      }
      updateItem(i, { status: finalEvt?.success ? "done" : "error", ig: finalEvt?.instagram?.success, fb: finalEvt?.facebook?.success, error: finalEvt?.error });
    } catch (e: any) {
      updateItem(i, { status: "error", error: e.message });
    }
    setRunning(false);
  }

  async function postAll() {
    setRunning(true);
    const readyItems = items.filter(it => it.status === "ready");
    for (let i = 0; i < items.length; i++) {
      if (items[i].status !== "ready") continue;
      updateItem(i, { status: "posting" });
      try {
        const resp = await fetch("/api/post-video", {
          credentials: "include", method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: items[i].url, headline: items[i].headline, caption: items[i].caption + `\n\nSource: ${items[i].url}`, category: items[i].category }),
        });
        if (!resp.body) throw new Error("No response body");
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "", finalEvt: any = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n"); buf = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try { const evt = JSON.parse(line.slice(6)); if (evt.done) finalEvt = evt; } catch {}
          }
        }
        updateItem(i, { status: finalEvt?.success ? "done" : "error", ig: finalEvt?.instagram?.success, fb: finalEvt?.facebook?.success, error: finalEvt?.error });
      } catch (e: any) {
        updateItem(i, { status: "error", error: e.message });
      }
      if (i < items.length - 1) await new Promise(r => setTimeout(r, 8000));
    }
    setRunning(false);
  }

  async function cloneViral() {
    if (!cloneUrl.trim()) return;
    setCloneLoading(true); setCloneResult(null);
    try {
      const r = await fetch("/api/preview-url", { credentials: "include", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: cloneUrl.trim() }) });
      const d = await r.json() as any;
      setCloneResult(d);
    } catch (e: any) { setCloneResult({ error: e.message }); }
    setCloneLoading(false);
  }

  const readyCount = items.filter(it => it.status === "ready").length;
  const doneCount = items.filter(it => it.status === "done").length;

  return (
    <Shell>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ padding: "28px 24px 80px", maxWidth: 900, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <span style={{ fontSize: 24 }}>🏭</span>
          <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 3, margin: 0 }}>Content Factory</h1>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 3, padding: 3, background: "#0a0a0a", borderRadius: 8, border: "1px solid #1a1a1a", marginBottom: 24, maxWidth: 400 }}>
          {(["bulk", "clone"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: "9px 0", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" as const, border: "none", borderRadius: 6, cursor: "pointer", background: mode === m ? PINK : "transparent", color: mode === m ? "#fff" : "#444" }}>
              {m === "bulk" ? "📦 Bulk Post" : "🔁 Clone Viral"}
            </button>
          ))}
        </div>

        {mode === "bulk" && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, color: "#555", marginBottom: 7 }}>
                Paste up to 10 URLs (one per line)
              </label>
              <textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)} rows={6}
                placeholder={"https://tiktok.com/@citizen.digital/video/...\nhttps://youtube.com/watch?v=...\nhttps://twitter.com/..."}
                style={{ width: "100%", background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 7, padding: "11px 13px", color: "#e5e5e5", fontSize: 13, outline: "none", fontFamily: "inherit", resize: "vertical" as const }} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={loadBulk} disabled={!bulkInput.trim() || running} style={{ background: PURPLE, border: "none", color: "#fff", borderRadius: 7, padding: "10px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  ✨ Generate All
                </button>
                {readyCount > 0 && (
                  <button onClick={postAll} disabled={running} style={{ background: PINK, border: "none", color: "#fff", borderRadius: 7, padding: "10px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    {running ? <><Spin /> Posting…</> : `🚀 Post All (${readyCount})`}
                  </button>
                )}
              </div>
            </div>

            {items.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                <div style={{ position: "sticky" as const, top: 0, zIndex: 10, background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 7, padding: "8px 14px", display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#555" }}>{items.length} items · {doneCount} posted · {readyCount} ready</span>
                </div>
                {items.map((item, i) => (
                  <div key={i} style={{ background: "#0a0a0a", border: `1px solid ${STATUS_COLOR[item.status]}33`, borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                          <span style={{ background: STATUS_COLOR[item.status] + "22", color: STATUS_COLOR[item.status], fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4, textTransform: "uppercase" as const, letterSpacing: 1 }}>{STATUS_LABEL[item.status]}</span>
                          <span style={{ fontSize: 10, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{item.url.slice(0, 60)}…</span>
                        </div>
                        {item.status === "ready" || item.status === "done" || item.status === "posting" ? (
                          <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                            <input value={item.headline} onChange={e => updateItem(i, { headline: e.target.value.toUpperCase() })}
                              style={{ background: "#111", border: "1px solid #222", borderRadius: 5, padding: "7px 10px", color: "#e5e5e5", fontSize: 12, outline: "none", fontFamily: "inherit", textTransform: "uppercase" as const, letterSpacing: 1 }} />
                            <div style={{ display: "flex", gap: 6 }}>
                              <select value={item.category} onChange={e => updateItem(i, { category: e.target.value })}
                                style={{ background: "#111", border: "1px solid #222", borderRadius: 5, padding: "5px 8px", color: "#aaa", fontSize: 11, outline: "none" }}>
                                {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                              {item.status === "done" && (
                                <span style={{ fontSize: 11, color: GREEN }}>IG {item.ig ? "✓" : "✗"} · FB {item.fb ? "✓" : "✗"}</span>
                              )}
                            </div>
                          </div>
                        ) : item.status === "error" ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ fontSize: 11, color: RED }}>{item.error}</div>
                            <button onClick={() => repostItem(i)} disabled={running} style={{ background: RED + "22", border: `1px solid ${RED}44`, color: RED, borderRadius: 5, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: running ? "not-allowed" : "pointer" }}>↺ Retry</button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === "clone" && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, color: "#555", marginBottom: 7 }}>
                Paste any viral post URL — we'll reverse-engineer the format for your brand
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={cloneUrl} onChange={e => setCloneUrl(e.target.value)} placeholder="https://tiktok.com/@viral/video/... or any URL"
                  style={{ flex: 1, background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 7, padding: "11px 13px", color: "#e5e5e5", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
                <button onClick={cloneViral} disabled={!cloneUrl.trim() || cloneLoading} style={{ background: PINK, border: "none", color: "#fff", borderRadius: 7, padding: "11px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  {cloneLoading ? <><Spin /> Analyzing…</> : "🔁 Clone It"}
                </button>
              </div>
            </div>

            {cloneResult && !cloneResult.error && (
              <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, padding: "20px" }}>
                <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, textTransform: "uppercase" as const, fontWeight: 700, marginBottom: 14 }}>Cloned Format — Ready for PPP TV</div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#444", marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: 1 }}>Headline</div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 1, color: "#fff" }}>{cloneResult.ai?.clickbaitTitle}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#444", marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: 1 }}>Caption</div>
                    <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.6, whiteSpace: "pre-line" as const }}>{cloneResult.ai?.caption}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <a href={`/composer?url=${encodeURIComponent(cloneUrl)}`} style={{ background: PINK, color: "#fff", borderRadius: 7, padding: "10px 20px", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
                      ▶ Post This Version
                    </a>
                  </div>
                </div>
              </div>
            )}
            {cloneResult?.error && <div style={{ color: RED, fontSize: 13 }}>{cloneResult.error}</div>}
          </div>
        )}
      </div>
    </Shell>
  );
}
