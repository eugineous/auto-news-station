import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use — PPP TV Command Center",
  robots: { index: false, follow: false },
};

export default function TermsPage() {
  return (
    <main id="main-content" style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px", color: "#e5e5e5", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Terms of Use</h1>
      <p style={{ fontSize: 13, color: "#888", marginBottom: 32 }}>Last updated: March 2026</p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>1. Authorised Use Only</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "#ccc" }}>
          This application is restricted to authorised PPP TV Kenya personnel. Unauthorised access, use, or distribution is strictly prohibited and may be subject to legal action.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>2. Content Responsibility</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "#ccc" }}>
          Administrators are responsible for ensuring all content published through this platform complies with applicable laws, Meta platform policies, and PPP TV Kenya editorial standards.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>3. Limitation of Liability</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "#ccc" }}>
          PPP TV Kenya accepts no liability for service interruptions, third-party API failures, or content publishing errors beyond reasonable control.
        </p>
      </section>

      <a href="/dashboard" style={{ display: "inline-block", marginTop: 16, color: "#E50914", fontSize: 14, fontWeight: 600 }}>← Back to Dashboard</a>
    </main>
  );
}
