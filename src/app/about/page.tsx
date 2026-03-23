import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — PPP TV Command Center",
  robots: { index: false, follow: false },
};

export default function AboutPage() {
  return (
    <main id="main-content" style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px", color: "#e5e5e5", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>About</h1>

      <section style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 15, lineHeight: 1.8, color: "#ccc", marginBottom: 16 }}>
          PPP TV Command Center is the internal social media management platform for PPP TV Kenya — StarTimes Channel 430.
        </p>
        <p style={{ fontSize: 15, lineHeight: 1.8, color: "#ccc" }}>
          It enables the PPP TV team to publish, schedule, and monitor content across Instagram and Facebook from a single dashboard.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>PPP TV Kenya</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "#ccc" }}>
          PPP TV Kenya is Kenya's entertainment news channel on StarTimes Channel 430, covering celebrity news, music, TV &amp; film, fashion, and events across East Africa.
        </p>
      </section>

      <a href="/dashboard" style={{ display: "inline-block", marginTop: 16, color: "#E50914", fontSize: 14, fontWeight: 600 }}>← Back to Dashboard</a>
    </main>
  );
}
