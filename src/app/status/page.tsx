"use client";
import { useState, useEffect } from "react";
import Shell from "../shell";

const GREEN = "#4ade80", RED = "#f87171", ORANGE = "#f97316", YELLOW = "#facc15";

function dot(ok: boolean | undefined, degraded?: boolean) {
  const color = ok === undefined ? YELLOW : ok ? GREEN : degraded ? ORANGE : RED;
  return <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block", boxShadow: `0 0 6px ${color}`, flexShrink: 0 }} />;
}

export default function StatusPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  async function check() {
    setLoading(true);
    try {
      const t0 = Date.now();
      const r = await fetch("/api/post-log?limit=1", { credentials: "include" });
      const latencyMs = Date.now() - t0;
      if (r.ok) {
        const json = await r.json();
        const ok = Array.isArray(json.log);
        setData({
          status: ok ? "ok" : "error",
          dependencies: {
            supabase: { ok, latencyMs },
          },
        });
      } else {
        setData({ status: "error", dependencies: { supabase: { ok: false, latencyMs: 0 } } });
      }
      setLastCheck(new Date());
    } catch {
      setData({ status: "error", dependencies: { supabase: { ok: false, latencyMs: 0 } } });
    }
    setLoading(false);
  }

  useEffect(() => { check(); const t = setInterval(check, 60000); return () => clearInterval(t); }, []);

  const deps = data?.dependencies || {};
  const items = [
    { name: "Supabase DB", key: "supabase", icon: "🗄️" },
    { name: "Meta Graph API", key: "metaGraphApi", icon: "📘" },
    { name: "Gemini AI", key: "geminiApi", icon: "🤖" },
    { name: "Cloudflare Worker", key: "cloudflareWorker", icon: "⚡" },
    { name: "R2 Storage", key: "r2Storage", icon: "🗄️" },
    { name: "X (Twitter)", key: "xPosting", icon: "𝕏" },
  ];

  const overallColor = data?.status === "ok" ? GREEN : data?.status === "degraded" ? ORANGE : RED;

  return (
    <Shell>
      <div style={{ minHeight: "100vh", background: "#050505", color: "#e5e5e5", fontFamily: "system-ui, sans-serif", padding: "40px 20px" }}>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 36, letterSpacing: 4, marginBottom: 8 }}>PPP TV STATUS</div>
            <div style={{ fontSize: 12, color: "#444", letterSpacing: 2 }}>SYSTEM HEALTH MONITOR</div>
          </div>

          {/* Overall status */}
          <div style={{ background: "#0a0a0a", border: `2px solid ${overallColor}44`, borderRadius: 12, padding: "20px 24px", marginBottom: 24, display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ width: 14, height: 14, borderRadius: "50%", background: overallColor, display: "inline-block", boxShadow: `0 0 10px ${overallColor}`, animation: "pulse 2s ease-in-out infinite" }} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: overallColor, textTransform: "uppercase", letterSpacing: 2 }}>
                {loading ? "Checking…" : data?.status || "Unknown"}
              </div>
              <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>
                {lastCheck ? `Last checked: ${lastCheck.toLocaleTimeString("en-KE", { timeZone: "Africa/Nairobi" })} EAT` : "Checking…"}
              </div>
            </div>
            <button onClick={check} style={{ marginLeft: "auto", background: "none", border: "1px solid #222", color: "#555", borderRadius: 6, padding: "6px 14px", fontSize: 11, cursor: "pointer" }}>↻ Refresh</button>
          </div>

          {/* Warnings */}
          {data?.warnings?.length > 0 && (
            <div style={{ background: "#1a0a00", border: "1px solid #f9731644", borderRadius: 10, padding: "14px 18px", marginBottom: 20 }}>
              {data.warnings.map((w: string, i: number) => (
                <div key={i} style={{ fontSize: 12, color: ORANGE, display: "flex", gap: 8, alignItems: "center" }}>
                  <span>⚠</span><span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Services */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map(item => {
              const dep = deps[item.key];
              return (
                <div key={item.key} style={{ background: "#0a0a0a", border: "1px solid #111", borderRadius: 9, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  {dot(dep?.ok)}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd" }}>{item.name}</div>
                    {dep?.error && <div style={{ fontSize: 11, color: RED, marginTop: 2 }}>{dep.error}</div>}
                    {dep?.tokenExpiresIn !== undefined && (
                      <div style={{ fontSize: 11, color: dep.tokenExpiresIn < 7 ? ORANGE : GREEN, marginTop: 2 }}>
                        Token expires in {dep.tokenExpiresIn} days
                      </div>
                    )}
                  </div>
                  {dep?.latencyMs > 0 && (
                    <span style={{ fontSize: 11, color: dep.latencyMs < 500 ? GREEN : dep.latencyMs < 2000 ? ORANGE : RED }}>
                      {dep.latencyMs}ms
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: dep?.ok ? GREEN : RED, fontWeight: 800 }}>
                    {dep === undefined ? "—" : dep.ok ? "Operational" : "Down"}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ textAlign: "center", marginTop: 30, fontSize: 11, color: "#222" }}>
            Auto-refreshes every 60 seconds · PPP TV Kenya
          </div>
        </div>
      </div>
    </Shell>
  );
}
