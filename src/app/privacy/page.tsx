import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — PPP TV Command Center",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <div>
      <div style={{ background: "#0a0a0a", borderBottom: "1px solid #1f1f1f", padding: "0 24px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 2 }}>PPP<span style={{ color: "#E50914" }}>TV</span></span>
        <a href="/dashboard" style={{ fontSize: 12, color: "#888", textDecoration: "none", fontWeight: 600 }}>← Dashboard</a>
      </div>
    <main id="main-content" style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px", color: "#e5e5e5", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ fontSize: 13, color: "#888", marginBottom: 32 }}>Last updated: March 2026</p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>1. Overview</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "#ccc" }}>
          This application ("PPP TV Command Center") is a private administrative dashboard used internally by PPP TV Kenya to manage social media publishing. It is not a public-facing service and is not intended for general public use.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>2. Data We Process</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "#ccc" }}>
          This dashboard processes social media access tokens and page credentials provided by authorised administrators. No personal data from third parties is collected or stored beyond what is necessary for social media publishing operations.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>3. Third-Party Services</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "#ccc" }}>
          This application uses the following third-party services: Vercel (hosting), Cloudflare (worker and R2 storage), Meta Graph API (Instagram and Facebook publishing), and Google Fonts (typography). Each service operates under its own privacy policy.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>4. Contact</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "#ccc" }}>
          For privacy enquiries, contact the PPP TV Kenya team via the <a href="/contact" style={{ color: "#E50914" }}>contact page</a>.
        </p>
      </section>

      <a href="/dashboard" style={{ display: "inline-block", marginTop: 16, color: "#E50914", fontSize: 14, fontWeight: 600 }}>← Back to Dashboard</a>
    </main>
    </div>
  );
}
