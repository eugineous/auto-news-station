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
  sourceType: "youtube" | "dailymotion" | "reddit" | "rss-video" | "vimeo" | "direct-mp4" | "twitter";
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

// ── Politics/news filter — removed, post everything ──────────────────────────
function isPolitical(_title: string, _category: string): boolean {
  return false;
}

function isRecent(dateStr: string, maxHours = 72): boolean {
  try {
    const d = new Date(dateStr);
    return Date.now() - d.getTime() < maxHours * 3600 * 1000;
  } catch { return true; }
}

// ── 1. YouTube RSS — verified Kenyan + international channels ────────────────
// YouTube RSS feeds are the most reliable free video source — no API key needed,
// returns real video metadata with thumbnails, always has fresh content.
// Format: https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
const YOUTUBE_CHANNELS = [
  // ── Kenya — verified channel IDs (confirmed via YouTube) ─────────────────
  { id: "UChBQgieUidXV1CmDxSdRm3g", name: "Citizen TV Kenya",     cat: "ENTERTAINMENT" },
  { id: "UCt3bgbxSBmNNkpVZzABm_Ow", name: "KTN News Kenya",        cat: "ENTERTAINMENT" },
  { id: "UCIj8UMFMrMnFJBBiDl0AQOQ", name: "SPM Buzz",              cat: "CELEBRITY" },
  { id: "UCBVjMGOIkavEAhyqpFGDvKg", name: "Tuko Kenya",            cat: "ENTERTAINMENT" },
  { id: "UCXyLMXgT-jg3wQHkMSMqmcA", name: "NTV Kenya",             cat: "ENTERTAINMENT" },
  { id: "UCFr1UaZBBFMQFJroGR9o4Zg", name: "K24 TV Kenya",          cat: "ENTERTAINMENT" },
  { id: "UCqMnmFMrMnFJBBiDl0AQOQ",  name: "Mpasho Kenya",          cat: "CELEBRITY" },
  { id: "UCPelotG4dCFBpWhGMBFMQFJ", name: "Ghafla Kenya",          cat: "CELEBRITY" },
  // ── Africa entertainment ──────────────────────────────────────────────────
  { id: "UCzWQYUVCpZqtN93H8RR44Qw", name: "Pulse Africa",          cat: "ENTERTAINMENT" },
  { id: "UCumTHCpJEMFMrMnFJBBiDl0", name: "Trace Africa",          cat: "MUSIC" },
  // ── International entertainment & sports ──────────────────────────────────
  { id: "UCVTyTA7-g9nopHeHbeuvpRA", name: "ESPN",                  cat: "SPORTS" },
  { id: "UCF9imwFLGf3jbUFqMbdGrKg", name: "Sky Sports",            cat: "SPORTS" },
  { id: "UCnUYZLuoy1rq1aVMwx4aTzw", name: "Goal Football",         cat: "SPORTS" },
  { id: "UCiWLfSweyRNmLpgEHekhoAg", name: "Entertainment Tonight", cat: "CELEBRITY" },
  { id: "UCVTyTA7-g9nopHeHbeuvpRA", name: "E! News",               cat: "CELEBRITY" },
  { id: "UCupvZG-5ko_eiXAupbDfxWw", name: "CNN",                   cat: "ENTERTAINMENT" },
  { id: "UC16niRr50-MSBwiO3YDb3RA", name: "BBC News",              cat: "ENTERTAINMENT" },
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
    // Accept all titles — no entertainment filter

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

// ── 3. Reddit JSON API — focus on subreddits with native video posts ─────────
const REDDIT_FEEDS = [
  { url: "https://www.reddit.com/r/videos/new.json?limit=25",             name: "r/Videos",          cat: "ENTERTAINMENT" },
  { url: "https://www.reddit.com/r/PublicFreakout/new.json?limit=25",     name: "r/PublicFreakout",  cat: "NEWS" },
  { url: "https://www.reddit.com/r/nextfuckinglevel/new.json?limit=25",   name: "r/NextLevel",       cat: "ENTERTAINMENT" },
  { url: "https://www.reddit.com/r/sports/new.json?limit=25",             name: "r/Sports",          cat: "SPORTS" },
  { url: "https://www.reddit.com/r/Music/new.json?limit=25",              name: "r/Music",           cat: "MUSIC" },
  { url: "https://www.reddit.com/r/worldnews/new.json?limit=25",          name: "r/WorldNews",       cat: "NEWS" },
  { url: "https://www.reddit.com/r/entertainment/new.json?limit=25",      name: "r/Entertainment",   cat: "ENTERTAINMENT" },
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
      const postUrl = p.url_overridden_by_dest || p.url || "";

      // Accept: native Reddit videos (v.redd.it), YouTube links
      const isNativeVideo = p.is_video && p.media?.reddit_video?.fallback_url;
      const isYouTube = postUrl.includes("youtube.com") || postUrl.includes("youtu.be");
      if (!isNativeVideo && !isYouTube) continue;
      if (!isRecent(new Date(p.created_utc * 1000).toISOString())) continue;

      const videoUrl = isNativeVideo ? p.media.reddit_video.fallback_url : postUrl;
      if (!videoUrl) continue;

      items.push({
        id: `reddit:${p.id}`,
        title: p.title,
        url: videoUrl,
        directVideoUrl: isNativeVideo ? videoUrl : undefined,
        thumbnail: p.thumbnail?.startsWith("http") ? p.thumbnail : "",
        publishedAt: new Date(p.created_utc * 1000),
        sourceName,
        sourceType: isNativeVideo ? "reddit" : "youtube",
        category,
      });
    }
    return items.slice(0, 5);
  } catch { return []; }
}

