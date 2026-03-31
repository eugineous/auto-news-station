/**
 * x-poster.ts
 * Posts to X (Twitter) using agent-twitter-client — no API credits needed.
 * Uses cookie-based auth via username/password login, caches session in memory.
 */

// Dynamic import to avoid SSR issues with the CJS module
let scraperInstance: any = null;
let scraperReady = false;
let scraperInitializing = false;

async function getScraper(): Promise<any> {
  if (scraperReady && scraperInstance) return scraperInstance;
  if (scraperInitializing) {
    // Wait for ongoing init
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (scraperReady && scraperInstance) return scraperInstance;
    }
    throw new Error("X scraper init timed out");
  }

  const username = process.env.X_USERNAME;
  const password = process.env.X_PASSWORD;
  const email    = process.env.X_EMAIL;

  if (!username || !password) {
    throw new Error("X_USERNAME and X_PASSWORD env vars are required");
  }

  scraperInitializing = true;
  try {
    const { Scraper } = await import("agent-twitter-client");
    const s = new Scraper();

    // Try cookie restore first (faster, avoids login rate limits)
    const cookieStr = process.env.X_COOKIES;
    if (cookieStr) {
      try {
        const cookies = JSON.parse(cookieStr);
        await s.setCookies(cookies);
        const loggedIn = await s.isLoggedIn();
        if (loggedIn) {
          scraperInstance = s;
          scraperReady = true;
          console.log("[x-poster] Restored session from X_COOKIES");
          return s;
        }
      } catch {
        console.warn("[x-poster] Cookie restore failed, falling back to login");
      }
    }

    // Fresh login
    await s.login(username, password, email);
    scraperInstance = s;
    scraperReady = true;
    console.log("[x-poster] Logged in to X as @" + username);
    return s;
  } catch (err: any) {
    scraperInitializing = false;
    scraperReady = false;
    scraperInstance = null;
    throw new Error("X login failed: " + err.message);
  } finally {
    scraperInitializing = false;
  }
}

export interface XPostResult {
  success: boolean;
  tweetId?: string;
  tweetUrl?: string;
  error?: string;
}

/**
 * Post a text tweet (with optional image buffer).
 * Falls back gracefully — never throws, always returns a result object.
 */
export async function postToX(
  text: string,
  imageBuffer?: Buffer
): Promise<XPostResult> {
  try {
    const s = await getScraper();

    let result: any;
    if (imageBuffer) {
      const mediaData = [{ data: imageBuffer, mediaType: "image/jpeg" as const }];
      result = await s.sendTweet(text, undefined, mediaData);
    } else {
      result = await s.sendTweet(text);
    }

    // Extract tweet ID from response
    const tweetId =
      result?.data?.create_tweet?.tweet_results?.result?.rest_id ||
      result?.rest_id ||
      result?.id_str ||
      result?.id;

    if (!tweetId) {
      // sendTweet succeeded but no ID returned — still treat as success
      console.warn("[x-poster] Tweet posted but no ID returned:", JSON.stringify(result));
      return { success: true };
    }

    const username = process.env.X_USERNAME || "ppptv";
    return {
      success: true,
      tweetId,
      tweetUrl: `https://x.com/${username}/status/${tweetId}`,
    };
  } catch (err: any) {
    // Reset scraper on auth errors so next call re-logs in
    if (
      err.message?.includes("auth") ||
      err.message?.includes("login") ||
      err.message?.includes("401") ||
      err.message?.includes("403")
    ) {
      scraperInstance = null;
      scraperReady = false;
    }
    console.error("[x-poster] Error:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Build a tweet from an article — headline + link, trimmed to 280 chars.
 */
export function buildTweetText(
  headline: string,
  url: string,
  category?: string,
  hashtags?: string
): string {
  const tag = hashtags || defaultHashtags(category);
  // Reserve space: URL (23 chars t.co) + newlines + hashtags
  const reserved = 23 + 2 + (tag ? tag.length + 1 : 0);
  const maxHeadline = 280 - reserved;
  const trimmed = headline.length > maxHeadline
    ? headline.slice(0, maxHeadline - 1) + "…"
    : headline;

  return tag
    ? `${trimmed}\n\n${url}\n\n${tag}`
    : `${trimmed}\n\n${url}`;
}

function defaultHashtags(category?: string): string {
  const map: Record<string, string> = {
    CELEBRITY:    "#Celebrity #Entertainment #PPPTVKenya",
    MUSIC:        "#Music #KenyaMusic #PPPTVKenya",
    "TV & FILM":  "#TVAndFilm #Entertainment #PPPTVKenya",
    SPORTS:       "#Sports #Football #PPPTVKenya",
    POLITICS:     "#KenyaPolitics #Politics #PPPTVKenya",
    BUSINESS:     "#Business #Economy #PPPTVKenya",
    TECHNOLOGY:   "#Tech #Technology #PPPTVKenya",
    "EAST AFRICA":"#EastAfrica #Kenya #PPPTVKenya",
    FASHION:      "#Fashion #Style #PPPTVKenya",
    COMEDY:       "#Comedy #Entertainment #PPPTVKenya",
    INFLUENCERS:  "#Influencers #SocialMedia #PPPTVKenya",
  };
  return map[category?.toUpperCase() || ""] || "#Kenya #PPPTVKenya #Trending";
}
