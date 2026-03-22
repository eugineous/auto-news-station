
// Scrapes any URL and extracts: title, description, image/thumbnail, video URL
// Handles: articles, YouTube, TikTok, Twitter/X, Instagram

export interface ScrapedContent {
  type: "article" | "youtube" | "tiktok" | "twitter" | "instagram" | "unknown";
  title: string;
  description: string;
  imageUrl: string;
  videoUrl?: string;          // direct video URL if available
  videoThumbnailUrl?: string; // thumbnail for video posts
  sourceUrl: string;
  sourceName: string;
  embedId?: string;           // YouTube video ID, tweet ID, etc.
}

function extractMeta(html: string, property: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function extractTitle(html: string): string {
  const og = extractMeta(html, "og:title") || extractMeta(html, "twitter:title");
  if (og) return og;
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1]?.trim() || "";
}

function extractDescription(html: string): string {
  return (
    extractMeta(html, "og:description") ||
    extractMeta(html, "twitter:description") ||
    extractMeta(html, "description") ||
    ""
  );
}

function extractImage(html: string): string {
  return (
    extractMeta(html, "og:image") ||
    extractMeta(html, "twitter:image") ||
    extractMeta(html, "twitter:image:src") ||
    ""
  );
}

// Detect URL type
function detectType(url: string): ScrapedContent["type"] {
  if (/youtube\.com\/watch|youtu\.be\//.test(url)) return "youtube";
  if (/tiktok\.com/.test(url)) return "tiktok";
  if (/twitter\.com|x\.com/.test(url)) return "twitter";
  if (/instagram\.com/.test(url)) return "instagram";
  return "article";
}

// Extract YouTube video ID
function getYouTubeId(url: string): string {
  const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] || "";
}

// Extract tweet ID
function getTweetId(url: string): string {
  const m = url.match(/status\/(\d+)/);
  return m?.[1] || "";
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("Fetch failed: " + res.status);
  return res.text();
}

export async function scrapeUrl(inputUrl: string): Promise<ScrapedContent> {
  const type = detectType(inputUrl);

  // ── YouTube ──────────────────────────────────────────────────────────────
  if (type === "youtube") {
    const videoId = getYouTubeId(inputUrl);
    if (!videoId) throw new Error("Could not extract YouTube video ID");

    // Use YouTube oEmbed API — no auth needed
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(10000) }
    );
    const oembed = oembedRes.ok ? await oembedRes.json() as any : null;

    const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const title = oembed?.title || "YouTube Video";
    const author = oembed?.author_name || "YouTube";

    return {
      type: "youtube",
      title,
      description: `Watch: ${title} — ${author}`,
      imageUrl: thumbnail,
      videoThumbnailUrl: thumbnail,
      sourceUrl: inputUrl,
      sourceName: author,
      embedId: videoId,
    };
  }

  // ── Twitter/X ─────────────────────────────────────────────────────────────
  if (type === "twitter") {
    const tweetId = getTweetId(inputUrl);
    // Use Twitter oEmbed — no auth needed
    try {
      const oembedRes = await fetch(
        `https://publish.twitter.com/oembed?url=${encodeURIComponent(inputUrl)}&omit_script=true`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (oembedRes.ok) {
        const oembed = await oembedRes.json() as any;
        // Extract text from HTML
        const text = (oembed.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const author = oembed.author_name || "Twitter";
        // Try to get image from the tweet page
        let imageUrl = "";
        try {
          const html = await fetchHtml(inputUrl);
          imageUrl = extractImage(html);
        } catch { /* no image */ }

        return {
          type: "twitter",
          title: `${author} on X: ${text.slice(0, 100)}`,
          description: text.slice(0, 500),
          imageUrl,
          sourceUrl: inputUrl,
          sourceName: author,
          embedId: tweetId,
        };
      }
    } catch { /* fall through to generic scrape */ }

    // Fallback: scrape the page
    const html = await fetchHtml(inputUrl);
    return {
      type: "twitter",
      title: extractTitle(html),
      description: extractDescription(html),
      imageUrl: extractImage(html),
      sourceUrl: inputUrl,
      sourceName: "X / Twitter",
      embedId: tweetId,
    };
  }

  // ── TikTok ────────────────────────────────────────────────────────────────
  if (type === "tiktok") {
    try {
      const oembedRes = await fetch(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(inputUrl)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (oembedRes.ok) {
        const oembed = await oembedRes.json() as any;
        return {
          type: "tiktok",
          title: oembed.title || "TikTok Video",
          description: oembed.title || "",
          imageUrl: oembed.thumbnail_url || "",
          videoThumbnailUrl: oembed.thumbnail_url || "",
          sourceUrl: inputUrl,
          sourceName: oembed.author_name || "TikTok",
        };
      }
    } catch { /* fall through */ }

    const html = await fetchHtml(inputUrl);
    return {
      type: "tiktok",
      title: extractTitle(html),
      description: extractDescription(html),
      imageUrl: extractImage(html),
      sourceUrl: inputUrl,
      sourceName: "TikTok",
    };
  }

  // ── Instagram ──────────────────────────────────────────────────────────────
  if (type === "instagram") {
    // Instagram blocks server-side scraping — extract post ID and use oEmbed
    const postId = inputUrl.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1] || 
                   inputUrl.match(/\/reel\/([A-Za-z0-9_-]+)/)?.[1] || "";
    try {
      // Try Instagram oEmbed (works without auth for public posts)
      const oembedRes = await fetch(
        `https://graph.facebook.com/v19.0/instagram_oembed?url=${encodeURIComponent(inputUrl)}&access_token=${process.env.INSTAGRAM_ACCESS_TOKEN || ""}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (oembedRes.ok) {
        const oembed = await oembedRes.json() as any;
        return {
          type: "instagram",
          title: oembed.title || `Instagram post by ${oembed.author_name || "user"}`,
          description: oembed.title || "Instagram post",
          imageUrl: oembed.thumbnail_url || "",
          videoThumbnailUrl: oembed.thumbnail_url || "",
          sourceUrl: inputUrl,
          sourceName: oembed.author_name || "Instagram",
          embedId: postId,
        };
      }
    } catch { /* fall through */ }
    // Fallback: return a usable stub so the post can still be created
    return {
      type: "instagram",
      title: `Instagram Post${postId ? " (" + postId + ")" : ""}`,
      description: "Instagram post — content loaded from the original post.",
      imageUrl: "",
      sourceUrl: inputUrl,
      sourceName: "Instagram",
      embedId: postId,
    };
  }

    // ── Article / generic URL ─────────────────────────────────────────────────
  const html = await fetchHtml(inputUrl);
  const hostname = new URL(inputUrl).hostname.replace("www.", "");

  return {
    type: "article",
    title: extractTitle(html),
    description: extractDescription(html),
    imageUrl: extractImage(html),
    sourceUrl: inputUrl,
    sourceName: hostname,
  };
}
