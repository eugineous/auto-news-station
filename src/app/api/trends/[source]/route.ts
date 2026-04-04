import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 20;

function decodeXML(s: string) {
  return s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").trim();
}

// ── YouTube ───────────────────────────────────────────────────────────────────
const CHANNELS = [
  { id: "UCwmZiChSZyQni_AIBiYCjaA", name: "Citizen TV Kenya" },
  { id: "UCXyLMXgT-jg3wQHkMSMqmcA", name: "NTV Kenya" },
  { id: "UCIj8UMFMrMnFJBBiDl0AQOQ", name: "SPM Buzz" },
  { id: "UCBVjMGOIkavEAhyqpFGDvKg", name: "Tuko Kenya" },
  { id: "UCt3bgbxSBmNNkpVZTABm_Ow", name: "KTN News Kenya" },
];

async function getYouTube() {
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
        const title = decodeXML((e.match(/<title>(.*?)<\/title>/) || [])[1] || "");
        const published = (e.match(/<published>(.*?)<\/published>/) || [])[1] || "";
        if (!videoId || !title) continue;
        if (published && Date.now() - new Date(published).getTime() > 48*3600*1000) continue;
        // Deterministic recency-based volume (no Math.random)
        const ageMs = published ? Date.now() - new Date(published).getTime() : 24*3600*1000;
        const volume = Math.max(1, Math.floor((48*3600*1000 - ageMs) / 3600000) * 1000);
        trends.push({ id:`yt:${videoId}`, title, source:"youtube", volume, category:"VIDEO", url:`https://www.youtube.com/watch?v=${videoId}`, description:`From ${ch.name}`, fetchedAt:now });
      }
    } catch {}
  }));
  return trends.sort((a,b)=>(b.volume||0)-(a.volume||0)).slice(0,20);
}

// ── Reddit ────────────────────────────────────────────────────────────────────
const SUBREDDITS = ["Kenya","AfricanMusic","entertainment","Music","worldnews"];

async function getReddit() {
  const trends: any[] = [];
  const now = new Date().toISOString();
  await Promise.allSettled(SUBREDDITS.map(async (sub) => {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=10`, {
        headers: { "User-Agent": "PPPTVBot/2.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const data = await res.json() as any;
      for (const post of data?.data?.children || []) {
        const p = post.data;
        if (!p.title || p.stickied) continue;
        // Use actual Reddit score — deterministic, not random
        trends.push({ id:`reddit:${p.id}`, title:p.title, source:"reddit", volume:p.score||0, category:sub==="Kenya"?"NEWS":sub==="AfricanMusic"?"MUSIC":"ENTERTAINMENT", url:`https://reddit.com${p.permalink}`, description:p.selftext?.slice(0,120)||`r/${sub}`, fetchedAt:now });
      }
    } catch {}
  }));
  return trends.sort((a,b)=>(b.volume||0)-(a.volume||0)).slice(0,20);
}

// ── News ──────────────────────────────────────────────────────────────────────
const NEWS_FEEDS = [
  { url: "https://citizen.digital/feed", name: "Citizen Digital", cat: "NEWS" },
  { url: "https://www.tuko.co.ke/rss/entertainment.xml", name: "Tuko", cat: "ENTERTAINMENT" },
  { url: "https://www.mpasho.co.ke/feed/", name: "Mpasho", cat: "CELEBRITY" },
  { url: "https://nairobinews.nation.africa/feed/", name: "Nairobi News", cat: "NEWS" },
  { url: "https://www.ghafla.com/ke/feed/", name: "Ghafla Kenya", cat: "CELEBRITY" },
  { url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", name: "BBC Entertainment", cat: "ENTERTAINMENT" },
  { url: "https://www.tmz.com/rss.xml", name: "TMZ", cat: "CELEBRITY" },
];

async function getNews() {
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
        if (pubDate && Date.now() - new Date(pubDate).getTime() > 48*3600*1000) continue;
        // Deterministic recency-based volume
        const ageMs = pubDate ? Date.now() - new Date(pubDate).getTime() : 24*3600*1000;
        const volume = Math.max(500, Math.floor((48*3600*1000 - ageMs) / 3600000) * 500);
        trends.push({ id:`news:${link}`, title, source:"news", volume, category:feed.cat, url:link, description:desc||`From ${feed.name}`, fetchedAt:now });
        count++;
      }
    } catch {}
  }));
  return trends.sort((a,b)=>(b.volume||0)-(a.volume||0)).slice(0,25);
}

