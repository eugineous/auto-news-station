/**
 * /api/admin/feeds/status
 * Fast feed health check — probes each RSS source and returns status without
 * downloading full content. Used by the composer Sources monitor tab.
 */
import { NextResponse } from "next/server";

export const maxDuration = 30;

const FEEDS = [
  // Kenyan news
  { name: "Citizen Digital", url: "https://citizen.digital/feed", cat: "NEWS" },
  { name: "Tuko Entertainment", url: "https://www.tuko.co.ke/rss/entertainment.xml", cat: "ENTERTAINMENT" },
  { name: "Tuko Celebrities", url: "https://www.tuko.co.ke/rss/celebrities.xml", cat: "CELEBRITY" },
  { name: "Mpasho", url: "https://www.mpasho.co.ke/feed/", cat: "CELEBRITY" },
  { name: "Nairobi News", url: "https://nairobinews.nation.africa/feed/", cat: "NEWS" },
  { name: "Pulse Live Kenya", url: "https://www.pulselive.co.ke/rss/entertainment", cat: "ENTERTAINMENT" },
  { name: "Ghafla Kenya", url: "https://www.ghafla.com/ke/feed/", cat: "CELEBRITY" },
  { name: "SDE Kenya", url: "https://www.sde.co.ke/feed/", cat: "CELEBRITY" },
  { name: "Standard Entertainment", url: "https://www.standardmedia.co.ke/rss/entertainment", cat: "ENTERTAINMENT" },
  { name: "K24 TV", url: "https://www.k24tv.co.ke/feed/", cat: "NEWS" },
  // YouTube RSS
  { name: "Citizen TV Kenya (YT)", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCwmZiChSZyQni_AIBiYCjaA", cat: "NEWS" },
  { name: "NTV Kenya (YT)", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCXyLMXgT-jg3wQHkMSMqmcA", cat: "NEWS" },
  { name: "SPM Buzz (YT)", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCIj8UMFMrMnFJBBiDl0AQOQ", cat: "ENTERTAINMENT" },
  { name: "Tuko Kenya (YT)", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCBVjMGOIkavEAhyqpFGDvKg", cat: "ENTERTAINMENT" },
  // International
  { name: "BBC Entertainment", url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", cat: "ENTERTAINMENT" },
  { name: "TMZ", url: "https://www.tmz.com/rss.xml", cat: "CELEBRITY" },
  { name: "Variety", url: "https://variety.com/feed/", cat: "TV & FILM" },
  { name: "Billboard", url: "https://www.billboard.com/feed/", cat: "MUSIC" },
  { name: "ESPN", url: "https://www.espn.com/espn/rss/news", cat: "SPORTS" },
  // Dailymotion
  { name: "Dailymotion Kenya", url: "https://www.dailymotion.com/rss/tag/kenya+entertainment", cat: "ENTERTAINMENT" },
];

async function probeFeed(feed: { name: string; url: string; cat: string }) {
  const start = Date.now();
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/2.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const latency = Date.now() - start;
    if (!res.ok) return { ...feed, ok: false, status: res.status, latency, items: 0 };

    const text = await res.text();
    // Count items/entries
    const items = (text.match(/<item>/g) || text.match(/<entry>/g) || []).length;
    // Get most recent pubDate
    const dateMatch = text.match(/<pubDate>(.*?)<\/pubDate>/) || text.match(/<published>(.*?)<\/published>/);
    const lastItem = dateMatch?.[1] ? new Date(dateMatch[1]).toISOString() : null;

    return { ...feed, ok: true, status: res.status, latency, items, lastItem };
  } catch (err: any) {
    return { ...feed, ok: false, status: 0, latency: Date.now() - start, items: 0, error: err.message };
  }
}

export async function GET() {
  const results = await Promise.allSettled(FEEDS.map(probeFeed));
  const feeds = results.map(r => r.status === "fulfilled" ? r.value : { ok: false, error: "probe failed" });
  const healthy = feeds.filter((f: any) => f.ok).length;
  return NextResponse.json({
    healthy,
    total: feeds.length,
    feeds,
    checkedAt: new Date().toISOString(),
  });
}
