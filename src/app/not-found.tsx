import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page Not Found — PPP TV Command Center",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <html lang="en-KE">
      <body style={{ margin: 0, background: "#141414", color: "#e5e5e5", fontFamily: "Inter, system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <main id="main-content" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontFamily: "monospace", fontSize: 80, fontWeight: 900, color: "#E50914", lineHeight: 1, marginBottom: 16 }}>404</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Page not found</h1>
          <p style={{ fontSize: 14, color: "#aaa", marginBottom: 32, maxWidth: 360, margin: "0 auto 32px" }}>
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/dashboard" style={{ background: "#E50914", color: "#fff", padding: "12px 24px", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
              Go to Dashboard
            </Link>
            <Link href="/login" style={{ background: "#1f1f1f", color: "#e5e5e5", padding: "12px 24px", borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none", border: "1px solid #2a2a2a" }}>
              Sign In
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
