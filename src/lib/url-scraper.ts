// Scrapes any URL and extracts: title, description, image/thumbnail, video URL
// Handles: articles, YouTube, TikTok, Twitter/X, Instagram

export interface ScrapedContent {
  type: "article" | "youtube" | "tiktok" | "twitter" | "instagram" | "unknown";
  title: string;
  description: string;
  bodyText: string;           // extracted article body text for AI context
  imageUrl: string;
  videoUrl?: string;          // public video URL for Graph API posting
  videoEmbedUrl?: string;     // iframe embed URL for preview player
  videoThumbnailUrl?: string;
  sourceUrl: string;
  sourceName: string;
  embedId?: string;
  isVideo: boolean;
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
  return extractMeta(html, "og:description") || extractMeta(html, "twitter:description") || extractMeta(html, "description") || "";
}

function extractImage(html: string): string {
  return extractMeta(html, "og:image") || extractMeta(html, "twitter:image") || extractMeta(html, "twitter:image:src") || "";
}

function extractBodyText(html: string): string {
  const selectors = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]+class="[^"]*(?:article-body|post-content|entry-content|story-body|article-text|content-body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ];

  let raw = "";
  for (const re of selectors) {
    const m = html.match(re);
    if (m?.[1] && m[1].length > 200) { raw = m[1]; break; }
  }

  if (!raw) {
    const paragraphs = html.match(/<p[^>]*>([^<]{40,})<\/p>/gi) || [];
    raw = paragraphs.join(" ");
  }

  if (!raw) return "";

  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();

  return text.slice(0, 2000);
}

function detectType(url: string): ScrapedContent["type"] {
  if (/youtube\.com\/watch|youtu\.be\//.test(url)) return "youtube";
  if (/tiktok\.com/.test(url)) return "tiktok";
  if (/twitter\.com|x\.com/.test(url)) return "twitter";
  if (/instagram\.com/.test(url)) return "instagram";
  return "article";
}

function getYouTubeId(url: string): string {
  const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] || "";
}

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

  // -- YouTube ------------------------------------------------------------------
  if (type === "youtube") {
    const videoId = getYouTubeId(inputUrl);
    if (!videoId) throw new Error("Could not extract YouTube video ID");

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
      bodyText: "",
      imageUrl: thumbnail,
      videoThumbnailUrl: thumbnail,
      videoEmbedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`,
      videoUrl: undefined, // resolved later in route via ytdl-core
      sourceUrl: inputUrl,
      sourceName: author,
      embedId: videoId,
      isVideo: true,
    };
  }

  // -- TikTok -------------------------------------------------------------------
  if (type === "tiktok") {
    try {
      const oembedRes = await fetch(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(inputUrl)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (oembedRes.ok) {
        const oembed = await oembedRes.json() as any;
        const videoIdMatch = inputUrl.match(/video\/(\d+)/);
        const videoId = videoIdMatch?.[1] || "";
        return {
          type: "tiktok",
          title: oembed.title || "TikTok Video",
          description: oembed.title || "",
          bodyText: "",
          imageUrl: oembed.thumbnail_url || "",
          videoThumbnailUrl: oembed.thumbnail_url || "",
          videoEmbedUrl: videoId ? `https://www.tiktok.com/embed/v2/${videoId}` : undefined,
          videoUrl: inputUrl, // pass original URL — Graph API can fetch TikTok directly
          sourceUrl: inputUrl,
          sourceName: oembed.author_name || "TikTok",
          isVideo: true,
        };
      }
    } catch { /* fall through */ }

    const html = await fetchHtml(inputUrl);
    return {
      type: "tiktok",
      title: extractTitle(html),
      description: extractDescription(html),
      bodyText: "",
      imageUrl: extractImage(html),
      videoUrl: inputUrl,
      sourceUrl: inputUrl,
      sourceName: "TikTok",
      isVideo: true,
    };
  }

  // -- Twitter/X ----------------------------------------------------------------
  if (type === "twitter") {
    const tweetId = getTweetId(inputUrl);
    try {
      const oembedRes = await fetch(
        `https://publish.twitter.com/oembed?url=${encodeURIComponent(inputUrl)}&omit_script=true`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (oembedRes.ok) {
        const oembed = await oembedRes.json() as any;
        const text = (oembed.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const author = oembed.author_name || "Twitter";
        let imageUrl = "";
        try { const html = await fetchHtml(inputUrl); imageUrl = extractImage(html); } catch {}
        return {
          type: "twitter",
          title: `${author}: ${text.slice(0, 100)}`,
          description: text.slice(0, 500),
          bodyText: text,
          imageUrl,
          videoUrl: inputUrl, // pass original URL
          videoEmbedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${tweetId}`,
          sourceUrl: inputUrl,
          sourceName: author,
          embedId: tweetId,
          isVideo: true,
        };
      }
    } catch {}
    const html = await fetchHtml(inputUrl);
    return {
      type: "twitter",
      title: extractTitle(html),
      description: extractDescription(html),
      bodyText: "",
      imageUrl: extractImage(html),
      videoUrl: inputUrl,
      sourceUrl: inputUrl,
      sourceName: "X / Twitter",
      embedId: tweetId,
      isVideo: true,
    };
  }

  // -- Instagram ----------------------------------------------------------------
  if (type === "instagram") {
    const postId = inputUrl.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1] ||
                   inputUrl.match(/\/reel\/([A-Za-z0-9_-]+)/)?.[1] || "";
    try {
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
          bodyText: "",
          imageUrl: oembed.thumbnail_url || "",
          videoThumbnailUrl: oembed.thumbnail_url || "",
          videoEmbedUrl: postId ? `https://www.instagram.com/p/${postId}/embed/` : undefined,
          videoUrl: inputUrl,
          sourceUrl: inputUrl,
          sourceName: oembed.author_name || "Instagram",
          embedId: postId,
          isVideo: true,
        };
      }
    } catch {}
    return {
      type: "instagram",
      title: "",
      description: "",
      bodyText: "",
      imageUrl: "",
      videoUrl: inputUrl,
      sourceUrl: inputUrl,
      sourceName: "Instagram",
      embedId: postId,
      isVideo: true,
    };
  }

  // -- Article / generic --------------------------------------------------------
  const html = await fetchHtml(inputUrl);
  const hostname = new URL(inputUrl).hostname.replace("www.", "");
  const isDirectVideo = /\.(mp4|mov|webm|avi)(\?|$)/i.test(inputUrl);
  return {
    type: "article",
    title: extractTitle(html),
    description: extractDescription(html),
    bodyText: extractBodyText(html),
    imageUrl: extractImage(html),
    videoUrl: isDirectVideo ? inputUrl : undefined,
    sourceUrl: inputUrl,
    sourceName: hostname,
    isVideo: isDirectVideo,
  };
}
