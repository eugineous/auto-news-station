"use client";
import { useState } from "react";
import Shell from "../shell";

const PLATFORMS = [
  { name: "Instagram", icon: "📸", color: "#E1306C", desc: "Post photos, videos, reels & carousels", verify: true },
  { name: "Facebook", icon: "👥", color: "#1877f2", desc: "Post to your Facebook Page", verify: true },
  { name: "Twitter / X", icon: "🐦", color: "#1DA1F2", desc: "Tweet text, images & videos", soon: true },
  { name: "TikTok", icon: "🎵", color: "#ff0050", desc: "Post short-form videos", soon: true },
  { name: "YouTube", icon: "▶️", color: "#FF0000", desc: "Upload videos & Shorts", soon: true },
  { name: "Threads", icon: "🧵", color: "#fff", desc: "Post to Meta Threads", soon: true },
];

export default function AccountsPage() {
  const [verifyStatus, setVerifyStatus] = useState<Record<string, { ok?: boolean; error?: string } | null>>({});
  const [verifying, setVerifying] = useState<Record<string, boolean>>({});

  async function verifyToken(name: string) {
    setVerifying(s => ({ ...s, [name]: true }));
    setVerifyStatus(s => ({ ...s, [name]: null }));
    try {
      const r = await fetch("/api/post-log?limit=1", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setVerifyStatus(s => ({ ...s, [name]: { ok: true } }));
    } catch (e: any) {
      setVerifyStatus(s => ({ ...s, [name]: { error: e.message || "Token Error" } }));
    }
    setVerifying(s => ({ ...s, [name]: false }));
  }
  return (
    <Shell>
      <div style={{ padding: "32px 24px", maxWidth: 800, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 2, marginBottom: 4 }}>
            Connected <span style={{ color: "#E50914" }}>Accounts</span>
          </div>
          <p style={{ fontSize: 13, color: "#555" }}>Manage your social media platform connections.</p>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {PLATFORMS.map(p => (
            <div key={p.name} style={{ background: "#1f1f1f", border: "1px solid #2a2a2a", borderRadius: 10, padding: "18px 20px", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 28, flexShrink: 0 }}>{p.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</span>
                  {p.soon && <span style={{ background: "#2a2a2a", color: "#666", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, letterSpacing: 1 }}>SOON</span>}
                </div>
                <div style={{ fontSize: 12, color: "#555" }}>{p.desc}</div>
              </div>
              <div>
                {!p.soon ? (
                  <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80" }} />
                      <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>Connected</span>
                    </div>
                    {p.verify && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {verifyStatus[p.name] && (
                          <span style={{ fontSize: 11, color: verifyStatus[p.name]?.ok ? "#4ade80" : "#f87171", fontWeight: 600 }}>
                            {verifyStatus[p.name]?.ok ? "Token OK" : "Token Error"}
                          </span>
                        )}
                        <button onClick={() => verifyToken(p.name)} disabled={verifying[p.name]} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#888", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: verifying[p.name] ? "not-allowed" : "pointer" }}>
                          {verifying[p.name] ? "Verifying…" : "Verify"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#555", borderRadius: 6, padding: "7px 14px", fontSize: 12, cursor: "not-allowed" }}>
                    Connect
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, background: "#1a0a0a", border: "1px solid #2a1a1a", borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 4, fontWeight: 600 }}>⚙ API Keys</div>
          <div style={{ fontSize: 12, color: "#555" }}>Instagram and Facebook tokens are configured via environment variables. Update them in your Vercel project settings.</div>
        </div>
      </div>
    </Shell>
  );
}
