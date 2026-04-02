/**
 * Viral Intelligence Engine
 * Sources the latest, highest-potential content for PPP TV Kenya
 * Focus: Entertainment + Sports + Kenyan Music
 */

export interface ViralItem {
  id: string;
  title: string;
  url: string;
  directVideoUrl?: string;
  thumbnail: string;
  publishedAt: Date;
  sourceName: string;
  sourceType: string;
  category: string;
  viralScore: number;
  recencyScore: number;
  engagementScore: number;
  isKenyan: boolean;
  repurposeFormats: string[];
  playCount?: number;   // raw view count from source
}

const UA = "Mozilla/5.0 (compatible; PPPTVBot/2.0)";

// ── Viral score calculator ────────────────────────────────────────────────────
export function calculateViralScore(item: {
  publishedAt: Date;
  playCount?: number;
  likeCount?: number;
  shareCount?: number;
  commentCount?: number;
  title: string;
  category: string;
}): { viralScore: number; recencyScore: number; engagementScore: number } {
  const ageMs = Date.now() - item.publishedAt.getTime();
  const ageHours = ageMs / 3600000;

  // Recency score — exponential decay, max 100 for <1h, 0 for >48h
  const recencyScore = Math.max(0, Math.round(100 * Math.exp(-ageHours / 12)));

  // Engagement score based on available metrics
  const plays = item.playCount || 0;
  const likes = item.likeCount || 0;
  const shares = item.shareCount || 0;
  const comments = item.commentCount || 0;
  const engagementRaw = plays > 0
    ? Math.min(100, Math.round(((likes + shares * 3 + comments * 2) / Math.max(plays, 1)) * 1000))
    : Math.min(100, Math.round((likes + shares * 3 + comments * 2) / 100));
  const engagementScore = Math.min(100, engagementRaw);

  // Category heat multiplier
  const HOT_CATEGORIES = ["CELEBRITY", "MUSIC", "SPORTS", "TV & FILM", "COMEDY", "ENTERTAINMENT"];
  const categoryBoost = HOT_CATEGORIES.includes(item.category?.toUpperCase()) ? 20 : 0;

  // Viral keywords in title
  const VIRAL_WORDS = /\b(viral|trending|breaking|exclusive|first look|official|new|just|now|today|watch|shocking|unbelievable|incredible|amazing|wow|omg|fire|🔥|💥|🚨)\b/i;
  const titleBoost = VIRAL_WORDS.test(item.title) ? 15 : 0;

  const viralScore = Math.min(100, Math.round(
    (recencyScore * 0.4) + (engagementScore * 0.4) + categoryBoost + titleBoost
  ));

  return { viralScore, recencyScore, engagementScore };
}

// ── Kenyan music sources ──────────────────────────────────────────────────────
const KENYAN_MUSIC_FEEDS = [
  // Spotify Africa playlist RSS (via Spotify's public API)
  { url: "https://www.tuko.co.ke/rss/music.xml",                          name: "Tuko Music",           cat: "MUSIC" },
  { url: "https://www.pulselive.co.ke/rss/music",                         name: "Pulse Live Music",     cat: "MUSIC" },
  { url: "https://www.ghafla.com/ke/feed/?cat=music",                     name: "Ghafla Music",         cat: "MUSIC" },
  { url: "https://www.standardmedia.co.ke/rss/entertainment",             name: "Standard Music",       cat: "MUSIC" },
  // YouTube Music Kenya channels
  { url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCIj8UMFMrMnFJBBiDl0AQOQ", name: "SPM Buzz", cat: "MUSIC" },
];

// ── TikWM viral search — high engagement videos ───────────────────────────────
export async function fetchViralTikTokVideos(keywords: string[]): Promise<ViralItem[]> {
  const items: ViralItem[] = [];

  await Promise.allSettled(keywords.map(async (keyword) => {
    try {
      const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
      const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";
      const res = await fetch(`${WORKER_URL}/tikwm-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${WORKER_SECRET}` },
        body: JSON.stringify({ keywords: keyword, count: "10", cursor: "0" }),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) return;
      const data = await res.json() as any;
      if (data.code !== 0 || !data.data?.videos?.length) return;

      for (const v of data.data.videos.slice(0, 5)) {
        const title = v.title || v.desc || "";
        if (!title || v.is_ad) continue;

        // Only include videos with 200K+ views — skip low-engagement content
        const playCount = v.play_count || 0;
        if (playCount > 0 && playCount < 200000) continue;

        const publishedAt = new Date(v.create_time * 1000);
        const ageHours = (Date.now() - publishedAt.getTime()) / 3600000;
        if (ageHours > 48) continue; // only last 48h

        const { viralScore, recencyScore, engagementScore } = calculateViralScore({
          publishedAt,
          playCount: v.play_count,
          likeCount: v.digg_count,
          shareCount: v.share_count,
          commentCount: v.comment_count,
          title,
          category: "ENTERTAINMENT",
        });

        const username = v.author?.unique_id || "unknown";
        const isKenyan = /kenya|nairobi|kenyan|ke\b/i.test(title + " " + username);

        items.push({
          id: `viral:tiktok:${v.video_id}`,
          title: title.slice(0, 200),
          url: `https://www.tiktok.com/@${username}/video/${v.video_id}`,
          directVideoUrl: v.play || v.wmplay || undefined,
          thumbnail: v.cover || v.origin_cover || "",
          publishedAt,
          sourceName: `TikTok @${username}`,
          sourceType: "direct-mp4",
          category: isKenyan ? "ENTERTAINMENT" : "ENTERTAINMENT",
          viralScore,
          recencyScore,
          engagementScore,
          isKenyan,
          repurposeFormats: ["reel", "story"],
          playCount: v.play_count || 0,
        });
      }
    } catch {}
  }));

  return items.sort((a, b) => b.viralScore - a.viralScore);
}

