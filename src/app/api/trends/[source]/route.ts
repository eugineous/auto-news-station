import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 20;

function decodeXML(s: string) {
  return s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").trim();
}

const CHANNELS = [
  { id: "UCwmZiChSZyQni_AIBiYCjaA", name: "Citizen TV Kenya" },
  { id: "UCXyLMXgT-jg3wQHkMSMqmcA", name: "NTV Kenya" },
  { id: "UCIj8UMFMrMnFJBBiDl0AQOQ", name: "SPM Buzz" },
  { id: "UCBVjMGOIkavEAhyqpFGDvKg", name: "Tuko Kenya" },
  { id: "UCt3bgbxSBmNNkpVZTABm_Ow", name: "KTN News Kenya" },
];

const SUBREDDITS = ["Kenya","AfricanMusic","entertainment","Music","worldnews"];

const NEWS_FEEDS = [
  { url: "https://citizen.digital/feed", name: "Citizen Digital", cat: "NEWS" },
  { url: "https://www.tuko.co.ke/rss/entertainment.xml", name: "Tuko", cat: "ENTERTAINMENT" },
  { url: "https://www.mpasho.co.ke/feed/", name: "Mpasho", cat: "CELEBRITY" },
  { url: "https://nairobinews.nation.africa/feed/", name: "Nairobi News", cat: "NEWS" },
  { url: "https://www.ghafla.com/ke/feed/", name: "Ghafla Kenya", cat: "CELEBRITY" },
  { url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", name: "BBC Entertainment", cat: "ENTERTAINMENT" },
  { url: "https://www.tmz.com/rss.xml", name: "TMZ", cat: "CELEBRITY" },
];

async function getYouTube() {
  const trends: any[] = [];
  const now = new Date().toISOString();
  await Promise.allSettled(CHANNELS.map(async (ch) => {
    try {
      const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/2.0)" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return;
      const xml = await res.text();
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let match;
      while ((match = entryRegex.exec(xml)) !== null) {
        const e = match[1];
        const videoId = (e.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1];
        const title = decodeXML((e.match(/<title>(.*?)<\/title>/) || [])[1] || "");
        const published = (e.match(/<published>(.*?)<\/published>/) || [])[1] || "";
        if (!videoId || !title) continue;
        if (published && Date.now() - new Date(published).getTime() > 48*3600*1000) continue;
        trends.push({ id:`yt:${videoId}`, title, source:"youtube", volume: Math.floor(Math.random()*50000)+1000, category:"VIDEO", url:`https://www.youtube.com/watch?v=${videoId}`, description:`From ${ch.name}`, fetchedAt:now });
      }
    } catch {}
  }));
  return trends.sort((a,b)=>(b.volume||0)-(a.volume||0)).slice(0,20);
}

async function getReddit() {
  const trends: any[] = [];
  const now = new Date().toISOString();
  await Promise.allSettled(SUBREDDITS.map(async (sub) => {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=10`, { headers: { "User-Agent": "PPPTVBot/2.0" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return;
      const data = await res.json() as any;
      for (const post of data?.data?.children || []) {
        const p = post.data;
        if (!p.title || p.stickied) continue;
        trends.push({ id:`reddit:${p.id}`, title:p.title, source:"reddit", volume:p.score||0, category:sub==="Kenya"?"NEWS":sub==="AfricanMusic"?"MUSIC":"ENTERTAINMENT", url:`https://reddit.com${p.permalink}`, description:p.selftext?.slice(0,120)||`r/${sub}`, fetchedAt:now });
      }
    } catch {}
  }));
  return trends.sort((a,b)=>(b.volume||0)-(a.volume||0)).slice(0,20);
}

async function getNews() {
  const trends: any[] = [];
  const now = new Date().toISOString();
  await Promise.allSettled(NEWS_FEEDS.map(async (feed) => {
    try {
      const res = await fetch(feed.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/2.0)", "Accept": "application/rss+xml,*/*" }, signal: AbortSignal.timeout(8000) });
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
        if (pubDate && Date.now() - new Date(pubDate).getTime() > 48*3600*1000) continue;
        trends.push({ id:`news:${link}`, title, source:"news", volume:Math.floor(Math.random()*10000)+500, category:feed.cat, url:link, description:desc||`From ${feed.name}`, fetchedAt:now });
        count++;
      }
    } catch {}
  }));
  return trends.sort((a,b)=>(b.volume||0)-(a.volume||0)).slice(0,25);
}

export async function GET(_req: NextRequest, { params }: { params: { source: string } }) {
  const { source } = params;
  if (source === "youtube") return NextResponse.json({ trends: await getYouTube() });
  if (source === "reddit")  return NextResponse.json({ trends: await getReddit() });
  if (source === "news")    return NextResponse.json({ trends: await getNews() });
  // "all" — fetch everything in parallel
  const [yt, rd, nw] = await Promise.all([getYouTube(), getReddit(), getNews()]);
  const all = [...yt, ...rd, ...nw].sort((a,b)=>(b.volume||0)-(a.volume||0));
  return NextResponse.json({ trends: all });
}
