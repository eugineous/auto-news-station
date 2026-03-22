"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function login() {
    setLoading(true);
    setErr("");
    const r = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (r.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setErr("Wrong password");
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100dvh", background: "#0f0f0f", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 360, background: "#1a1a1a", borderRadius: 16, padding: 32, border: "1px solid #2a2a2a" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 1, marginBottom: 4 }}>
            PPP<span style={{ color: "#E50914" }}>TV</span>
          </div>
          <div style={{ fontSize: 12, color: "#555", letterSpacing: 2, textTransform: "uppercase" }}>Admin Platform</div>
        </div>
        <input
          type="password"
          placeholder="Admin password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === "Enter" && login()}
          style={{ width: "100%", background: "#111", border: "1px solid #333", borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none", marginBottom: 12 }}
        />
        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button
          onClick={login}
          disabled={loading || !pw}
          style={{ width: "100%", background: "#E50914", color: "#fff", border: "none", borderRadius: 8, padding: "13px", fontSize: 15, fontWeight: 700, cursor: loading || !pw ? "not-allowed" : "pointer", opacity: loading || !pw ? 0.5 : 1 }}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </div>
    </div>
  );
}
