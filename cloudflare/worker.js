/**
 * PPP TV Auto Poster — Cloudflare Worker
 * Cron 1 (*/15): post one article
 * Cron 2 (0 3 * * *): delete R2 videos older than 24h
 */

const RSS_URL = "https://ppptv-v2.vercel.app/api/rss";
const TTL_SECONDS = 30 * 24 * 60 * 60;
const R2_PUBLIC_BASE = "https://pub-8244b5f99b024cda91b74e1131378a14.r2.dev";
const VIDEO_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export default {
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    if (cron === "0 3 * * *") {
      ctx.waitUntil(cleanupVideos(env));
    } else {
      ctx.waitUntil(runPipeline(env));
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Auth check for all non-public endpoints
    const auth = request.headers.get("authorization");
    const authed = auth === `Bearer ${env.AUTOMATE_SECRET}`;

    if (url.pathname === "/") {
      return json({ status: "ok", service: "PPP TV Auto Poster" });
    }

    if (url.pathname === "/trigger") {
      ctx.waitUntil(runPipeline(env));
      return json({ status: "triggered" });
    }

    // ── /stage-video ─────────────────────────────────────────────────────────
    // Downloads a video from a source URL and stores it in R2
    // Returns a public R2 URL valid for 24h
    if (url.pathname === "/stage-video" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });

      let body;
      try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

      const { videoUrl } = body;
      if (!videoUrl) return new Response("videoUrl required", { status: 400 });

      try {
        // Download the video
        const videoRes = await fetch(videoUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/1.0)" },
          signal: AbortSignal.timeout(120000),
        });
        if (!videoRes.ok) throw new Error(`Download failed: HTTP ${videoRes.status}`);

        const contentType = videoRes.headers.get("content-type") || "video/mp4";
        const videoBuffer = await videoRes.arrayBuffer();

        // Store in R2 with timestamp prefix for cleanup
        const timestamp = Date.now();
        const key = `videos/${timestamp}-${crypto.randomUUID()}.mp4`;

        await env.VIDEOS.put(key, videoBuffer, {
          httpMetadata: { contentType },
          customMetadata: { uploadedAt: String(timestamp) },
        });

        const publicUrl = `${R2_PUBLIC_BASE}/${key}`;
        return json({ success: true, url: publicUrl, key, expiresAt: new Date(timestamp + VIDEO_MAX_AGE_MS).toISOString() });
      } catch (err) {
        return json({ success: false, error: err.message }, 500);
      }
    }

    // ── /delete-video ─────────────────────────────────────────────────────────
    if (url.pathname === "/delete-video" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      let body;
      try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
      const { key } = body;
      if (!key) return new Response("key required", { status: 400 });
      await env.VIDEOS.delete(key);
      return json({ success: true });
    }

    // ── /cleanup-videos ───────────────────────────────────────────────────────
    if (url.pathname === "/cleanup-videos" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      const deleted = await cleanupVideos(env);
      return json({ deleted });
    }

    // ── /post-log ─────────────────────────────────────────────────────────────
    if (url.pathname === "/post-log" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const entry = await request.json();
        const key = `log:${Date.now()}:${entry.articleId || "unknown"}`;
        await env.SEEN_ARTICLES.put(key, JSON.stringify(entry), { expirationTtl: TTL_SECONDS });
        return json({ ok: true });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ── /clear-cache ──────────────────────────────────────────────────────────
    if (url.pathname === "/clear-cache" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      const list = await env.SEEN_ARTICLES.list({ prefix: "seen:" });
      await Promise.all(list.keys.map((k) => env.SEEN_ARTICLES.delete(k.name)));
      return json({ cleared: list.keys.length });
    }

    return new Response("Not found", { status: 404 });
  },
};

// ── Cleanup: delete R2 videos older than 24h ──────────────────────────────────
async function cleanupVideos(env) {
  let deleted = 0;
  const cutoff = Date.now() - VIDEO_MAX_AGE_MS;
  let cursor;

  do {
    const list = await env.VIDEOS.list({ prefix: "videos/", cursor, limit: 100 });
    for (const obj of list.objects) {
      const uploadedAt = parseInt(obj.customMetadata?.uploadedAt || "0");
      if (uploadedAt && uploadedAt < cutoff) {
        await env.VIDEOS.delete(obj.key);
        deleted++;
      }
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);

  console.log(`[cleanup] Deleted ${deleted} expired videos`);
  return deleted;
}

// ── Auto-poster pipeline ──────────────────────────────────────────────────────
async function runPipeline(env) {
  console.log("[PPP TV] Pipeline started");
  let article;
  try {
    article = await fetchLatestFromRSS();
    if (!article) { console.log("[PPP TV] No article found"); return; }
    console.log(`[PPP TV] Latest: ${article.title}`);
  } catch (err) {
    console.error("[PPP TV] RSS fetch failed:", err.message);
    return;
  }

  const seen = await env.SEEN_ARTICLES.get(`seen:${article.id}`);
  if (seen) { console.log("[PPP TV] Already posted. Done."); return; }

  try {
    const res = await fetch(`${env.VERCEL_APP_URL}/api/automate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.AUTOMATE_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ article }),
    });
    if (!res.ok) { console.warn(`[PPP TV] Post failed: HTTP ${res.status}`); return; }
    const data = await res.json();
    if (data.posted > 0) {
      await env.SEEN_ARTICLES.put(`seen:${article.id}`, "1", { expirationTtl: TTL_SECONDS });
      console.log(`[PPP TV] Posted: ${article.title}`);
    } else {
      console.warn("[PPP TV] Post returned 0:", JSON.stringify(data));
    }
  } catch (err) {
    console.error("[PPP TV] Post error:", err.message);
  }
}

async function fetchLatestFromRSS() {
  const res = await fetch(RSS_URL, { headers: { "User-Agent": "PPPTVAutoPoster/2.0" } });
  if (!res.ok) throw new Error(`RSS ${res.status}`);
  const xml = await res.text();

  const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!itemMatch) return null;
  const block = itemMatch[1];

  const title = extractCdata(extractTag(block, "title"));
  const link = extractCdata(extractTag(block, "link")) || extractTag(block, "link");
  const description = extractCdata(extractTag(block, "description"));
  const category = extractCdata(extractTag(block, "category")) || "NEWS";
  const pubDate = extractTag(block, "pubDate");
  const imageUrl = extractAttr(block, "enclosure", "url") || extractAttr(block, "media:content", "url") || "";

  if (!title || !link) return null;

  let canonicalUrl = link;
  const slugMatch = link.match(/\/news\/([A-Za-z0-9+/=_-]+)$/);
  if (slugMatch) {
    try { canonicalUrl = atob(slugMatch[1]); } catch { canonicalUrl = link; }
  }

  const id = await sha256Short(canonicalUrl);
  return { id, title, url: canonicalUrl, imageUrl, summary: description.slice(0, 200), fullBody: description, sourceName: "PPP TV", category: category.toUpperCase(), publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString() };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}
function extractCdata(raw) {
  const m = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1].trim() : raw.replace(/<[^>]+>/g, "").trim();
}
function extractAttr(xml, tag, attr) {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i"));
  return m ? m[1] : "";
}
async function sha256Short(str) {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(str));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