// ── Kenyan music promotion keywords ──────────────────────────────────────────
export const KENYAN_MUSIC_KEYWORDS = [
  "kenya music new release",
  "kenyan artist 2025",
  "nairobi music video",
  "gengetone 2025",
  "afrobeats kenya",
  "bongo flava 2025",
  "khaligraph jones",
  "sauti sol",
  "nyashinski",
  "bien",
  "nviiri",
  "bensoul",
  "otile brown",
  "tanasha donna",
  "vera sidika",
  "akothee",
  "bahati kenya",
  "king kaka",
  "mejja",
  "timmy tdat",
  "wakadinali",
  "rekles",
  "arrow bwoy",
  "nadia mukami",
  "fena gitu",
  "victoria kimani",
  "kenya music chart",
  "spotify kenya top",
  "audiomack africa trending",
  "boomplay kenya",
];

// ── Breaking entertainment RSS — polls every 2 minutes ───────────────────────
export const BREAKING_ENTERTAINMENT_FEEDS = [
  // Kenya — fastest sources
  { url: "https://www.mpasho.co.ke/feed/",                                name: "Mpasho",           cat: "CELEBRITY",     priority: 1 },
  { url: "https://www.ghafla.com/ke/feed/",                               name: "Ghafla Kenya",     cat: "CELEBRITY",     priority: 1 },
  { url: "https://www.tuko.co.ke/rss/celebrities.xml",                    name: "Tuko Celebrities", cat: "CELEBRITY",     priority: 1 },
  { url: "https://www.pulselive.co.ke/rss/entertainment",                 name: "Pulse Live",       cat: "ENTERTAINMENT", priority: 1 },
  { url: "https://www.sde.co.ke/feed/",                                   name: "SDE Kenya",        cat: "CELEBRITY",     priority: 1 },
  // International — fastest celebrity/entertainment
  { url: "https://www.tmz.com/rss.xml",                                   name: "TMZ",              cat: "CELEBRITY",     priority: 2 },
  { url: "https://pagesix.com/feed/",                                     name: "Page Six",         cat: "CELEBRITY",     priority: 2 },
  { url: "https://www.etonline.com/news/rss",                             name: "ET Online",        cat: "CELEBRITY",     priority: 2 },
  // Sports — fastest
  { url: "https://www.goal.com/feeds/en/news",                            name: "Goal",             cat: "SPORTS",        priority: 1 },
  { url: "https://www.skysports.com/rss/12040",                           name: "Sky Sports",       cat: "SPORTS",        priority: 1 },
  { url: "https://www.standardmedia.co.ke/rss/sports",                    name: "Standard Sports",  cat: "SPORTS",        priority: 1 },
];

// ── Repurpose formats for a story ────────────────────────────────────────────
export function getRepurposeFormats(category: string, hasVideo: boolean): string[] {
  const formats = ["story"]; // always do a story
  if (hasVideo) formats.push("reel");
  if (["CELEBRITY", "MUSIC", "SPORTS"].includes(category?.toUpperCase())) {
    formats.push("carousel"); // celebrity/music/sports get carousel treatment
  }
  return formats;
}

// ── Peak posting times (EAT) by category ─────────────────────────────────────
export const PEAK_TIMES: Record<string, number[]> = {
  CELEBRITY:     [7, 8, 12, 13, 17, 18, 20, 21],
  MUSIC:         [8, 9, 12, 17, 18, 20, 21, 22],
  SPORTS:        [7, 8, 12, 17, 18, 19, 20, 21],
  ENTERTAINMENT: [8, 9, 12, 13, 17, 18, 20, 21],
  "TV & FILM":   [18, 19, 20, 21, 22],
  COMEDY:        [12, 13, 17, 18, 20, 21],
  DEFAULT:       [8, 12, 17, 20],
};

export function isOptimalPostingTime(category: string): boolean {
  const hourEAT = (new Date().getUTCHours() + 3) % 24;
  const peaks = PEAK_TIMES[category?.toUpperCase()] || PEAK_TIMES.DEFAULT;
  // Allow 1 hour window around each peak
  return peaks.some(peak => Math.abs(hourEAT - peak) <= 1);
}
