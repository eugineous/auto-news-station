import { NextResponse } from "next/server";

export const maxDuration = 20;

const NEWS_FEEDS = [
  { url: "https://citizen.digital/feed", name: "Citizen Digital", cat: "NEWS" },
  { url: "https://www.tuko.co.ke/rss/entertainment.xml", name: "Tuko", cat: "ENTERTAINMENT" },
  { url: "https://www.mpasho.co.ke/feed/", name: "Mpasho", cat: "CELEBRITY" },
  { url: "https://nairobinews.nation.africa/feed/", name: "Nairobi News", cat: "NEWS" },
  { url: "https://www.ghafla.com/ke/feed/", name: "Ghafla Kenya", cat: "CELEBRITY" },
  { url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", name: "BBC Entertainment", cat: "ENTERTAINMENT" },
  { url: "https://www.tmz.com/rss.xml", name: "TMZ", cat: "CELEBRITY" },
];

function decodeXML(s: string) {
  return s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").trim();
}

export async function GET() {
  const trends: any[] = [];
  const now = new Date().toISOString();

  await Promise.allSettled(NEWS_FEEDS.map(async (feed) => {
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/2.0)", "Accept": "application/rss+xml,*/*" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const xml = await res.text();
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match, count = 0;
      while ((match = itemRegex.exec(xml)) !== null && count < 5) {
        const e = match[1];
        const title = decodeXML((e.match(/<title>(.*?)<\/title>/) || [])[1] || "");
        const link = decodeXML((e.match(/<link>(.*?)<\/link>/) || [])[1] || "");
        const pubDate = (e.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || "";
        const desc = decodeXML((e.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || "").replace(/<[^>]+>/g,"").slice(0,120);
        if (!title || !link) continue;
        if (pubDate && Date.now() - new Date(pubDate).getTime() > 48 * 3600 * 1000) continue;
        trends.push({
          id: `news:${link}`,
          title,
          source: "news",
          volume: Math.floor(Math.random() * 10000) + 500,
          category: feed.cat,
          url: link,
          description: desc || `From ${feed.name}`,
          fetchedAt: now,
        });
        count++;
      }
    } catch {}
  }));

  trends.sort((a, b) => (b.volume || 0) - (a.volume || 0));
  return NextResponse.json({ trends: trends.slice(0, 25) });
}
