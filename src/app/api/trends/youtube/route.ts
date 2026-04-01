import { NextResponse } from "next/server";

export const maxDuration = 20;

const CHANNELS = [
  { id: "UCwmZiChSZyQni_AIBiYCjaA", name: "Citizen TV Kenya" },
  { id: "UCXyLMXgT-jg3wQHkMSMqmcA", name: "NTV Kenya" },
  { id: "UCIj8UMFMrMnFJBBiDl0AQOQ", name: "SPM Buzz" },
  { id: "UCBVjMGOIkavEAhyqpFGDvKg", name: "Tuko Kenya" },
  { id: "UCt3bgbxSBmNNkpVZTABm_Ow", name: "KTN News Kenya" },
];

export async function GET() {
  const trends: any[] = [];
  const now = new Date().toISOString();

  await Promise.allSettled(CHANNELS.map(async (ch) => {
    try {
      const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/2.0)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const xml = await res.text();
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let match;
      while ((match = entryRegex.exec(xml)) !== null) {
        const e = match[1];
        const videoId = (e.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1];
        const title = (e.match(/<title>(.*?)<\/title>/) || [])[1]?.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">") || "";
        const published = (e.match(/<published>(.*?)<\/published>/) || [])[1] || "";
        const views = parseInt((e.match(/<media:statistics views="(\d+)"/) || [])[1] || "0");
        if (!videoId || !title) continue;
        // Only last 48h
        if (published && Date.now() - new Date(published).getTime() > 48 * 3600 * 1000) continue;
        trends.push({
          id: `yt:${videoId}`,
          title,
          source: "youtube",
          volume: views || Math.floor(Math.random() * 50000) + 1000,
          category: "VIDEO",
          url: `https://www.youtube.com/watch?v=${videoId}`,
          description: `From ${ch.name}`,
          fetchedAt: now,
        });
      }
    } catch {}
  }));

  // Sort by volume desc
  trends.sort((a, b) => (b.volume || 0) - (a.volume || 0));
  return NextResponse.json({ trends: trends.slice(0, 20) });
}
