/**
 * Platform Optimizer
 * Transforms a generic content item into platform-specific posts with optimal
 * captions, hashtags, aspect ratios, and posting times per platform.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type Platform = "instagram" | "facebook" | "tiktok" | "youtube";
export type AspectRatio = "9:16" | "1:1" | "16:9" | "4:5";

export interface ContentItem {
  title: string;
  category: string;
  aiCaption?: string;
  sourceUrl?: string;
  isKenyan?: boolean;
}

export interface PlatformPost {
  platform: Platform;
  caption: string;
  hashtags: string[];
  firstComment?: string;  // Instagram only
  aspectRatio: AspectRatio;
  scheduledAt: Date;
  contentType: "reel" | "story" | "feed" | "short" | "video";
}

export interface PlatformConfig {
  maxCaptionLength: number;
  maxHashtags: number;
  optimalHashtags: number;
  peakHoursEAT: number[];
  preferredAspectRatio: AspectRatio;
  supportsFirstComment: boolean;
  reelMaxDurationSec: number;
  hashtagStyle: "caption" | "comment" | "mixed";
}

// ── Platform configs ──────────────────────────────────────────────────────────

export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  instagram: {
    maxCaptionLength:    2200,
    maxHashtags:         30,
    optimalHashtags:     8,
    peakHoursEAT:        [8, 12, 18, 20],
    preferredAspectRatio:"9:16",
    supportsFirstComment:true,
    reelMaxDurationSec:  90,
    hashtagStyle:        "comment",
  },
  facebook: {
    maxCaptionLength:    63206,
    maxHashtags:         10,
    optimalHashtags:     4,
    peakHoursEAT:        [9, 13, 19],
    preferredAspectRatio:"9:16",
    supportsFirstComment:false,
    reelMaxDurationSec:  60,
    hashtagStyle:        "caption",
  },
  tiktok: {
    maxCaptionLength:    2200,
    maxHashtags:         5,
    optimalHashtags:     4,
    peakHoursEAT:        [7, 12, 18, 21],
    preferredAspectRatio:"9:16",
    supportsFirstComment:false,
    reelMaxDurationSec:  60,
    hashtagStyle:        "caption",
  },
  youtube: {
    maxCaptionLength:    5000,
    maxHashtags:         15,
    optimalHashtags:     7,
    peakHoursEAT:        [8, 14, 18],
    preferredAspectRatio:"16:9",
    supportsFirstComment:false,
    reelMaxDurationSec:  60,
    hashtagStyle:        "caption",
  },
};

// ── Category hashtag map ──────────────────────────────────────────────────────

const CATEGORY_HASHTAGS: Record<string, string[]> = {
  COMEDY:        ["#KenyaComedy","#Funny","#PPPTVKenya","#NairobiHumor","#LOL","#Comedy","#Viral","#Kenya"],
  MUSIC:         ["#KenyaMusic","#NewMusic","#PPPTVKenya","#Afrobeats","#Banger","#Music","#Kenya","#Gengetone"],
  DANCE:         ["#KenyaDance","#DanceChallenge","#PPPTVKenya","#Dance","#Viral","#Kenya","#TikTokDance"],
  FASHION:       ["#KenyaFashion","#Style","#PPPTVKenya","#Drip","#OOTD","#Fashion","#Nairobi","#Streetwear"],
  SPORTS_BANTER: ["#Football","#SportsBanter","#PPPTVKenya","#PremierLeague","#KenyaSports","#Soccer"],
  POP_CULTURE:   ["#PopCulture","#Trending","#PPPTVKenya","#Kenya","#Entertainment","#Viral"],
  STREET_CONTENT:["#NairobiStreets","#StreetTalk","#PPPTVKenya","#Kenya","#Nairobi","#StreetVibes"],
  CELEBRITY:     ["#KenyaCelebs","#Celebrity","#PPPTVKenya","#Entertainment","#Tea","#Gossip","#Kenya"],
  MEMES:         ["#KenyaMemes","#Memes","#PPPTVKenya","#Funny","#Relatable","#Viral","#Kenya"],
  VIRAL_TRENDS:  ["#Trending","#Viral","#PPPTVKenya","#Kenya","#Trends","#FYP","#ForYou"],
  TV_FILM:       ["#KenyaTV","#Movies","#PPPTVKenya","#Entertainment","#Film","#Series","#Kenya"],
  INFLUENCERS:   ["#KenyaInfluencer","#Creator","#PPPTVKenya","#Content","#Influencer","#Kenya"],
  EAST_AFRICA:   ["#EastAfrica","#Africa","#PPPTVKenya","#EastAfricaVibes","#Uganda","#Tanzania","#Kenya"],
};

const DEFAULT_HASHTAGS = ["#PPPTVKenya","#Kenya","#Viral","#Entertainment","#Trending"];

// ── selectHashtags ────────────────────────────────────────────────────────────

/**
 * Returns a platform-appropriate hashtag list for the given category.
 * Count is capped at PLATFORM_CONFIGS[platform].optimalHashtags.
 */
