import type { Metadata } from "next";
import Script from "next/script";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { RemoveLegacyBar } from "@/components/RemoveLegacyBar";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
});

const siteUrl = "https://ppptv-website.vercel.app";

export const metadata: Metadata = {
  title: "PPP TV | Powerful • Precise • Pristine",
  description:
    "Kenya's first 24/7 music & entertainment channel. News, shows, hosts, artists, live streams, and campus culture.",
  openGraph: {
    title: "PPP TV | Powerful • Precise • Pristine",
    description:
      "Kenya's first 24/7 music & entertainment channel. News, shows, hosts, artists, live streams, and campus culture.",
    url: siteUrl,
    siteName: "PPP TV",
    images: [
      {
        url: `${siteUrl}/og.png`,
        width: 1200,
        height: 630,
        alt: "PPP TV",
      },
    ],
    locale: "en_KE",
    type: "website",
  },
  metadataBase: new URL(siteUrl),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adsenseClient = process.env.ADSENSE_CLIENT;
  return (
    <html lang="en">
      <head>
        {adsenseClient ? (
          <Script
            id="adsense-script"
            async
            strategy="afterInteractive"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
            crossOrigin="anonymous"
          />
        ) : null}
      </head>
      <body className={`${spaceGrotesk.variable} antialiased bg-background text-foreground`}>
        <Navbar />
        <RemoveLegacyBar />
        <main className="min-h-screen pb-12">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
