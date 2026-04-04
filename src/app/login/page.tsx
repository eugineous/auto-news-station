"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function login() {
    setLoading(true);
    setErr("");
    const r = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (r.ok) {
      const from = searchParams.get("from");
      const dest = from && from.startsWith("/") ? from : "/dashboard";
      router.push(dest);
      router.refresh();
    } else {
      setErr("Wrong password");
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#141414",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background glow */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(229,9,20,.12) 0%, transparent 60%)",
        pointerEvents: "none",
      }} />

      <div style={{ width: "100%", maxWidth: 380, position: "relative", animation: "fadeIn .3s ease" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#E50914", animation: "pulse 1.5s infinite" }} />
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 42, letterSpacing: 3, lineHeight: 1 }}>
              PPP<span style={{ color: "#E50914" }}>TV</span>
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#444", letterSpacing: 4, textTransform: "uppercase" }}>Social Media Command Center</div>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(20,20,20,0.95)",
          border: "1px solid #2a2a2a",
          borderRadius: 12,
          padding: "36px 32px",
          backdropFilter: "blur(20px)",
        }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, letterSpacing: -.3 }}>Sign in</h2>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>Enter your admin password to continue</p>

          <input
            type="password"
            placeholder="Admin password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && login()}
            autoFocus
            style={{
              width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a",
              borderRadius: 8, padding: "14px 16px", color: "#fff", fontSize: 15,
              outline: "none", marginBottom: 12, transition: "border-color .15s",
              fontFamily: "inherit",
            }}
            onFocus={e => e.target.style.borderColor = "#555"}
            onBlur={e => e.target.style.borderColor = "#2a2a2a"}
          />

          {err && (
            <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span>✗</span> {err}
            </div>
          )}

          <button
            onClick={login}
            disabled={loading || !pw}
            style={{
              width: "100%", background: "#E50914", color: "#fff", border: "none",
              borderRadius: 8, padding: "14px", fontSize: 15, fontWeight: 700,
              cursor: loading || !pw ? "not-allowed" : "pointer",
              opacity: loading || !pw ? 0.5 : 1,
              transition: "all .15s", fontFamily: "inherit", letterSpacing: .3,
            }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: "#333", marginTop: 20 }}>
          PPP TV Kenya · Social Media Management
        </p>
      </div>

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