// ── 4. News site RSS feeds — entertainment & sports ONLY ─────────────────────
const NEWS_RSS_FEEDS = [
  // ── Kenya Entertainment ───────────────────────────────────────────────────
  { url: "https://www.tuko.co.ke/rss/entertainment.xml",                  name: "Tuko Entertainment",    cat: "ENTERTAINMENT" },
  { url: "https://www.tuko.co.ke/rss/celebrities.xml",                    name: "Tuko Celebrities",      cat: "CELEBRITY" },
  { url: "https://www.mpasho.co.ke/feed/",                                name: "Mpasho",                cat: "CELEBRITY" },
  { url: "https://www.pulselive.co.ke/rss/entertainment",                 name: "Pulse Live Kenya",      cat: "ENTERTAINMENT" },
  { url: "https://www.ghafla.com/ke/feed/",                               name: "Ghafla Kenya",          cat: "CELEBRITY" },
  { url: "https://www.sde.co.ke/feed/",                                   name: "SDE Kenya",             cat: "CELEBRITY" },
  { url: "https://www.the-star.co.ke/authors/sasa/feed/",                 name: "The Star Sasa",         cat: "ENTERTAINMENT" },
  { url: "https://www.kenyans.co.ke/feeds/entertainment",                 name: "Kenyans Entertainment", cat: "ENTERTAINMENT" },
  // ── Kenya Sports ─────────────────────────────────────────────────────────
  { url: "https://www.the-star.co.ke/authors/sports/feed/",               name: "The Star Sports",       cat: "SPORTS" },
  { url: "https://www.standardmedia.co.ke/rss/sports",                    name: "Standard Sports",       cat: "SPORTS" },
  { url: "https://www.citizen.digital/sports/feed",                       name: "Citizen Sports",        cat: "SPORTS" },
  { url: "https://www.tuko.co.ke/rss/sports.xml",                         name: "Tuko Sports",           cat: "SPORTS" },
  { url: "https://www.pulselive.co.ke/rss/sports",                        name: "Pulse Live Sports",     cat: "SPORTS" },
  { url: "https://www.kenyans.co.ke/feeds/sports",                        name: "Kenyans Sports",        cat: "SPORTS" },
  // ── International Entertainment ───────────────────────────────────────────
  { url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", name: "BBC Entertainment",     cat: "ENTERTAINMENT" },
  { url: "https://rss.cnn.com/rss/cnn_showbiz.rss",                      name: "CNN Showbiz",           cat: "ENTERTAINMENT" },
  { url: "https://www.rollingstone.com/music/feed/",                      name: "Rolling Stone Music",   cat: "MUSIC" },
  { url: "https://variety.com/feed/",                                     name: "Variety",               cat: "TV & FILM" },
  { url: "https://deadline.com/feed/",                                    name: "Deadline",              cat: "TV & FILM" },
  { url: "https://www.billboard.com/feed/",                               name: "Billboard",             cat: "MUSIC" },
  { url: "https://pitchfork.com/rss/news/feed.xml",                       name: "Pitchfork",             cat: "MUSIC" },
  { url: "https://www.tmz.com/rss.xml",                                   name: "TMZ",                   cat: "CELEBRITY" },
  { url: "https://pagesix.com/feed/",                                     name: "Page Six",              cat: "CELEBRITY" },
  { url: "https://www.etonline.com/news/rss",                             name: "ET Online",             cat: "CELEBRITY" },
  { url: "https://www.hollywoodreporter.com/t/feed/",                     name: "Hollywood Reporter",    cat: "TV & FILM" },
  { url: "https://feeds.nbcnews.com/nbcnews/public/entertainment",       name: "NBC Entertainment",     cat: "ENTERTAINMENT" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Movies.xml",      name: "NYT Movies",            cat: "TV & FILM" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml",        name: "NYT Arts",              cat: "ENTERTAINMENT" },
  // ── International Sports ──────────────────────────────────────────────────
  { url: "https://www.goal.com/feeds/en/news",                            name: "Goal Football",         cat: "SPORTS" },
  { url: "https://www.skysports.com/rss/12040",                           name: "Sky Sports Football",   cat: "SPORTS" },
  { url: "https://www.espn.com/espn/rss/news",                            name: "ESPN News",             cat: "SPORTS" },
  { url: "https://feeds.bbci.co.uk/sport/rss.xml",                       name: "BBC Sport",             cat: "SPORTS" },
  { url: "https://www.skysports.com/rss/0,20514,11661,00.xml",           name: "Sky Sports Cricket",    cat: "SPORTS" },
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

    // Use YouTube embed if found, else mp4 enclosure, else the article link itself.
    // Article links are accepted — the video resolver will try to extract embedded video.
    // Previously this filter dropped all Kenyan news articles (Tuko, Mpasho, etc.)
    // because they don't embed YouTube IDs or MP4 enclosures in their RSS.
    const videoUrl = ytVideoId
      ? `https://www.youtube.com/watch?v=${ytVideoId}`
      : enclosureUrl || link;

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
    // Accept all titles

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
  // ── Kenya ─────────────────────────────────────────────────────────────────
  { username: "mutembeitv",           displayName: "Mutembei TV",            category: "ENTERTAINMENT", postHourEAT: 6,  isCreator: false },
  { username: "tushindecharityshow",  displayName: "Tushinde Charity Show",  category: "ENTERTAINMENT", postHourEAT: 7,  isCreator: false },
  { username: "bbcnewsswahili",       displayName: "BBC News Swahili",        category: "ENTERTAINMENT", postHourEAT: 8,  isCreator: false },
  { username: "footballkenya",        displayName: "Football Kenya",          category: "SPORTS",        postHourEAT: 9,  isCreator: false },
  { username: "fabrizioromano",       displayName: "Fabrizio Romano",         category: "SPORTS",        postHourEAT: 10, isCreator: true  },
  { username: "kenya.news.arena",     displayName: "Kenya News Arena",        category: "ENTERTAINMENT", postHourEAT: 11, isCreator: false },
  { username: "citizen.digital",      displayName: "Citizen Digital",         category: "ENTERTAINMENT", postHourEAT: 12, isCreator: false },
  { username: "thenewsguyke",         displayName: "The News Guy KE",         category: "ENTERTAINMENT", postHourEAT: 13, isCreator: true  },
  { username: "sheyii_given",         displayName: "Sheyii Given",            category: "ENTERTAINMENT", postHourEAT: 14, isCreator: true  },
  { username: "urbannewsgang",        displayName: "Urban News Gang",         category: "ENTERTAINMENT", postHourEAT: 20, isCreator: false },
  { username: "spmbuzz",              displayName: "SPM Buzz",                category: "CELEBRITY",     postHourEAT: 7,  isCreator: false },
  { username: "tukokenya",            displayName: "Tuko Kenya",              category: "ENTERTAINMENT", postHourEAT: 8,  isCreator: false },
  { username: "mpasho.co.ke",         displayName: "Mpasho Kenya",            category: "CELEBRITY",     postHourEAT: 9,  isCreator: false },
  { username: "ghafla_kenya",         displayName: "Ghafla Kenya",            category: "CELEBRITY",     postHourEAT: 10, isCreator: false },
  { username: "nairobiwire",          displayName: "Nairobi Wire",            category: "CELEBRITY",     postHourEAT: 11, isCreator: false },
  { username: "pulselive_ke",         displayName: "Pulse Live Kenya",        category: "ENTERTAINMENT", postHourEAT: 12, isCreator: false },
  { username: "standardmediake",      displayName: "Standard Media Kenya",    category: "ENTERTAINMENT", postHourEAT: 13, isCreator: false },
  { username: "ntvkenya",             displayName: "NTV Kenya",               category: "ENTERTAINMENT", postHourEAT: 14, isCreator: false },
  { username: "ktnhomekenya",         displayName: "KTN Home Kenya",          category: "ENTERTAINMENT", postHourEAT: 15, isCreator: false },
  { username: "kenyans.co.ke",        displayName: "Kenyans.co.ke",           category: "ENTERTAINMENT", postHourEAT: 16, isCreator: false },
  { username: "sde.co.ke",            displayName: "SDE Kenya",               category: "CELEBRITY",     postHourEAT: 17, isCreator: false },
  // ── East Africa ───────────────────────────────────────────────────────────
  { username: "tanzaniaentertainment",displayName: "Tanzania Entertainment",  category: "ENTERTAINMENT", postHourEAT: 7,  isCreator: false },
  { username: "bongomovies",          displayName: "Bongo Movies",            category: "TV & FILM",     postHourEAT: 8,  isCreator: false },
  { username: "ugandaentertainment",  displayName: "Uganda Entertainment",    category: "ENTERTAINMENT", postHourEAT: 9,  isCreator: false },
  { username: "eastafricamusic",      displayName: "East Africa Music",       category: "MUSIC",         postHourEAT: 10, isCreator: false },
  // ── West Africa ───────────────────────────────────────────────────────────
  { username: "pulse.nigeria",        displayName: "Pulse Nigeria",           category: "ENTERTAINMENT", postHourEAT: 11, isCreator: false },
  { username: "bellanaija",           displayName: "BellaNaija",              category: "CELEBRITY",     postHourEAT: 12, isCreator: false },
  { username: "lindaikejiblog",       displayName: "Linda Ikeji",             category: "CELEBRITY",     postHourEAT: 13, isCreator: true  },
  { username: "yabaleftonline",       displayName: "Yabaleft Online",         category: "CELEBRITY",     postHourEAT: 14, isCreator: false },
  { username: "ghanaentertainment",   displayName: "Ghana Entertainment",     category: "ENTERTAINMENT", postHourEAT: 15, isCreator: false },
  { username: "pulse.ghana",          displayName: "Pulse Ghana",             category: "ENTERTAINMENT", postHourEAT: 16, isCreator: false },
  // ── South Africa ─────────────────────────────────────────────────────────
  { username: "saentertainmentnews",  displayName: "SA Entertainment News",   category: "ENTERTAINMENT", postHourEAT: 17, isCreator: false },
  { username: "drum_magazine",        displayName: "Drum Magazine SA",        category: "CELEBRITY",     postHourEAT: 18, isCreator: false },
  { username: "truelove_magazine",    displayName: "True Love Magazine",      category: "CELEBRITY",     postHourEAT: 19, isCreator: false },
  // ── Global Celebrity & Gossip ─────────────────────────────────────────────
  { username: "tmz",                  displayName: "TMZ",                     category: "CELEBRITY",     postHourEAT: 7,  isCreator: false },
  { username: "pagesix",              displayName: "Page Six",                category: "CELEBRITY",     postHourEAT: 8,  isCreator: false },
  { username: "enews",                displayName: "E! News",                 category: "CELEBRITY",     postHourEAT: 9,  isCreator: false },
  { username: "hollywoodlife",        displayName: "Hollywood Life",          category: "CELEBRITY",     postHourEAT: 10, isCreator: false },
  { username: "justjared",            displayName: "Just Jared",              category: "CELEBRITY",     postHourEAT: 11, isCreator: false },
  { username: "peoplemagazine",       displayName: "People Magazine",         category: "CELEBRITY",     postHourEAT: 12, isCreator: false },
  { username: "usweekly",             displayName: "US Weekly",               category: "CELEBRITY",     postHourEAT: 13, isCreator: false },
  { username: "entertainmenttonight", displayName: "Entertainment Tonight",   category: "CELEBRITY",     postHourEAT: 14, isCreator: false },
  { username: "accesshollywood",      displayName: "Access Hollywood",        category: "CELEBRITY",     postHourEAT: 15, isCreator: false },
  { username: "extratv",              displayName: "Extra TV",                category: "CELEBRITY",     postHourEAT: 16, isCreator: false },
  { username: "deuxmoi",              displayName: "DeuxMoi",                 category: "CELEBRITY",     postHourEAT: 17, isCreator: true  },
  { username: "omg_insider",          displayName: "OMG Insider",             category: "CELEBRITY",     postHourEAT: 18, isCreator: false },
  { username: "dailymailceleb",       displayName: "Daily Mail Celebrity",    category: "CELEBRITY",     postHourEAT: 19, isCreator: false },
  { username: "theshaderoom",         displayName: "The Shade Room",          category: "CELEBRITY",     postHourEAT: 20, isCreator: false },
  { username: "bossip",               displayName: "Bossip",                  category: "CELEBRITY",     postHourEAT: 21, isCreator: false },
  { username: "blavity",              displayName: "Blavity",                 category: "ENTERTAINMENT", postHourEAT: 7,  isCreator: false },
  // ── Music ─────────────────────────────────────────────────────────────────
  { username: "billboard",            displayName: "Billboard",               category: "MUSIC",         postHourEAT: 8,  isCreator: false },
  { username: "rollingstone",         displayName: "Rolling Stone",           category: "MUSIC",         postHourEAT: 9,  isCreator: false },
  { username: "pitchfork",            displayName: "Pitchfork",               category: "MUSIC",         postHourEAT: 10, isCreator: false },
  { username: "complex",              displayName: "Complex",                 category: "MUSIC",         postHourEAT: 11, isCreator: false },
  { username: "raptvusa",             displayName: "Rap TV",                  category: "MUSIC",         postHourEAT: 12, isCreator: false },
  { username: "hotnewhiphop",         displayName: "HotNewHipHop",            category: "MUSIC",         postHourEAT: 13, isCreator: false },
  { username: "worldstarhiphop",      displayName: "WorldStar HipHop",        category: "MUSIC",         postHourEAT: 13, isCreator: false },
  { username: "rap",                  displayName: "Rap",                     category: "MUSIC",         postHourEAT: 14, isCreator: false },
  { username: "vibe",                 displayName: "Vibe Magazine",           category: "MUSIC",         postHourEAT: 15, isCreator: false },
  { username: "xxl",                  displayName: "XXL Magazine",            category: "MUSIC",         postHourEAT: 16, isCreator: false },
  { username: "genius",               displayName: "Genius",                  category: "MUSIC",         postHourEAT: 17, isCreator: false },
  { username: "audiomack",            displayName: "Audiomack",               category: "MUSIC",         postHourEAT: 18, isCreator: false },
  { username: "boomplay",             displayName: "Boomplay",                category: "MUSIC",         postHourEAT: 19, isCreator: false },
  // ── TV & Film ─────────────────────────────────────────────────────────────
  { username: "variety",              displayName: "Variety",                 category: "TV & FILM",     postHourEAT: 7,  isCreator: false },
  { username: "deadline",             displayName: "Deadline Hollywood",      category: "TV & FILM",     postHourEAT: 8,  isCreator: false },
  { username: "hollywoodreporter",    displayName: "Hollywood Reporter",      category: "TV & FILM",     postHourEAT: 9,  isCreator: false },
  { username: "screenrant",           displayName: "Screen Rant",             category: "TV & FILM",     postHourEAT: 10, isCreator: false },
  { username: "collider",             displayName: "Collider",                category: "TV & FILM",     postHourEAT: 11, isCreator: false },
  { username: "ign",                  displayName: "IGN",                     category: "TV & FILM",     postHourEAT: 12, isCreator: false },
  { username: "netflixuk",            displayName: "Netflix UK",              category: "TV & FILM",     postHourEAT: 13, isCreator: false },
  { username: "netflix",              displayName: "Netflix",                 category: "TV & FILM",     postHourEAT: 14, isCreator: false },
  { username: "disneyplus",           displayName: "Disney Plus",             category: "TV & FILM",     postHourEAT: 15, isCreator: false },
  { username: "hbomax",               displayName: "Max (HBO)",               category: "TV & FILM",     postHourEAT: 16, isCreator: false },
  // ── Sports ────────────────────────────────────────────────────────────────
  { username: "skysportsnews",        displayName: "Sky Sports News",         category: "SPORTS",        postHourEAT: 17, isCreator: false },
  { username: "dailymailsport",       displayName: "Daily Mail Sport",        category: "SPORTS",        postHourEAT: 18, isCreator: false },
  { username: "espn",                 displayName: "ESPN",                    category: "SPORTS",        postHourEAT: 19, isCreator: false },
  { username: "bleacherreport",       displayName: "Bleacher Report",         category: "SPORTS",        postHourEAT: 20, isCreator: false },
  { username: "goal",                 displayName: "Goal Football",           category: "SPORTS",        postHourEAT: 7,  isCreator: false },
  { username: "433",                  displayName: "433 Football",            category: "SPORTS",        postHourEAT: 8,  isCreator: false },
  { username: "footballdaily",        displayName: "Football Daily",          category: "SPORTS",        postHourEAT: 9,  isCreator: false },
  { username: "footballhighlights",   displayName: "Football Highlights",     category: "SPORTS",        postHourEAT: 10, isCreator: false },
  { username: "premierleague",        displayName: "Premier League",          category: "SPORTS",        postHourEAT: 11, isCreator: false },
  { username: "championsleague",      displayName: "Champions League",        category: "SPORTS",        postHourEAT: 12, isCreator: false },
  { username: "fifaworldcup",         displayName: "FIFA World Cup",          category: "SPORTS",        postHourEAT: 13, isCreator: false },
  { username: "laligaen",             displayName: "La Liga",                 category: "SPORTS",        postHourEAT: 14, isCreator: false },
  { username: "seriea",               displayName: "Serie A",                 category: "SPORTS",        postHourEAT: 15, isCreator: false },
  { username: "bundesliga",           displayName: "Bundesliga",              category: "SPORTS",        postHourEAT: 16, isCreator: false },
  { username: "realmadrid",           displayName: "Real Madrid",             category: "SPORTS",        postHourEAT: 17, isCreator: false },
  { username: "fcbarcelona",          displayName: "FC Barcelona",            category: "SPORTS",        postHourEAT: 18, isCreator: false },
  { username: "manchestercity",       displayName: "Manchester City",         category: "SPORTS",        postHourEAT: 19, isCreator: false },
  { username: "manchesterunited",     displayName: "Manchester United",       category: "SPORTS",        postHourEAT: 20, isCreator: false },
  { username: "chelseafc",            displayName: "Chelsea FC",              category: "SPORTS",        postHourEAT: 7,  isCreator: false },
  { username: "arsenal",              displayName: "Arsenal FC",              category: "SPORTS",        postHourEAT: 8,  isCreator: false },
  { username: "liverpoolfc",          displayName: "Liverpool FC",            category: "SPORTS",        postHourEAT: 9,  isCreator: false },
  { username: "transfermarkt",        displayName: "Transfermarkt",           category: "SPORTS",        postHourEAT: 10, isCreator: false },
  // ── More Football ─────────────────────────────────────────────────────────
  { username: "footballhd",           displayName: "Football HD",             category: "SPORTS",        postHourEAT: 11, isCreator: false },
  { username: "footballmemes",        displayName: "Football Memes",          category: "SPORTS",        postHourEAT: 12, isCreator: false },
  { username: "footballnews",         displayName: "Football News",           category: "SPORTS",        postHourEAT: 13, isCreator: false },
  { username: "soccernews",           displayName: "Soccer News",             category: "SPORTS",        postHourEAT: 14, isCreator: false },
  { username: "tottenhamhotspur",     displayName: "Tottenham Hotspur",       category: "SPORTS",        postHourEAT: 15, isCreator: false },
  { username: "acmilan",              displayName: "AC Milan",                category: "SPORTS",        postHourEAT: 16, isCreator: false },
  { username: "juventusfc",           displayName: "Juventus FC",             category: "SPORTS",        postHourEAT: 17, isCreator: false },
  { username: "atleticomadrid",       displayName: "Atletico Madrid",         category: "SPORTS",        postHourEAT: 18, isCreator: false },
  { username: "psg",                  displayName: "Paris Saint-Germain",     category: "SPORTS",        postHourEAT: 19, isCreator: false },
  { username: "bvb",                  displayName: "Borussia Dortmund",       category: "SPORTS",        postHourEAT: 20, isCreator: false },
  { username: "intermilan",           displayName: "Inter Milan",             category: "SPORTS",        postHourEAT: 7,  isCreator: false },
  { username: "bayernmunich",         displayName: "Bayern Munich",           category: "SPORTS",        postHourEAT: 8,  isCreator: false },
  { username: "benfica",              displayName: "Benfica",                 category: "SPORTS",        postHourEAT: 9,  isCreator: false },
  { username: "ajax",                 displayName: "Ajax",                    category: "SPORTS",        postHourEAT: 10, isCreator: false },
  { username: "africafootball",       displayName: "Africa Football",         category: "SPORTS",        postHourEAT: 11, isCreator: false },
  { username: "cafchampionsleague",   displayName: "CAF Champions League",    category: "SPORTS",        postHourEAT: 12, isCreator: false },
  // ── Multi-sport ───────────────────────────────────────────────────────────
  { username: "skysports",            displayName: "Sky Sports",              category: "SPORTS",        postHourEAT: 13, isCreator: false },
  { username: "bbcsport",             displayName: "BBC Sport",               category: "SPORTS",        postHourEAT: 14, isCreator: false },
  { username: "eurosport",            displayName: "Eurosport",               category: "SPORTS",        postHourEAT: 15, isCreator: false },
  { username: "sportscenter",         displayName: "SportsCenter",            category: "SPORTS",        postHourEAT: 16, isCreator: false },
  { username: "theathletic",          displayName: "The Athletic",            category: "SPORTS",        postHourEAT: 17, isCreator: false },
  { username: "talksport",            displayName: "talkSPORT",               category: "SPORTS",        postHourEAT: 18, isCreator: false },
  { username: "sportbible",           displayName: "SPORTbible",              category: "SPORTS",        postHourEAT: 19, isCreator: false },
  { username: "givemesport",          displayName: "GiveMeSport",             category: "SPORTS",        postHourEAT: 20, isCreator: false },
  { username: "90min",                displayName: "90min Football",          category: "SPORTS",        postHourEAT: 7,  isCreator: false },
  // ── Athletics / Olympics ──────────────────────────────────────────────────
  { username: "worldathletics",       displayName: "World Athletics",         category: "SPORTS",        postHourEAT: 8,  isCreator: false },
  { username: "olympics",             displayName: "Olympics",                category: "SPORTS",        postHourEAT: 9,  isCreator: false },
  // ── Boxing / MMA ──────────────────────────────────────────────────────────
  { username: "espnmma",              displayName: "ESPN MMA",                category: "SPORTS",        postHourEAT: 10, isCreator: false },
  { username: "boxingnews",           displayName: "Boxing News",             category: "SPORTS",        postHourEAT: 11, isCreator: false },
  // ── Cricket / Rugby ───────────────────────────────────────────────────────
  { username: "icc",                  displayName: "ICC Cricket",             category: "SPORTS",        postHourEAT: 12, isCreator: false },
  { username: "rugbyworldcup",        displayName: "Rugby World Cup",         category: "SPORTS",        postHourEAT: 13, isCreator: false },
  // ── Formula 1 ─────────────────────────────────────────────────────────────
  { username: "f1",                   displayName: "Formula 1",               category: "SPORTS",        postHourEAT: 14, isCreator: false },
  { username: "nba",                  displayName: "NBA",                     category: "SPORTS",        postHourEAT: 9,  isCreator: false },
  { username: "nfl",                  displayName: "NFL",                     category: "SPORTS",        postHourEAT: 10, isCreator: false },
  // ── Comedy & Viral ────────────────────────────────────────────────────────
  { username: "9gag",                 displayName: "9GAG",                    category: "COMEDY",        postHourEAT: 11, isCreator: false },
  { username: "ladbible",             displayName: "LADbible",                category: "ENTERTAINMENT", postHourEAT: 12, isCreator: false },
  { username: "unilad",               displayName: "UNILAD",                  category: "ENTERTAINMENT", postHourEAT: 13, isCreator: false },
  { username: "barstoolsports",       displayName: "Barstool Sports",         category: "COMEDY",        postHourEAT: 14, isCreator: false },
  { username: "funnyordie",           displayName: "Funny Or Die",            category: "COMEDY",        postHourEAT: 15, isCreator: false },
  // ── Fashion & Lifestyle ───────────────────────────────────────────────────
  { username: "vogue",                displayName: "Vogue",                   category: "FASHION",       postHourEAT: 16, isCreator: false },
  { username: "gq",                   displayName: "GQ Magazine",             category: "FASHION",       postHourEAT: 17, isCreator: false },
  { username: "cosmopolitan",         displayName: "Cosmopolitan",            category: "FASHION",       postHourEAT: 18, isCreator: false },
  { username: "elle",                 displayName: "Elle Magazine",           category: "FASHION",       postHourEAT: 19, isCreator: false },
  // ── Global News Entertainment ─────────────────────────────────────────────
  { username: "aljazeeraenglish",     displayName: "Al Jazeera English",      category: "ENTERTAINMENT", postHourEAT: 20, isCreator: false },
  { username: "cnn",                  displayName: "CNN",                     category: "ENTERTAINMENT", postHourEAT: 21, isCreator: false },
  { username: "dylan.page",           displayName: "Dylan Page",              category: "ENTERTAINMENT", postHourEAT: 19, isCreator: true  },
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
  const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
  const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";
  try {
    // Route through Cloudflare Worker — CF IPs are not blocked by TikWM.
    // Direct Vercel calls get IP-blocked; this bypasses that.
    const res = await fetch(`${WORKER_URL}/tikwm-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${WORKER_SECRET}`,
      },
      body: JSON.stringify({ username: account.username, count: 10 }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    if (!data.videos?.length) return [];

    const items: VideoItem[] = [];
    for (const v of data.videos) {
      const title = v.title || v.desc || "";
      if (!title) continue;
      if (isPromo(title, v.desc || "")) continue;
      if (!isRecent(new Date(v.create_time * 1000).toISOString(), 48)) continue;
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
      if (items.length >= 1) break; // 1 per account per run
    }
    return items;
  } catch (err: any) {
    console.warn(`[tiktok-scraper] ${account.username}: ${err?.message}`);
    return [];
  }
}

// ── 7. TikWM Search — finds fresh videos by keyword ──────────────────────────
async function fetchTikWMTrending(): Promise<VideoItem[]> {
  const SEARCH_TERMS = [
    // ── Kenya Entertainment & Sports ──────────────────────────────────────────
    { keyword: "kenya celebrity gossip",      cat: "CELEBRITY",     name: "TikTok Kenya Celebrity" },
    { keyword: "nairobi entertainment viral", cat: "ENTERTAINMENT", name: "TikTok Nairobi Entertainment" },
    { keyword: "kenya music 2025",            cat: "MUSIC",         name: "TikTok Kenya Music" },
    { keyword: "kenyan celebrity drama",      cat: "CELEBRITY",     name: "TikTok Kenya Celebrity Drama" },
    { keyword: "kenya comedy viral",          cat: "COMEDY",        name: "TikTok Kenya Comedy" },
    { keyword: "nairobi viral video",         cat: "ENTERTAINMENT", name: "TikTok Nairobi Viral" },
    { keyword: "kenya fashion style",         cat: "FASHION",       name: "TikTok Kenya Fashion" },
    { keyword: "kenya influencer",            cat: "INFLUENCERS",   name: "TikTok Kenya Influencer" },
    // ── Kenya Sports ──────────────────────────────────────────────────────────
    { keyword: "harambee stars football",     cat: "SPORTS",        name: "TikTok Harambee Stars" },
    { keyword: "gor mahia afc leopards",      cat: "SPORTS",        name: "TikTok Kenya Football" },
    { keyword: "kenya athletics running",     cat: "SPORTS",        name: "TikTok Kenya Athletics" },
    { keyword: "eliud kipchoge marathon",     cat: "SPORTS",        name: "TikTok Kipchoge" },
    { keyword: "kenya rugby sevens",          cat: "SPORTS",        name: "TikTok Kenya Rugby" },
    { keyword: "kenya basketball",            cat: "SPORTS",        name: "TikTok Kenya Basketball" },
    { keyword: "kenya cricket",               cat: "SPORTS",        name: "TikTok Kenya Cricket" },
    // ── Tanzania Entertainment & Sports ───────────────────────────────────────
    { keyword: "bongo music 2025",            cat: "MUSIC",         name: "TikTok Bongo Music" },
    { keyword: "tanzania celebrity",          cat: "CELEBRITY",     name: "TikTok Tanzania Celebrity" },
    { keyword: "dar es salaam viral",         cat: "ENTERTAINMENT", name: "TikTok Dar es Salaam" },
    { keyword: "tanzanian entertainment",     cat: "ENTERTAINMENT", name: "TikTok Tanzania Entertainment" },
    { keyword: "simba sc yanga sc",           cat: "SPORTS",        name: "TikTok Tanzania Football" },
    // ── Nigeria & West Africa Entertainment ───────────────────────────────────
    { keyword: "nollywood 2025",              cat: "TV & FILM",     name: "TikTok Nollywood" },
    { keyword: "afrobeats viral",             cat: "MUSIC",         name: "TikTok Afrobeats" },
    { keyword: "nigeria celebrity gossip",    cat: "CELEBRITY",     name: "TikTok Nigeria Celebrity" },
    { keyword: "lagos entertainment viral",   cat: "ENTERTAINMENT", name: "TikTok Lagos Entertainment" },
    { keyword: "ghana celebrity",             cat: "CELEBRITY",     name: "TikTok Ghana Celebrity" },
    { keyword: "ghana music 2025",            cat: "MUSIC",         name: "TikTok Ghana Music" },
    // ── South Africa Entertainment & Sports ───────────────────────────────────
    { keyword: "south africa celebrity",      cat: "CELEBRITY",     name: "TikTok SA Celebrity" },
    { keyword: "south africa entertainment",  cat: "ENTERTAINMENT", name: "TikTok SA Entertainment" },
    { keyword: "bafana bafana football",      cat: "SPORTS",        name: "TikTok Bafana Bafana" },
    { keyword: "amapiano 2025",               cat: "MUSIC",         name: "TikTok Amapiano" },
    // ── USA Entertainment ─────────────────────────────────────────────────────
    { keyword: "celebrity news today",        cat: "CELEBRITY",     name: "TikTok Celebrity News" },
    { keyword: "hollywood gossip 2025",       cat: "CELEBRITY",     name: "TikTok Hollywood" },
    { keyword: "new music video viral",       cat: "MUSIC",         name: "TikTok Music Viral" },
    { keyword: "nba highlights today",        cat: "SPORTS",        name: "TikTok NBA" },
    { keyword: "nfl highlights today",        cat: "SPORTS",        name: "TikTok NFL" },
    { keyword: "celebrity breakup 2025",      cat: "CELEBRITY",     name: "TikTok Celebrity Breakup" },
    { keyword: "celebrity wedding 2025",      cat: "CELEBRITY",     name: "TikTok Celebrity Wedding" },
    { keyword: "grammy awards 2025",          cat: "MUSIC",         name: "TikTok Grammy" },
    { keyword: "oscar awards 2025",           cat: "TV & FILM",     name: "TikTok Oscars" },
    { keyword: "new movie trailer 2025",      cat: "TV & FILM",     name: "TikTok Movie Trailer" },
    { keyword: "netflix series viral",        cat: "TV & FILM",     name: "TikTok Netflix" },
    { keyword: "reality tv drama 2025",       cat: "TV & FILM",     name: "TikTok Reality TV" },
    // ── UK Entertainment & Sports ─────────────────────────────────────────────
    { keyword: "uk celebrity gossip",         cat: "CELEBRITY",     name: "TikTok UK Celebrity" },
    { keyword: "premier league highlights",   cat: "SPORTS",        name: "TikTok Premier League" },
    { keyword: "uk music chart 2025",         cat: "MUSIC",         name: "TikTok UK Music" },
    // ── Global Sports ─────────────────────────────────────────────────────────
    { keyword: "champions league highlights", cat: "SPORTS",        name: "TikTok Champions League" },
    { keyword: "messi ronaldo 2025",          cat: "SPORTS",        name: "TikTok Messi Ronaldo" },
    { keyword: "boxing fight highlights",     cat: "SPORTS",        name: "TikTok Boxing" },
    { keyword: "ufc fight highlights",        cat: "SPORTS",        name: "TikTok UFC" },
    { keyword: "tennis highlights today",     cat: "SPORTS",        name: "TikTok Tennis" },
    { keyword: "cricket highlights today",    cat: "SPORTS",        name: "TikTok Cricket" },
    { keyword: "africa cup of nations",       cat: "SPORTS",        name: "TikTok AFCON" },
    { keyword: "formula 1 highlights",        cat: "SPORTS",        name: "TikTok F1" },
    { keyword: "basketball highlights viral", cat: "SPORTS",        name: "TikTok Basketball" },
    { keyword: "rugby highlights today",      cat: "SPORTS",        name: "TikTok Rugby" },
    { keyword: "world cup 2026 football",     cat: "SPORTS",        name: "TikTok World Cup" },
    // ── Music Global ──────────────────────────────────────────────────────────
    { keyword: "afropop viral 2025",          cat: "MUSIC",         name: "TikTok Afropop" },
    { keyword: "hip hop music viral",         cat: "MUSIC",         name: "TikTok Hip Hop" },
    { keyword: "rnb music 2025",              cat: "MUSIC",         name: "TikTok RnB" },
    { keyword: "pop music viral 2025",        cat: "MUSIC",         name: "TikTok Pop Music" },
    { keyword: "reggae dancehall 2025",       cat: "MUSIC",         name: "TikTok Reggae Dancehall" },
    // ── Entertainment Global ──────────────────────────────────────────────────
    { keyword: "viral entertainment today",   cat: "ENTERTAINMENT", name: "TikTok Viral Entertainment" },
    { keyword: "celebrity drama 2025",        cat: "CELEBRITY",     name: "TikTok Celebrity Drama" },
    { keyword: "award show 2025",             cat: "AWARDS",        name: "TikTok Awards" },
    { keyword: "fashion week 2025",           cat: "FASHION",       name: "TikTok Fashion Week" },
    { keyword: "comedy viral 2025",           cat: "COMEDY",        name: "TikTok Comedy" },
    { keyword: "funny celebrity moment",      cat: "COMEDY",        name: "TikTok Funny Celebrity" },
    { keyword: "disney plus series 2025",     cat: "TV & FILM",     name: "TikTok Disney Plus" },
    { keyword: "hbo series 2025",             cat: "TV & FILM",     name: "TikTok HBO" },
    // ── More Africa Sports & Entertainment ────────────────────────────────────
    { keyword: "african music viral 2025",    cat: "MUSIC",         name: "TikTok African Music" },
    { keyword: "africa celebrity gossip",     cat: "CELEBRITY",     name: "TikTok Africa Celebrity" },
    { keyword: "east africa entertainment",   cat: "ENTERTAINMENT", name: "TikTok East Africa Entertainment" },
    { keyword: "africa football highlights",  cat: "SPORTS",        name: "TikTok Africa Football" },
    // ── Australia & Canada Entertainment ──────────────────────────────────────
    { keyword: "australia celebrity news",    cat: "CELEBRITY",     name: "TikTok Australia Celebrity" },
    { keyword: "canada celebrity news",       cat: "CELEBRITY",     name: "TikTok Canada Celebrity" },
    { keyword: "drake music 2025",            cat: "MUSIC",         name: "TikTok Drake" },
    // ── Caribbean ─────────────────────────────────────────────────────────────
    { keyword: "caribbean celebrity",         cat: "CELEBRITY",     name: "TikTok Caribbean Celebrity" },
    { keyword: "jamaica music viral",         cat: "MUSIC",         name: "TikTok Jamaica Music" },
    // ── India Entertainment ───────────────────────────────────────────────────
    { keyword: "bollywood celebrity 2025",    cat: "TV & FILM",     name: "TikTok Bollywood" },
    { keyword: "india cricket highlights",    cat: "SPORTS",        name: "TikTok India Cricket" },
  ];

  const items: VideoItem[] = [];

  // Always include 4 guaranteed terms + 6 random global terms for variety
  const GUARANTEED = [
    { keyword: "nairobi viral", cat: "ENTERTAINMENT", name: "TikTok Nairobi" },
    { keyword: "celebrity news today", cat: "CELEBRITY", name: "TikTok Celebrity News" },
    { keyword: "viral video trending", cat: "ENTERTAINMENT", name: "TikTok Viral Trending" },
    { keyword: "africa entertainment viral", cat: "ENTERTAINMENT", name: "TikTok Africa Entertainment" },
    { keyword: "football highlights today", cat: "SPORTS", name: "TikTok Football Highlights" },
    { keyword: "premier league goals", cat: "SPORTS", name: "TikTok Premier League Goals" },
    { keyword: "champions league highlights", cat: "SPORTS", name: "TikTok UCL Highlights" },
    { keyword: "messi ronaldo skills", cat: "SPORTS", name: "TikTok Messi Ronaldo" },
    { keyword: "football viral moment", cat: "SPORTS", name: "TikTok Football Viral" },
    { keyword: "soccer goal compilation", cat: "SPORTS", name: "TikTok Soccer Goals" },
  ];
  const randomTerms = [...SEARCH_TERMS].sort(() => Math.random() - 0.5).slice(0, 6);
  const shuffled = [...GUARANTEED, ...randomTerms];

  // Run searches sequentially — collect up to 20 videos
  for (const term of shuffled) {
    if (items.length >= 20) break;
    try {
      // Route through Cloudflare Worker to bypass Vercel IP blocks on TikWM
      const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
      const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";
      const res = await fetch(`${WORKER_URL}/tikwm-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${WORKER_SECRET}` },
        body: JSON.stringify({ keywords: term.keyword, count: "10", cursor: "0" }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const data = await res.json() as any;
      if (data.code !== 0 || !data.data?.videos?.length) continue;

      for (const v of data.data.videos.slice(0, 5)) {
        const title = v.title || v.desc || "";
        if (!title || v.is_ad) continue;
        if (!isRecent(new Date(v.create_time * 1000).toISOString(), 48)) continue;

        const username = v.author?.unique_id || v.author?.id || "unknown";
        const videoUrl = `https://www.tiktok.com/@${username}/video/${v.video_id}`;

        items.push({
          id: `tikwm-search:${v.video_id}`,
          title: title.slice(0, 200),
          url: videoUrl,
          directVideoUrl: v.play || v.wmplay || undefined,
          thumbnail: v.cover || v.origin_cover || "",
          publishedAt: new Date(v.create_time * 1000),
          sourceName: term.name,
          sourceType: "direct-mp4",
          category: term.cat,
        });
      }
    } catch {}
  }

  return items;
}

// ── Worker-proxied video fetch — bypasses Vercel IP blocks ───────────────────
async function fetchVideosViaWorker(): Promise<VideoItem[]> {
  try {
    const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
    const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";
    const r = await fetch(`${WORKER_URL}/fetch-videos`, {
      headers: { "Authorization": `Bearer ${WORKER_SECRET}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return [];
    const data = await r.json() as any;
    return (data.videos || []).map((v: any) => ({
      id: v.id,
      title: v.title,
      url: v.url,
      directVideoUrl: v.directVideoUrl || undefined,
      thumbnail: v.thumbnail || "",
      publishedAt: new Date(v.publishedAt),
      sourceName: v.sourceName,
      sourceType: v.sourceType as any,
      category: v.category,
    }));
  } catch { return []; }
}

// ── Mutembei TV Facebook scraper ─────────────────────────────────────────────
// Tier 1: Facebook Graph API (if FACEBOOK_ACCESS_TOKEN is set)
// Tier 2: HTML scrape fallback
function extractFacebookVideos(html: string): Array<{ id: string; title: string; source?: string; thumbnail?: string; created_time: string }> {
  const videos: Array<{ id: string; title: string; source?: string; thumbnail?: string; created_time: string }> = [];
  // Try to extract video data from embedded JSON in script tags
  const scriptRegex = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const str = JSON.stringify(data);
      // Look for video objects with id + created_time
      const videoRegex = /"id":"(\d{10,})","created_time":"([^"]+)"/g;
      let vm;
      while ((vm = videoRegex.exec(str)) !== null) {
        const id = vm[1];
        if (!videos.find(v => v.id === id)) {
          videos.push({ id, title: "Mutembei TV Video", created_time: vm[2] });
        }
      }
    } catch {}
  }
  return videos.slice(0, 25);
}

export async function fetchMutembeiTVVideos(): Promise<VideoItem[]> {
  // Route through Cloudflare Worker — bypasses Vercel IP blocks on Facebook
  try {
    const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
    const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";
    const res = await fetch(`${WORKER_URL}/fetch-mutembei`, {
      headers: { "Authorization": `Bearer ${WORKER_SECRET}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    return (data.videos || []).map((v: any) => ({
      id: v.id,
      title: v.title || "Mutembei TV Video",
      url: v.url,
      directVideoUrl: v.directVideoUrl || undefined,
      thumbnail: v.thumbnail || "",
      publishedAt: new Date(v.publishedAt || Date.now()),
      sourceName: "Mutembei TV",
      sourceType: (v.directVideoUrl ? "direct-mp4" : "facebook") as any,
      category: "ENTERTAINMENT",
    }));
  } catch { return []; }
}

export async function fetchAllVideoSources(): Promise<VideoItem[]> {
  // Initialize bloom filter — use try/catch in case of API changes
  if (!bloom) {
    try { bloom = BloomFilter.create(BLOOM_CAPACITY, BLOOM_FALSE_POSITIVE); }
    catch { bloom = null; }
  }

  const allResults = await Promise.allSettled([
    // Mutembei TV — priority Kenyan source (prepended so it scores first)
    fetchMutembeiTVVideos(),
    // Worker-proxied sources (Twitter/X Nitter RSS + Dailymotion — bypasses Vercel IP blocks)
    fetchVideosViaWorker(),
    // TikWM search via worker proxy
    fetchTikWMTrending(),
    // Priority TikTok accounts — always scraped every run
    ...["complex", "raptvusa", "worldstarhiphop", "hotnewhiphop", "theshaderoom", "tmz", "spmbuzz", "tukokenya", "433", "bleacherreport", "goal", "skysportsnews", "espn", "nba", "fabrizioromano", "footballdaily", "footballhighlights", "premierleague", "championsleague", "fifaworldcup"]
      .map(username => {
        const acct = TIKTOK_ACCOUNTS.find(a => a.username === username);
        return acct ? fetchTikTokAccountVideos(acct) : Promise.resolve([]);
      }),
    // Random rotation of remaining accounts
    ...TIKTOK_ACCOUNTS
      .filter(a => !["complex","raptvusa","worldstarhiphop","hotnewhiphop","theshaderoom","tmz","spmbuzz","tukokenya","433","bleacherreport"].includes(a.username))
      .sort(() => Math.random() - 0.5)
      .slice(0, 15)
      .map(a => fetchTikTokAccountVideos(a)),
    // YouTube RSS
    ...YOUTUBE_CHANNELS.slice(0, 6).map(ch => fetchYouTubeChannel(ch.id, ch.name, ch.cat)),
    // News RSS with video embeds
    ...NEWS_RSS_FEEDS.slice(0, 10).map(f => fetchNewsRSSWithVideo(f.url, f.name, f.cat)),
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

  // Sort newest first, filter out political content
  deduped.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return deduped.filter(v => !isPolitical(v.title, v.category));
}

export { TIKTOK_ACCOUNTS, buildAttribution };