// ── Twitter/X via Nitter RSS ──────────────────────────────────────────────────
const NITTER_INSTANCES = ["nitter.poast.org", "nitter.privacydev.net", "nitter.net"];
const NITTER_ACCOUNTS = ["citizentvkenya", "ntvkenya", "tukokenya", "nairobinews", "spmbuzz"];

const KENYA_FALLBACK_TRENDS = [
  { id:"twitter-fallback:1", title:"Kenya entertainment news trending", source:"twitter-fallback", volume:5000, category:"ENTERTAINMENT", url:"https://twitter.com/search?q=Kenya+entertainment" },
  { id:"twitter-fallback:2", title:"Nairobi celebrity gossip", source:"twitter-fallback", volume:4000, category:"CELEBRITY", url:"https://twitter.com/search?q=Nairobi+celebrity" },
  { id:"twitter-fallback:3", title:"Kenya music trending", source:"twitter-fallback", volume:3000, category:"MUSIC", url:"https://twitter.com/search?q=Kenya+music" },
];

function parseRSSItems(xml: string): Array<{ title: string; url: string }> {
  const items: Array<{ title: string; url: string }> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const e = match[1];
    const title = decodeXML((e.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
    const link = (e.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "";
    if (!title.trim() || !link.trim()) continue;
    items.push({ title: title.trim(), url: link.trim() });
  }
  return items;
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function getTwitter() {
  const now = new Date().toISOString();
  const allItems: Array<{ title: string; url: string }> = [];

  for (const instance of NITTER_INSTANCES) {
    let anySuccess = false;
    await Promise.allSettled(NITTER_ACCOUNTS.map(async (account) => {
      try {
        const res = await fetch(`https://${instance}/${account}/rss`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/2.0)" },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return;
        const xml = await res.text();
        const items = parseRSSItems(xml);
        allItems.push(...items);
        if (items.length > 0) anySuccess = true;
      } catch {}
    }));
    if (anySuccess) break; // stop trying instances once one works
  }

  if (allItems.length === 0) {
    return KENYA_FALLBACK_TRENDS.map(t => ({ ...t, fetchedAt: now }));
  }

  // Deduplicate by normalized title
  const seen = new Set<string>();
  const deduped = allItems.filter(item => {
    const key = normalizeTitle(item.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Position-based deterministic volume
  return deduped.map((item, index) => ({
    id: `twitter:${item.url}`,
    title: item.title,
    source: "twitter",
    volume: (deduped.length - index) * 1000,
    category: "ENTERTAINMENT",
    url: item.url,
    fetchedAt: now,
  }));
}

// ── Google Trends Kenya (free, no API key) ────────────────────────────────────
async function getGoogleTrendsKenya() {
  const now = new Date().toISOString();
  try {
    const res = await fetch("https://trends.google.com/trends/hottrends/atom/feed?pn=p14", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/2.0)", "Accept": "application/rss+xml,*/*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const trends: any[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match, rank = 0;
    while ((match = itemRegex.exec(xml)) !== null) {
      const e = match[1];
      const title = decodeXML((e.match(/<title>(.*?)<\/title>/) || [])[1] || "");
      const link = (e.match(/<link>(.*?)<\/link>/) || [])[1] || "";
      if (!title) continue;
      rank++;
      trends.push({
        id: `gtrends:${rank}:${title.replace(/\s/g, "_")}`,
        title,
        source: "google_trends",
        volume: (20 - rank) * 5000, // rank 1 = 95k, rank 20 = 5k
        category: "TRENDING",
        url: link || `https://trends.google.com/trends/explore?q=${encodeURIComponent(title)}&geo=KE`,
        description: `#${rank} trending in Kenya right now`,
        fetchedAt: now,
      });
    }
    return trends.slice(0, 20);
  } catch { return []; }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  if (source === "youtube")       return NextResponse.json({ trends: await getYouTube() });
  if (source === "reddit")        return NextResponse.json({ trends: await getReddit() });
  if (source === "news")          return NextResponse.json({ trends: await getNews() });
  if (source === "twitter")       return NextResponse.json({ trends: await getTwitter() });
  if (source === "google_trends") return NextResponse.json({ trends: await getGoogleTrendsKenya() });
  // "all" — fetch everything in parallel
  const [yt, rd, nw, tw, gt] = await Promise.all([getYouTube(), getReddit(), getNews(), getTwitter(), getGoogleTrendsKenya()]);
  const all = [...gt, ...yt, ...rd, ...nw, ...tw].sort((a,b)=>(b.volume||0)-(a.volume||0));
  return NextResponse.json({ trends: all });
}
