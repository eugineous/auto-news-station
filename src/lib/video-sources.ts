/**
 * Multi-platform video source aggregator
 * Pulls entertainment video content from 20+ sources without API keys.
 * Sources: YouTube RSS, Dailymotion RSS, Reddit JSON, news site RSS with video embeds,
 *          Vimeo RSS, public JSON feeds, and direct MP4 RSS feeds.
 */

import rssParser from "rss-parser";
import { BloomFilter } from "bloom-filters";

export interface VideoItem {
  id: string;           // unique ID for dedup
  title: string;
  url: string;          // page/watch URL
  directVideoUrl?: string; // direct MP4 if available
  thumbnail: string;
  publishedAt: Date;
  sourceName: string;
  sourceType: "youtube" | "dailymotion" | "reddit" | "rss-video" | "vimeo" | "direct-mp4";
  category: string;
  duration?: number;    // seconds, if known
}

const UA = "Mozilla/5.0 (compatible; PPPTVBot/2.0)";
const BLOOM_FALSE_POSITIVE = 0.01;
const BLOOM_CAPACITY = 1000;
let bloom: BloomFilter | null = null;

async function safeFetch(url: string, timeoutMs = 10000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/rss+xml, application/xml, text/xml, application/json, */*" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function decodeXML(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function isEntertainmentTitle(title: string): boolean {
  return /music|song|video|celebrity|gossip|entertainment|fashion|award|concert|interview|exclusive|drama|movie|film|tv|show|dance|comedy|viral|trending|nairobi|kenya|africa/i.test(title);
}

function isRecent(dateStr: string, maxHours = 24): boolean {
  try {
    const d = new Date(dateStr);
    return Date.now() - d.getTime() < maxHours * 3600 * 1000;
  } catch { return true; }
}

// ── 1. YouTube RSS (verified real channel IDs) ───────────────────────────────
const YOUTUBE_CHANNELS = [
  { id: "UCwmZiChSZyQni_AIBiYCjaA", name: "Citizen TV Kenya",     cat: "NEWS" },
  { id: "UCt3bgbxSBmNNkpVZTABm_Ow", name: "KTN News Kenya",       cat: "NEWS" },
  { id: "UCIj8UMFMrMnFJBBiDl0AQOQ", name: "SPM Buzz",             cat: "ENTERTAINMENT" },
  { id: "UCBVjMGOIkavEAhyqpFGDvKg", name: "Tuko Kenya",           cat: "ENTERTAINMENT" },
  { id: "UCnUYZLuoy1rq1aVMwx4aTzw", name: "K24 TV",               cat: "NEWS" },
  // International channels with real IDs
  { id: "UCupvZG-5ko_eiXAupbDfxWw", name: "CNN",                  cat: "NEWS" },
  { id: "UCHaHD477h-FeBbVh9Sh7syA", name: "Al Jazeera English",   cat: "NEWS" },
  { id: "UC16niRr50-MSBwiO3YDb3RA", name: "BBC News",             cat: "NEWS" },
  { id: "UCVTyTA7-g9nopHeHbeuvpRA", name: "ESPN",                 cat: "SPORTS" },
  { id: "UCF9imwFLGf3jbUFqMbdGrKg", name: "Sky Sports",          cat: "SPORTS" },
];

async function fetchYouTubeChannel(channelId: string, channelName: string, category: string): Promise<VideoItem[]> {
  const xml = await safeFetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, 15000);
  if (!xml || xml.includes("404") || xml.length < 200) return [];

  const items: VideoItem[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const e = match[1];
    const videoId = (e.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1];
    const title = decodeXML((e.match(/<title>(.*?)<\/title>/) || [])[1] || "");
    const published = (e.match(/<published>(.*?)<\/published>/) || [])[1] || "";
    const thumbnail = (e.match(/url="(https:\/\/i\.ytimg\.com[^"]+)"/) || [])[1] || "";

    if (!videoId || !title || !isRecent(published)) continue;
    // For news channels, accept all recent videos; for entertainment, filter by title

    items.push({
      id: `yt:${videoId}`,
      title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      publishedAt: new Date(published),
      sourceName: channelName,
      sourceType: "youtube",
      category,
    });
  }
  return items.slice(0, 5);
}

// ── 2. Dailymotion RSS (Kenya + Africa entertainment) ────────────────────────
const DAILYMOTION_FEEDS = [
  { url: "https://www.dailymotion.com/rss/user/ctn-kenya",          name: "CTN Kenya",          cat: "NEWS" },
  { url: "https://www.dailymotion.com/rss/tag/kenya+entertainment", name: "Dailymotion Kenya",  cat: "ENTERTAINMENT" },
  { url: "https://www.dailymotion.com/rss/tag/africa+music",        name: "Africa Music DM",    cat: "MUSIC" },
  { url: "https://www.dailymotion.com/rss/tag/nairobi",             name: "Nairobi DM",         cat: "NEWS" },
];

async function fetchDailymotionFeed(feedUrl: string, sourceName: string, category: string): Promise<VideoItem[]> {
  const xml = await safeFetch(feedUrl);
  if (!xml) return [];

  const items: VideoItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const e = match[1];
    const title = decodeXML((e.match(/<title>(.*?)<\/title>/) || [])[1] || "");
    const link = (e.match(/<link>(.*?)<\/link>/) || [])[1] || "";
    const pubDate = (e.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || "";
    const thumbnail = (e.match(/url="([^"]+\.(?:jpg|jpeg|png))"/) || [])[1] || "";
    const videoId = link.match(/video\/([a-z0-9]+)/i)?.[1] || "";

    if (!title || !link || !isRecent(pubDate)) continue;
    if (!isEntertainmentTitle(title)) continue;

    items.push({
      id: `dm:${videoId || link}`,
      title,
      url: link,
      thumbnail,
      publishedAt: new Date(pubDate),
      sourceName,
      sourceType: "dailymotion",
      category,
    });
  }
  return items.slice(0, 3);
}

// ── 3. Reddit JSON API (public, no auth) ─────────────────────────────────────
const REDDIT_FEEDS = [
  { url: "https://www.reddit.com/r/Kenya/new.json?limit=25",              name: "r/Kenya",           cat: "NEWS" },
  { url: "https://www.reddit.com/r/AfricanMusic/new.json?limit=25",       name: "r/AfricanMusic",    cat: "MUSIC" },
  { url: "https://www.reddit.com/r/Nollywood/new.json?limit=25",          name: "r/Nollywood",       cat: "MOVIES" },
  { url: "https://www.reddit.com/r/entertainment/new.json?limit=25",      name: "r/Entertainment",   cat: "ENTERTAINMENT" },
  { url: "https://www.reddit.com/r/Music/new.json?limit=25",              name: "r/Music",           cat: "MUSIC" },
];

async function fetchRedditFeed(feedUrl: string, sourceName: string, category: string): Promise<VideoItem[]> {
  try {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "PPPTVBot/2.0 (entertainment aggregator)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    const posts = data?.data?.children || [];
    const items: VideoItem[] = [];

    for (const post of posts) {
      const p = post.data;
      if (!p.is_video && !p.url?.includes("youtube") && !p.url?.includes("youtu.be")) continue;
      if (!isEntertainmentTitle(p.title || "")) continue;
      if (!isRecent(new Date(p.created_utc * 1000).toISOString())) continue;

      // Reddit uses url_overridden_by_dest for the actual link
      const postUrl = p.url_overridden_by_dest || p.url;
      const videoUrl = p.is_video ? p.media?.reddit_video?.fallback_url : postUrl;
      if (!videoUrl) continue;

      items.push({
        id: `reddit:${p.id}`,
        title: p.title,
        url: videoUrl,
        directVideoUrl: p.is_video ? videoUrl : undefined,
        thumbnail: p.thumbnail?.startsWith("http") ? p.thumbnail : "",
        publishedAt: new Date(p.created_utc * 1000),
        sourceName,
        sourceType: p.is_video ? "reddit" : "youtube",
        category,
      });
    }
    return items.slice(0, 3);
  } catch { return []; }
}

// ── 4. News site RSS feeds with video embeds ──────────────────────────────────
// These RSS feeds contain articles that embed YouTube/video content
const NEWS_RSS_FEEDS = [
  { url: "https://www.tuko.co.ke/rss/entertainment.xml",                  name: "Tuko Entertainment",    cat: "ENTERTAINMENT" },
  { url: "https://www.tuko.co.ke/rss/celebrities.xml",                    name: "Tuko Celebrities",      cat: "CELEBRITY" },
  { url: "https://www.standardmedia.co.ke/rss/entertainment",             name: "Standard Entertainment", cat: "ENTERTAINMENT" },
  { url: "https://nation.africa/kenya/entertainment/rss",                 name: "Nation Entertainment",  cat: "ENTERTAINMENT" },
  { url: "https://www.mpasho.co.ke/feed/",                                name: "Mpasho",                cat: "CELEBRITY" },
  { url: "https://www.kenyans.co.ke/feeds/entertainment",                 name: "Kenyans Entertainment", cat: "ENTERTAINMENT" },
  { url: "https://nairobinews.nation.africa/feed/",                       name: "Nairobi News",          cat: "NEWS" },
  { url: "https://www.pulselive.co.ke/rss/entertainment",                 name: "Pulse Live Kenya",      cat: "ENTERTAINMENT" },
  { url: "https://www.ghafla.com/ke/feed/",                               name: "Ghafla Kenya",          cat: "CELEBRITY" },
  { url: "https://www.sde.co.ke/feed/",                                   name: "SDE Kenya",             cat: "CELEBRITY" },
  { url: "https://citizen.digital/feed",                                  name: "Citizen Digital",       cat: "NEWS" },
  { url: "https://www.the-star.co.ke/authors/sasa/feed/",                 name: "The Star Sasa",         cat: "ENTERTAINMENT" },
  { url: "https://www.the-star.co.ke/authors/sports/feed/",               name: "The Star Sports",       cat: "SPORTS" },
  { url: "https://www.k24tv.co.ke/feed/",                                 name: "K24 TV",                cat: "NEWS" },
  { url: "https://www.kbc.co.ke/feed/",                                   name: "KBC",                   cat: "NEWS" },
  { url: "https://www.switchtv.ke/rss",                                   name: "Switch TV",             cat: "ENTERTAINMENT" },
  { url: "https://www.standardmedia.co.ke/rss/sports",                    name: "Standard Sports",       cat: "SPORTS" },
  { url: "https://www.goal.com/feeds/en/news",                            name: "Goal Football",         cat: "SPORTS" },
  { url: "https://www.skysports.com/rss/12040",                           name: "Sky Sports Football",   cat: "SPORTS" },
  { url: "https://www.citizen.digital/sports/feed",                       name: "Citizen Sports",        cat: "SPORTS" },
  // International entertainment RSS with video
  { url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", name: "BBC Entertainment",     cat: "ENTERTAINMENT" },
  { url: "https://rss.cnn.com/rss/cnn_showbiz.rss",                      name: "CNN Showbiz",           cat: "ENTERTAINMENT" },
  { url: "https://feeds.reuters.com/reuters/entertainment",              name: "Reuters Entertainment", cat: "ENTERTAINMENT" },
  { url: "https://www.rollingstone.com/music/feed/",                      name: "Rolling Stone Music",   cat: "MUSIC" },
  { url: "https://variety.com/feed/",                                     name: "Variety",               cat: "TV & FILM" },
  { url: "https://deadline.com/feed/",                                    name: "Deadline",              cat: "TV & FILM" },
  { url: "https://www.billboard.com/feed/",                               name: "Billboard",             cat: "MUSIC" },
  { url: "https://pitchfork.com/rss/news/feed.xml",                       name: "Pitchfork",             cat: "MUSIC" },
  { url: "https://www.tmz.com/rss.xml",                                   name: "TMZ",                   cat: "CELEBRITY" },
  { url: "https://pagesix.com/feed/",                                     name: "Page Six",              cat: "CELEBRITY" },
  { url: "https://www.etonline.com/news/rss",                             name: "ET Online",             cat: "CELEBRITY" },
  { url: "https://feeds.skynews.com/feeds/rss/world.xml",                 name: "Sky News World",        cat: "NEWS" },
  { url: "https://feeds.skynews.com/feeds/rss/uk.xml",                    name: "Sky News UK",           cat: "NEWS" },
  { url: "https://feeds.nbcnews.com/nbcnews/public/entertainment",       name: "NBC Entertainment",     cat: "ENTERTAINMENT" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml",                     name: "Al Jazeera All",        cat: "NEWS" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Movies.xml",      name: "NYT Movies",            cat: "TV & FILM" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml",        name: "NYT Arts",              cat: "ENTERTAINMENT" },
  { url: "https://feeds.feedburner.com/uproxx/filmdrunk",                name: "Uproxx Film",           cat: "TV & FILM" },
  { url: "https://www.hollywoodreporter.com/t/feed/",                     name: "Hollywood Reporter",    cat: "TV & FILM" },
  { url: "https://www.espn.com/espn/rss/news",                            name: "ESPN News",             cat: "SPORTS" },
  { url: "https://www.vice.com/en/rss?locale=en_us",                      name: "Vice",                  cat: "NEWS" },
];

async function fetchNewsRSSWithVideo(feedUrl: string, sourceName: string, category: string): Promise<VideoItem[]> {
  const xml = await safeFetch(feedUrl);
  if (!xml) return [];

  const items: VideoItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const e = match[1];
    const title = decodeXML((e.match(/<title>(.*?)<\/title>/) || [])[1] || "");
    const link = decodeXML((e.match(/<link>(.*?)<\/link>/) || (e.match(/<guid[^>]*>(.*?)<\/guid>/) || []))[1] || "");
    const pubDate = (e.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || "";
    const description = e.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "";
    const enclosureUrl = e.match(/enclosure[^>]+url="([^"]+\.mp4[^"]*)"/)?.[1] || "";
    const thumbnail = e.match(/<media:thumbnail[^>]+url="([^"]+)"/)?.[1] ||
                      e.match(/<media:content[^>]+url="([^"]+\.(?:jpg|jpeg|png)[^"]*)"/)?.[1] ||
                      e.match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png)/)?.[0] || "";

    // Extract YouTube embed from description
    const ytMatch = description.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})|youtu\.be\/([a-zA-Z0-9_-]{11})|youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/);
    const ytVideoId = ytMatch?.[1] || ytMatch?.[2] || ytMatch?.[3];

    if (!title || !link || !isRecent(pubDate)) continue;

    // Use YouTube embed if found, else mp4 enclosure, else the article link itself
    // Only include items with a real video URL — YouTube embed or direct MP4
    // Skip plain article links — they can't be resolved as videos
    if (!ytVideoId && !enclosureUrl) continue;

    const videoUrl = ytVideoId
      ? `https://www.youtube.com/watch?v=${ytVideoId}`
      : enclosureUrl;

    const thumbUrl = ytVideoId
      ? `https://img.youtube.com/vi/${ytVideoId}/maxresdefault.jpg`
      : thumbnail;

    items.push({
      id: `rss:${link}`,
      title,
      url: videoUrl!,
      thumbnail: thumbUrl,
      publishedAt: new Date(pubDate),
      sourceName,
      sourceType: ytVideoId ? "youtube" : "rss-video",
      category,
      directVideoUrl: enclosureUrl || undefined,
    });
  }
  return items.slice(0, 5);
}

// ── 5. Vimeo RSS (Africa/Kenya entertainment) ─────────────────────────────────
const VIMEO_FEEDS = [
  { url: "https://vimeo.com/channels/africaentertainment/videos/rss",  name: "Vimeo Africa",      cat: "ENTERTAINMENT" },
  { url: "https://vimeo.com/categories/music/videos/rss",              name: "Vimeo Music",       cat: "MUSIC" },
];

async function fetchVimeoFeed(feedUrl: string, sourceName: string, category: string): Promise<VideoItem[]> {
  const xml = await safeFetch(feedUrl);
  if (!xml) return [];

  const items: VideoItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const e = match[1];
    const title = decodeXML((e.match(/<title>(.*?)<\/title>/) || [])[1] || "");
    const link = (e.match(/<link>(.*?)<\/link>/) || [])[1] || "";
    const pubDate = (e.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || "";
    const thumbnail = e.match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png)/)?.[0] || "";

    if (!title || !link || !isRecent(pubDate)) continue;
    if (!isEntertainmentTitle(title)) continue;

    items.push({
      id: `vimeo:${link}`,
      title,
      url: link,
      thumbnail,
      publishedAt: new Date(pubDate),
      sourceName,
      sourceType: "vimeo",
      category,
    });
  }
  return items.slice(0, 2);
}

// ── 6. TikTok Account Scraper via TikWM ──────────────────────────────────────
// Rules:
// - 1 video per account per day, posted at a staggered hour
// - No promotional content (ads, sponsored, giveaways, discount codes)
// - No duplicate posts within 24h
// - Attribution: accredited news orgs get "Reports @handle" | creators get "@handle reports"
// - Only news/entertainment/sports content — no lifestyle ads, no brand deals

interface TikTokAccount {
  username: string;       // TikTok @handle
  displayName: string;    // Human-readable name for attribution
  category: string;       // Content category
  postHourEAT: number;    // Hour (EAT, 0-23) this account's video should post
  isCreator: boolean;     // true = individual creator, false = org/media
}

const TIKTOK_ACCOUNTS: TikTokAccount[] = [
  { username: "tushindecharityshow",  displayName: "Tushinde Charity Show",  category: "ENTERTAINMENT", postHourEAT: 7,  isCreator: false },
  { username: "bbcnewsswahili",       displayName: "BBC News Swahili",        category: "NEWS",          postHourEAT: 8,  isCreator: false },
  { username: "footballkenya",        displayName: "Football Kenya",          category: "SPORTS",        postHourEAT: 9,  isCreator: false },
  { username: "fabrizioromano",       displayName: "Fabrizio Romano",         category: "SPORTS",        postHourEAT: 10, isCreator: true  },
  { username: "kenya.news.arena",     displayName: "Kenya News Arena",        category: "NEWS",          postHourEAT: 11, isCreator: false },
  { username: "citizen.digital",      displayName: "Citizen Digital",         category: "NEWS",          postHourEAT: 12, isCreator: false },
  { username: "thenewsguyke",         displayName: "The News Guy KE",         category: "NEWS",          postHourEAT: 13, isCreator: true  },
  { username: "sheyii_given",         displayName: "Sheyii Given",            category: "ENTERTAINMENT", postHourEAT: 14, isCreator: true  },
  { username: "aljazeeraenglish",     displayName: "Al Jazeera English",      category: "NEWS",          postHourEAT: 15, isCreator: false },
  { username: "cnn",                  displayName: "CNN",                     category: "NEWS",          postHourEAT: 16, isCreator: false },
  { username: "skysportsnews",        displayName: "Sky Sports News",         category: "SPORTS",        postHourEAT: 17, isCreator: false },
  { username: "dailymailsport",       displayName: "Daily Mail Sport",        category: "SPORTS",        postHourEAT: 18, isCreator: false },
  { username: "dylan.page",           displayName: "Dylan Page",              category: "NEWS",          postHourEAT: 19, isCreator: true  },
  { username: "urbannewsgang",        displayName: "Urban News Gang",         category: "ENTERTAINMENT", postHourEAT: 20, isCreator: false },
];

// Content filter — reject promotional/ad content
const PROMO_PATTERNS = [
  /\b(ad|ads|sponsored|promo|promotion|discount|coupon|code|giveaway|win|prize|affiliate|partner|collab|collaboration|paid|#ad|#sponsored|#promo|#gifted|#partner)\b/i,
  /\b(shop now|buy now|link in bio|swipe up|use code|get \d+% off|limited offer|click link|order now|dm for|dm me for)\b/i,
  /\b(brand deal|brand partnership|ambassador|endorsement)\b/i,
];

function isPromo(title: string, desc: string = ""): boolean {
  const text = `${title} ${desc}`;
  return PROMO_PATTERNS.some(p => p.test(text));
}

// Build attribution credit line based on account type
function buildAttribution(account: TikTokAccount, videoUrl: string): string {
  if (account.isCreator) {
    return `@${account.username} reports this. Credit: ${account.displayName} | ${videoUrl}`;
  }
  return `Reports: ${account.displayName} (@${account.username}) | ${videoUrl}`;
}

// Check if this account has already posted today (EAT)
function isAccountPostHour(account: TikTokAccount): boolean {
  const nowEAT = (new Date().getUTCHours() + 3) % 24;
  // Allow posting within a 2-hour window of the scheduled hour
  const diff = Math.abs(nowEAT - account.postHourEAT);
  return diff <= 1 || diff >= 23; // handles midnight wrap
}

async function fetchTikTokAccountVideos(account: TikTokAccount): Promise<VideoItem[]> {
  try {
    // TikWM user feed API — returns latest videos for a username
    const body = new URLSearchParams({ unique_id: account.username, count: "10", cursor: "0" });
    const res = await fetch("https://www.tikwm.com/api/user/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/1.0)",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    if (data.code !== 0 || !data.data?.videos) return [];

    const items: VideoItem[] = [];
    for (const v of data.data.videos) {
      if (!v.title && !v.play_count) continue;
      const title = v.title || v.desc || "";
      if (!title) continue;

      // Apply content rules
      if (isPromo(title, v.desc || "")) continue;
      if (!isRecent(new Date(v.create_time * 1000).toISOString(), 48)) continue;

      // Only 1 video per account — take the most recent passing filters
      const videoUrl = `https://www.tiktok.com/@${account.username}/video/${v.id}`;
      items.push({
        id: `tiktok:${account.username}:${v.id}`,
        title: title.slice(0, 200),
        url: videoUrl,
        directVideoUrl: v.hdplay || v.play || undefined,
        thumbnail: v.cover || v.origin_cover || "",
        publishedAt: new Date(v.create_time * 1000),
        sourceName: account.displayName,
        sourceType: "direct-mp4",
        category: account.category,
      });

      if (items.length >= 1) break; // 1 per account per day
    }
    return items;
  } catch (err: any) {
    console.warn(`[tiktok-scraper] ${account.username}: ${err?.message}`);
    return [];
  }
}

// ── 7. TikWM Trending — always returns fresh viral videos ────────────────────
async function fetchTikWMTrending(): Promise<VideoItem[]> {
  const TRENDING_ACCOUNTS = [
    { username: "citizen.digital",   cat: "NEWS",          name: "Citizen Digital" },
    { username: "bbcnewsswahili",    cat: "NEWS",          name: "BBC News Swahili" },
    { username: "aljazeeraenglish",  cat: "NEWS",          name: "Al Jazeera" },
    { username: "cnn",               cat: "NEWS",          name: "CNN" },
    { username: "skysportsnews",     cat: "SPORTS",        name: "Sky Sports News" },
    { username: "espn",              cat: "SPORTS",        name: "ESPN" },
    { username: "tmz",               cat: "CELEBRITY",     name: "TMZ" },
    { username: "nbcnews",           cat: "NEWS",          name: "NBC News" },
    { username: "bbcnews",           cat: "NEWS",          name: "BBC News" },
    { username: "abcnews",           cat: "NEWS",          name: "ABC News" },
  ];

  const items: VideoItem[] = [];
  const now = new Date().toISOString();

  await Promise.allSettled(TRENDING_ACCOUNTS.map(async (acct) => {
    try {
      const body = new URLSearchParams({ unique_id: acct.username, count: "5", cursor: "0" });
      const res = await fetch("https://www.tikwm.com/api/user/posts", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/1.0)" },
        body: body.toString(),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) return;
      const data = await res.json() as any;
      if (data.code !== 0 || !data.data?.videos?.length) return;

      for (const v of data.data.videos.slice(0, 2)) {
        const title = v.title || v.desc || "";
        if (!title) continue;
        if (!isRecent(new Date(v.create_time * 1000).toISOString(), 48)) continue;
        const videoUrl = `https://www.tiktok.com/@${acct.username}/video/${v.id}`;
        items.push({
          id: `tikwm:${acct.username}:${v.id}`,
          title: title.slice(0, 200),
          url: videoUrl,
          directVideoUrl: v.hdplay || v.play || undefined,
          thumbnail: v.cover || v.origin_cover || "",
          publishedAt: new Date(v.create_time * 1000),
          sourceName: acct.name,
          sourceType: "direct-mp4",
          category: acct.cat,
        });
      }
    } catch {}
  }));

  return items;
}

export async function fetchAllVideoSources(): Promise<VideoItem[]> {
  // Initialize bloom filter — use try/catch in case of API changes
  if (!bloom) {
    try { bloom = BloomFilter.create(BLOOM_CAPACITY, BLOOM_FALSE_POSITIVE); }
    catch { bloom = null; }
  }

  const allResults = await Promise.allSettled([
    // YouTube (10 channels) — may be blocked server-side
    ...YOUTUBE_CHANNELS.map(ch => fetchYouTubeChannel(ch.id, ch.name, ch.cat)),
    // Dailymotion (4 feeds)
    ...DAILYMOTION_FEEDS.map(f => fetchDailymotionFeed(f.url, f.name, f.cat)),
    // Reddit (5 subreddits) — most reliable, no auth needed
    ...REDDIT_FEEDS.map(f => fetchRedditFeed(f.url, f.name, f.cat)),
    // News RSS with video embeds (YouTube embeds + MP4 enclosures only)
    ...NEWS_RSS_FEEDS.map(f => fetchNewsRSSWithVideo(f.url, f.name, f.cat)),
    // Vimeo (2 feeds)
    ...VIMEO_FEEDS.map(f => fetchVimeoFeed(f.url, f.name, f.cat)),
    // TikTok accounts via TikWM
    ...TIKTOK_ACCOUNTS.map(a => fetchTikTokAccountVideos(a)),
    // TikWM trending — always returns fresh videos
    fetchTikWMTrending(),
  ]);

  const all: VideoItem[] = [];
  for (const result of allResults) {
    if (result.status === "fulfilled") all.push(...result.value);
  }

  // Deduplicate by ID
  const seen = new Set<string>();
  const deduped = all.filter(v => {
    if (seen.has(v.id)) return false;
    if (bloom && bloom.has(v.id)) return false;
    seen.add(v.id);
    bloom?.add(v.id);
    return true;
  });

  // Sort newest first
  deduped.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  return deduped;
}

export { TIKTOK_ACCOUNTS, buildAttribution };
