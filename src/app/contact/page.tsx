import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact — PPP TV Command Center",
  robots: { index: false, follow: false },
};

export default function ContactPage() {
  return (
    <main id="main-content" style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px", color: "#e5e5e5", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Contact</h1>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: "#ccc", marginBottom: 32 }}>
        For technical issues with this dashboard, contact the PPP TV Kenya development team.
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>PPP TV Kenya</h2>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: "#ccc" }}>
          Website: <a href="https://ppptv-v2.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: "#E50914" }}>ppptv-v2.vercel.app</a><br />
          Channel: StarTimes Channel 430<br />
          Region: Nairobi, Kenya
        </p>
      </section>

      <a href="/dashboard" style={{ display: "inline-block", marginTop: 16, color: "#E50914", fontSize: 14, fontWeight: 600 }}>← Back to Dashboard</a>
    </main>
  );
}