export function selectHashtags(category: string, platform: Platform): string[] {
  const all = CATEGORY_HASHTAGS[category?.toUpperCase()] ?? DEFAULT_HASHTAGS;
  const limit = PLATFORM_CONFIGS[platform].optimalHashtags;
  return all.slice(0, limit);
}

// ── getBestPostingTime ────────────────────────────────────────────────────────

/**
 * Returns the next optimal posting time for a platform as a Date.
 * Finds the next peak EAT hour >= current EAT hour today;
 * if none remain today, returns the first peak hour tomorrow.
 */
export function getBestPostingTime(platform: Platform, _category?: string): Date {
  const config = PLATFORM_CONFIGS[platform];
  const nowUtc = new Date();
  const eatOffsetMs = 3 * 3_600_000;
  const nowEat = new Date(nowUtc.getTime() + eatOffsetMs);
  const currentHour = nowEat.getUTCHours();

  // Find next peak hour today
  const nextToday = config.peakHoursEAT.find(h => h >= currentHour);

  const scheduled = new Date(nowEat);
  scheduled.setUTCMinutes(0, 0, 0);

  if (nextToday !== undefined) {
    scheduled.setUTCHours(nextToday);
  } else {
    // First peak hour tomorrow
    scheduled.setUTCDate(scheduled.getUTCDate() + 1);
    scheduled.setUTCHours(config.peakHoursEAT[0]);
  }

  // Convert back to UTC
  return new Date(scheduled.getTime() - eatOffsetMs);
}

// ── getAspectRatio ────────────────────────────────────────────────────────────

/**
 * Returns the correct AspectRatio for a platform and content type.
 * YouTube long-form uses 16:9; everything else uses the platform's preferred ratio.
 */
export function getAspectRatio(platform: Platform, contentType?: string): AspectRatio {
  if (platform === "youtube" && contentType === "video") return "16:9";
  return PLATFORM_CONFIGS[platform].preferredAspectRatio;
}

// ── buildCaption ──────────────────────────────────────────────────────────────

/**
 * Builds a platform-specific caption for the given content item.
 *
 * - instagram: clean caption only (hashtags go in firstComment), truncated to 2200
 * - tiktok:    prepend "👀 " hook if not already engaging, append top 4 hashtags inline
 * - facebook:  append sourceUrl (if available) + top 4 hashtags inline
 * - youtube:   full description with follow CTA + hashtags, truncated to 5000
 */
export function buildCaption(content: ContentItem, platform: Platform): string {
  const base = content.aiCaption || content.title;
  const config = PLATFORM_CONFIGS[platform];

  if (platform === "instagram") {
    return base.slice(0, config.maxCaptionLength);
  }

  if (platform === "tiktok") {
    const HOOK_PATTERN = /^(pov:|watch|omg|🔥|👀|wait|this|when|how|why|what)/i;
    const hooked = HOOK_PATTERN.test(base.trimStart()) ? base : `👀 ${base}`;
    const tags = selectHashtags(content.category, "tiktok").slice(0, 4).join(" ");
    return `${hooked}\n\n${tags}`.slice(0, config.maxCaptionLength);
  }

  if (platform === "facebook") {
    const tags = selectHashtags(content.category, "facebook").slice(0, 4).join(" ");
    const urlPart = content.sourceUrl ? `\n\n${content.sourceUrl}` : "";
    return `${base}${urlPart}\n\n${tags}`.slice(0, config.maxCaptionLength);
  }

  // youtube
  const tags = selectHashtags(content.category, "youtube").join(" ");
  const description =
    `${base}\n\nFollow PPP TV Kenya for more entertainment!\n\n${tags}`;
  return description.slice(0, config.maxCaptionLength);
}

// ── optimize ──────────────────────────────────────────────────────────────────

/**
 * Runs all platform optimizations in parallel via Promise.all.
 * Returns one PlatformPost per platform in the input array.
 *
 * Instagram: hashtags placed in firstComment field, caption kept clean.
 */
export async function optimize(
  content: ContentItem,
  platforms: Platform[],
): Promise<PlatformPost[]> {
  return Promise.all(
    platforms.map(async (platform): Promise<PlatformPost> => {
      const caption     = buildCaption(content, platform);
      const hashtags    = selectHashtags(content.category, platform);
      const scheduledAt = getBestPostingTime(platform, content.category);
      const aspectRatio = getAspectRatio(platform);

      // Determine content type
      const contentType: PlatformPost["contentType"] =
        platform === "youtube"   ? "video"
        : platform === "tiktok"  ? "reel"
        : platform === "instagram" ? "reel"
        : "reel";

      const post: PlatformPost = {
        platform,
        caption,
        hashtags: platform === "instagram" ? [] : hashtags,
        aspectRatio,
        scheduledAt,
        contentType,
      };

      // Instagram: move hashtags to firstComment
      if (platform === "instagram") {
        post.firstComment = hashtags.join(" ");
      }

      return post;
    })
  );
}
