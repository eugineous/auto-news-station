/**
 * PPP TV Auto Poster — Cloudflare Worker (STANDALONE)
 * Does everything: fetch articles → AI caption → thumbnail → post to IG + FB
 * No Vercel dependency for the cron pipeline.
 * Cron: every 10 minutes
 */

const TTL_SECONDS = 30 * 24 * 60 * 60;
const FEED_URL = "https://ppp-tv-worker.euginemicah.workers.dev/feed?limit=50";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const PUB_BASE = "https://pub-8244b5f99b024cda91b74e1131378a14.r2.dev";

// Category colors for thumbnail
const CAT_COLORS = {
  MUSIC:         { bg: "#9B30FF", text: "#FFFFFF" },
  CELEBRITY:     { bg: "#FF007A", text: "#FFFFFF" },
  FASHION:       { bg: "#FF007A", text: "#FFFFFF" },
  "TV & FILM":   { bg: "#3B82F6", text: "#FFFFFF" },
  MOVIES:        { bg: "#3B82F6", text: "#FFFFFF" },
  SPORTS:        { bg: "#00BFFF", text: "#000000" },
  BUSINESS:      { bg: "#FFD700", text: "#000000" },
  AWARDS:        { bg: "#FFD700", text: "#000000" },
  EVENTS:        { bg: "#22C55E", text: "#FFFFFF" },
  ENTERTAINMENT: { bg: "#9B30FF", text: "#FFFFFF" },
  "EAST AFRICA": { bg: "#F97316", text: "#FFFFFF" },
  GENERAL:       { bg: "#E50914", text: "#FFFFFF" },
  NEWS:          { bg: "#E50914", text: "#FFFFFF" },
};

function getCatColor(cat) {
  return CAT_COLORS[cat?.toUpperCase()] ?? { bg: "#E50914", text: "#FFFFFF" };
}

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === "0 3 * * *") {
      ctx.waitUntil(cleanupOldLogs(env));
  } else {
    ctx.waitUntil(triggerAutomateWithLock(env));
    ctx.waitUntil(cleanupOldVideos(env)); // keep R2 lean
  }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const auth = request.headers.get("authorization");
    const authed = auth === `Bearer ${env.WORKER_SECRET}`;

    if (url.pathname === "/") return json({ status: "ok", service: "PPP TV Auto Poster", cron: "*/10 * * * *" });

    // Trigger (protected)
    if (url.pathname === "/trigger") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      triggerAutomateWithLock(env).catch(e => console.error("[trigger]", e.message));
      return json({ status: "triggered" });
    }

    // Debug trigger — runs synchronously and returns result (protected)
    if (url.pathname === "/trigger-debug") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const result = await runPipelineDebug(env);
        return json(result);
      } catch (err) {
        return json({ error: err.message, stack: err.stack }, 500);
      }
    }

    // Health
    if (url.pathname === "/health") {
      const lock = await env.SEEN_ARTICLES.get("pipeline:lock");
      const lockAge = lock ? (Date.now() - Number(lock)) / 1000 : null;
      return json({ status: "ok", lockHeld: !!lock, lockAgeSeconds: lockAge, feedUrl: FEED_URL });
    }

    // ── /seen/check ──────────────────────────────────────────────────────────
    if (url.pathname === "/seen/check" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { ids = [], titles = [] } = await request.json();
        const seen = [];
        await Promise.all(ids.map(async (id, i) => {
          if (await env.SEEN_ARTICLES.get(`seen:${id}`)) { seen.push(id); return; }
          if (titles[i]) {
            const fp = titles[i].toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
            if (await env.SEEN_ARTICLES.get(`title:${fp}`)) seen.push(id);
          }
        }));
        return json({ seen });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /seen ────────────────────────────────────────────────────────────────
    if (url.pathname === "/seen" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { ids = [] } = await request.json();
        await Promise.all(ids.map(id => env.SEEN_ARTICLES.put(`seen:${id}`, "1", { expirationTtl: TTL_SECONDS })));
        return json({ ok: true, marked: ids.length });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /daily-count ─────────────────────────────────────────────────────────
    if (url.pathname === "/daily-count") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
      if (request.method === "GET") {
        const val = await env.SEEN_ARTICLES.get(`daily:${date}`);
        return json({ count: val ? parseInt(val) : 0 });
      }
      if (request.method === "POST") {
        const key = `daily:${date}`;
        const current = await env.SEEN_ARTICLES.get(key);
        const next = (current ? parseInt(current) : 0) + 1;
        await env.SEEN_ARTICLES.put(key, String(next), { expirationTtl: 48 * 3600 });
        return json({ count: next });
      }
    }

    // ── /last-category ───────────────────────────────────────────────────────
    if (url.pathname === "/last-category") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      if (request.method === "GET") {
        const val = await env.SEEN_ARTICLES.get("last-category");
        return json({ category: val || "" });
      }
      if (request.method === "POST") {
        const { category } = await request.json();
        await env.SEEN_ARTICLES.put("last-category", category || "", { expirationTtl: 24 * 3600 });
        return json({ ok: true });
      }
    }

    // ── /x-trends ────────────────────────────────────────────────────────────
    if (url.pathname === "/x-trends") {
      return json({ trends: [
        { title: "#Kenya" }, { title: "#Nairobi" }, { title: "#KenyaPolitics" },
        { title: "#Ruto" }, { title: "#NairobiLife" }, { title: "#EastAfrica" },
        { title: "#KenyaNews" }, { title: "#AfricaNews" },
      ], source: "static" });
    }

    // ── /post-log GET ─────────────────────────────────────────────────────────
    if (url.pathname === "/post-log" && request.method === "GET") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const limit = parseInt(url.searchParams.get("limit") || "50");
        const list = await env.SEEN_ARTICLES.list({ prefix: "log:" });
        const entries = await Promise.all(
          list.keys.slice(-limit).map(async k => {
            const v = await env.SEEN_ARTICLES.get(k.name);
            try { return JSON.parse(v); } catch { return null; }
          })
        );
        return json({ log: entries.filter(Boolean) });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /post-log POST ────────────────────────────────────────────────────────
    if (url.pathname === "/post-log" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const entry = await request.json();
        const key = `log:${Date.now()}:${entry.articleId || "unknown"}`;
        await env.SEEN_ARTICLES.put(key, JSON.stringify(entry), { expirationTtl: TTL_SECONDS });
        return json({ ok: true });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /clear-cache ──────────────────────────────────────────────────────────
    if (url.pathname === "/clear-cache" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      const list = await env.SEEN_ARTICLES.list({ prefix: "seen:" });
      await Promise.all(list.keys.map(k => env.SEEN_ARTICLES.delete(k.name)));
      return json({ cleared: list.keys.length });
    }

    // ── /lock/acquire ─────────────────────────────────────────────────────────
    if (url.pathname === "/lock/acquire" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { key, ttl = 270 } = await request.json();
        const existing = await env.SEEN_ARTICLES.get(key);
        if (existing) return json({ acquired: false });
        await env.SEEN_ARTICLES.put(key, String(Date.now()), { expirationTtl: ttl });
        return json({ acquired: true });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /lock/release ─────────────────────────────────────────────────────────
    if (url.pathname === "/lock/release" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { key } = await request.json();
        await env.SEEN_ARTICLES.delete(key);
        return json({ ok: true });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /stage-video ──────────────────────────────────────────────────────────
    // Downloads a video URL and stages it in R2, returns public URL
    if (url.pathname === "/stage-video" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { videoUrl } = await request.json();
        if (!videoUrl) return json({ error: "videoUrl required" }, 400);

        const res = await fetch(videoUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/1.0)" },
          signal: AbortSignal.timeout(120000),
        });
        if (!res.ok) return json({ error: `Video fetch failed: ${res.status}` }, 500);

        const buf = await res.arrayBuffer();
        const contentType = res.headers.get("content-type") || "video/mp4";
        const r2Key = `videos/${Date.now()}-staged.mp4`;
        await env.VIDEOS.put(r2Key, buf, {
          httpMetadata: { contentType },
          customMetadata: { uploadedAt: String(Date.now()) },
        });
        const publicUrl = `https://pub-8244b5f99b024cda91b74e1131378a14.r2.dev/${r2Key}`;
        return json({ success: true, url: publicUrl, key: r2Key });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /stage-video-upload ──────────────────────────────────────────────────
    // Accepts base64 MP4 that is already processed/watermarked
    if (url.pathname === "/stage-video-upload" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { base64, contentType = "video/mp4" } = await request.json();
        if (!base64) return json({ error: "base64 required" }, 400);
        const buf = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const r2Key = `videos/${Date.now()}-upload.mp4`;
        await env.VIDEOS.put(r2Key, buf, {
          httpMetadata: { contentType },
          customMetadata: { uploadedAt: String(Date.now()) },
        });
        const publicUrl = `https://pub-8244b5f99b024cda91b74e1131378a14.r2.dev/${r2Key}`;
        return json({ success: true, url: publicUrl, key: r2Key });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /delete-video ─────────────────────────────────────────────────────────
    if (url.pathname === "/delete-video" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { key } = await request.json();
        if (key) await env.VIDEOS.delete(key);
        return json({ ok: true });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /stage-image ──────────────────────────────────────────────────────────
    // Accepts base64 image, stores in R2, returns public URL
    if (url.pathname === "/stage-image" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { imageBuffer } = await request.json();
        if (!imageBuffer) return json({ error: "imageBuffer required" }, 400);
        const buf = Uint8Array.from(atob(imageBuffer), c => c.charCodeAt(0));
        const r2Key = `staged/${Date.now()}-story.jpg`;
        await env.VIDEOS.put(r2Key, buf, { httpMetadata: { contentType: "image/jpeg" } });
        return json({ success: true, url: `https://pub-8244b5f99b024cda91b74e1131378a14.r2.dev/${r2Key}` });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /post-story ───────────────────────────────────────────────────────────
    // Posts an image as an Instagram Story (shown to ALL followers, bypasses algorithm)
    if (url.pathname === "/post-story" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { imageUrl, caption } = await request.json();
        const token = env.INSTAGRAM_ACCESS_TOKEN;
        const accountId = env.INSTAGRAM_ACCOUNT_ID;
        if (!token || !accountId) return json({ error: "Missing IG credentials" }, 400);

        // Create story container
        const createRes = await fetch(`https://graph.facebook.com/v19.0/${accountId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: imageUrl,
            media_type: "STORIES",
            access_token: token,
          }),
          signal: AbortSignal.timeout(30000),
        });
        const createData = await createRes.json();
        if (!createRes.ok || createData.error) return json({ error: createData.error?.message || "Story container failed" }, 500);

        await sleep(3000);

        // Publish story
        const publishRes = await fetch(`https://graph.facebook.com/v19.0/${accountId}/media_publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creation_id: createData.id, access_token: token }),
          signal: AbortSignal.timeout(30000),
        });
        const publishData = await publishRes.json();
        if (!publishRes.ok || publishData.error) return json({ error: publishData.error?.message || "Story publish failed" }, 500);

        return json({ success: true, storyId: publishData.id });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /pipeline/status ─────────────────────────────────────────────────────
    if (url.pathname === "/pipeline/status") {
      const paused = await env.SEEN_ARTICLES.get("pipeline:paused");
      const rateLimited = await env.SEEN_ARTICLES.get("ratelimit:pause:meta");
      return json({ paused: !!paused, rateLimited: !!rateLimited });
    }

    // ── /agent/status GET ─────────────────────────────────────────────────────
    if (url.pathname === "/agent/status" && request.method === "GET") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const [enabled, abVariant, igRate, fbRate, lastRun, totalPosts] = await Promise.all([
          env.SEEN_ARTICLES.get("agent:enabled"),
          env.SEEN_ARTICLES.get("agent:ab_variant"),
          env.SEEN_ARTICLES.get("agent:ig_success_rate"),
          env.SEEN_ARTICLES.get("agent:fb_success_rate"),
          env.SEEN_ARTICLES.get("agent:last_run"),
          env.SEEN_ARTICLES.get("agent:total_posts"),
        ]);
        return json({
          enabled: enabled !== "0",
          abVariant: abVariant || "A",
          igSuccessRate: igRate ? parseFloat(igRate) : null,
          fbSuccessRate: fbRate ? parseFloat(fbRate) : null,
          lastRun: lastRun || null,
          totalPosts: totalPosts ? parseInt(totalPosts) : 0,
        });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /agent/toggle POST ────────────────────────────────────────────────────
    if (url.pathname === "/agent/toggle" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { enabled } = await request.json();
        await env.SEEN_ARTICLES.put("agent:enabled", enabled ? "1" : "0", { expirationTtl: 365 * 24 * 3600 });
        return json({ ok: true, enabled });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /agent/log GET ────────────────────────────────────────────────────────
    if (url.pathname === "/agent/log" && request.method === "GET") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const list = await env.SEEN_ARTICLES.list({ prefix: "agent:log:" });
        const entries = await Promise.all(
          list.keys.slice(-50).map(async k => {
            const v = await env.SEEN_ARTICLES.get(k.name);
            try { return JSON.parse(v); } catch { return null; }
          })
        );
        return json({ log: entries.filter(Boolean).reverse() });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /resolve-youtube ──────────────────────────────────────────────────────
    // Resolves a YouTube video ID to a direct MP4 URL using YouTube's internal API
    if (url.pathname === "/resolve-youtube" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { videoId } = await request.json();
        if (!videoId) return json({ error: "videoId required" }, 400);

        // Use YouTube's embedded player client — bypasses bot detection
        const playerRes = await fetch("https://www.youtube.com/youtubei/v1/player", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3325.181 Mobile Safari/537.36",
            "X-YouTube-Client-Name": "56",
            "X-YouTube-Client-Version": "20230101",
            "Origin": "https://www.youtube.com",
            "Referer": `https://www.youtube.com/watch?v=${videoId}`,
          },
          body: JSON.stringify({
            videoId,
            context: {
              client: {
                clientName: "ANDROID_EMBEDDED_PLAYER",
                clientVersion: "17.31.35",
                androidSdkVersion: 30,
                hl: "en",
                gl: "US",
              },
              thirdParty: {
                embedUrl: "https://www.youtube.com",
              }
            }
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!playerRes.ok) return json({ error: `YouTube API ${playerRes.status}` }, 500);
        const data = await playerRes.json();

        // Debug: return what we got
        const streamingKeys = Object.keys(data?.streamingData || {});
        const formatCount = (data?.streamingData?.formats || []).length;
        const adaptiveCount = (data?.streamingData?.adaptiveFormats || []).length;
        const playabilityStatus = data?.playabilityStatus?.status;

        if (playabilityStatus !== "OK") {
          return json({ error: `Video not playable: ${playabilityStatus}`, reason: data?.playabilityStatus?.reason }, 403);
        }

        const formats = data?.streamingData?.formats || [];
        const adaptiveFormats = data?.streamingData?.adaptiveFormats || [];

        // Prefer combined formats (video+audio), then adaptive video with audio
        const combined = formats.filter(f => f.mimeType?.includes("video/mp4"));
        const adaptive = adaptiveFormats.filter(f =>
          f.mimeType?.includes("video/mp4") && f.audioQuality
        );
        const allMp4 = [...combined, ...adaptive].sort((a, b) =>
          (b.bitrate || 0) - (a.bitrate || 0)
        );

        if (!allMp4.length) {
          const anyFormat = [...formats, ...adaptiveFormats].find(f => f.url);
          if (anyFormat) {
            return json({ success: true, url: anyFormat.url, quality: anyFormat.qualityLabel || "unknown", mimeType: anyFormat.mimeType });
          }
          return json({ error: "No MP4 streams found", formatCount, adaptiveCount, streamingKeys }, 404);
        }

        const best = allMp4[0];
        return json({
          success: true,
          url: best.url,
          quality: best.qualityLabel,
          mimeType: best.mimeType,
        });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /pipeline/pause ───────────────────────────────────────────────────────
    if (url.pathname === "/pipeline/pause" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      await env.SEEN_ARTICLES.put("pipeline:paused", "1", { expirationTtl: 24 * 3600 });
      return json({ ok: true, status: "paused" });
    }

    // ── /pipeline/resume ──────────────────────────────────────────────────────
    if (url.pathname === "/pipeline/resume" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      await env.SEEN_ARTICLES.delete("pipeline:paused");
      return json({ ok: true, status: "running" });
    }

    // ── /schedule POST ────────────────────────────────────────────────────────
    if (url.pathname === "/schedule" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const body = await request.json();
        const { url: postUrl, headline, caption, category, scheduledAt, id } = body;
        if (!postUrl || !scheduledAt || !id) return json({ error: "url, scheduledAt, id required" }, 400);
        const ts = new Date(scheduledAt).getTime();
        const key = `schedule:${ts}:${id}`;
        await env.SEEN_ARTICLES.put(key, JSON.stringify({ url: postUrl, headline, caption, category, scheduledAt, id }), { expirationTtl: 7 * 24 * 3600 });
        return json({ ok: true, id, key });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /schedule GET ─────────────────────────────────────────────────────────
    if (url.pathname === "/schedule" && request.method === "GET") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const list = await env.SEEN_ARTICLES.list({ prefix: "schedule:" });
        const items = await Promise.all(list.keys.map(async k => {
          const v = await env.SEEN_ARTICLES.get(k.name);
          try { return { key: k.name, ...JSON.parse(v) }; } catch { return null; }
        }));
        return json({ scheduled: items.filter(Boolean) });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /schedule/:id DELETE ──────────────────────────────────────────────────
    if (url.pathname.startsWith("/schedule/") && request.method === "DELETE") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      const id = url.pathname.slice("/schedule/".length);
      const list = await env.SEEN_ARTICLES.list({ prefix: "schedule:" });
      const match = list.keys.find(k => k.name.endsWith(`:${id}`));
      if (match) await env.SEEN_ARTICLES.delete(match.name);
      return json({ ok: true });
    }

    // ── /blacklist GET ────────────────────────────────────────────────────────
    if (url.pathname === "/blacklist" && request.method === "GET") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const list = await env.SEEN_ARTICLES.list({ prefix: "blacklist:" });
        const items = await Promise.all(list.keys.map(async k => {
          const v = await env.SEEN_ARTICLES.get(k.name);
          const [, type, ...rest] = k.name.split(":");
          return { key: k.name, type, value: rest.join(":"), note: v };
        }));
        return json({ blacklist: items });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /blacklist POST ───────────────────────────────────────────────────────
    if (url.pathname === "/blacklist" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { type, value } = await request.json();
        if (!type || !value) return json({ error: "type and value required" }, 400);
        const key = `blacklist:${type}:${value.toLowerCase()}`;
        await env.SEEN_ARTICLES.put(key, "1", { expirationTtl: 365 * 24 * 3600 });
        return json({ ok: true, key });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /blacklist DELETE ─────────────────────────────────────────────────────
    if (url.pathname === "/blacklist" && request.method === "DELETE") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { key } = await request.json();
        if (key) await env.SEEN_ARTICLES.delete(key);
        return json({ ok: true });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /tikwm-account ────────────────────────────────────────────────────────
    // Proxies TikTok account video fetch through CF IPs (Vercel IPs are blocked by TikWM)
    if (url.pathname === "/tikwm-account" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { username, count = 10 } = await request.json();
        if (!username) return json({ error: "username required" }, 400);
        const body = new URLSearchParams({ unique_id: username, count: String(count), cursor: "0" });
        const r = await fetch("https://www.tikwm.com/api/user/posts", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/1.0)" },
          body: body.toString(),
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) return json({ videos: [] });
        const data = await r.json();
        if (data.code !== 0 || !data.data?.videos) return json({ videos: [] });
        return json({ videos: data.data.videos });
      } catch (err) { return json({ videos: [], error: err.message }); }
    }

    // ── /tikwm-search ─────────────────────────────────────────────────────────
    // Proxies TikTok keyword search through CF IPs
    if (url.pathname === "/tikwm-search" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { keyword, count = 20 } = await request.json();
        if (!keyword) return json({ error: "keyword required" }, 400);
        const body = new URLSearchParams({ keywords: keyword, count: String(count), cursor: "0", HD: "1" });
        const r = await fetch("https://www.tikwm.com/api/feed/search", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/1.0)" },
          body: body.toString(),
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) return json({ videos: [] });
        const data = await r.json();
        return json({ videos: data.data?.videos || [] });
      } catch (err) { return json({ videos: [], error: err.message }); }
    }

    // ── /resolve-cobalt ───────────────────────────────────────────────────────
    // Resolves a video URL to a direct MP4 using Cobalt v10 API
    if (url.pathname === "/resolve-cobalt" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { videoUrl } = await request.json();
        if (!videoUrl) return json({ error: "videoUrl required" }, 400);

        // Cobalt v10 public instances — try each until one works
        const COBALT_INSTANCES = [
          "https://api.cobalt.tools",
          "https://cobalt.ggtyler.dev",
          "https://cobalt.api.timelessnesses.me",
          "https://cobaltapi.orangelabeler.com",
        ];

        for (const instance of COBALT_INSTANCES) {
          try {
            const r = await fetch(`${instance}/`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Accept": "application/json" },
              body: JSON.stringify({ url: videoUrl, videoQuality: "720", downloadMode: "auto", filenameStyle: "basic" }),
              signal: AbortSignal.timeout(15000),
            });
            if (!r.ok) continue;
            const data = await r.json();
            if (data.status === "tunnel" || data.status === "redirect" || data.status === "stream") {
              return json({ success: true, url: data.url });
            }
            if (data.status === "picker" && data.picker?.[0]?.url) {
              return json({ success: true, url: data.picker[0].url });
            }
          } catch { continue; }
        }
        return json({ error: "All Cobalt instances failed" }, 502);
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /r2-health ────────────────────────────────────────────────────────────
    if (url.pathname === "/r2-health") {      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const testKey = `health-check-${Date.now()}`;
        await env.VIDEOS.put(testKey, "ok", { expirationTtl: 60 });
        const val = await env.VIDEOS.get(testKey);
        await env.VIDEOS.delete(testKey);
        return json({ ok: val === "ok" });
      } catch (err) { return json({ ok: false, error: err.message }); }
    }

    // ── /img proxy ────────────────────────────────────────────────────────────
    if (url.pathname === "/img") {
      const imgUrl = url.searchParams.get("url");
      if (!imgUrl) return new Response("url param required", { status: 400 });
      try {
        const r = await fetch(imgUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/1.0)" },
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) return new Response("Image fetch failed", { status: 502 });
        const ct = r.headers.get("content-type") || "image/jpeg";
        return new Response(r.body, { headers: { "Content-Type": ct, "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } });
      } catch (err) { return new Response(err.message, { status: 502 }); }
    }

    return new Response("Not found", { status: 404 });
  },
};

// ── Distributed lock — prevents concurrent cron runs from double-posting ─────
const LOCK_KEY = "pipeline:lock";
const LOCK_TTL = 270; // 4.5 minutes — safely under the 10-min cron interval

async function triggerAutomateWithLock(env) {
  const existing = await env.SEEN_ARTICLES.get(LOCK_KEY);
  if (existing) {
    const ageMs = Date.now() - Number(existing);
    if (ageMs < LOCK_TTL * 1000) {
      console.log("[lock] Another run is in progress — skipping this cron tick");
      return;
    }
    console.log("[lock] Stale lock detected, releasing");
    await env.SEEN_ARTICLES.delete(LOCK_KEY);
  }
  await env.SEEN_ARTICLES.put(LOCK_KEY, String(Date.now()), { expirationTtl: LOCK_TTL });
  try {
    await triggerAutomate(env);
  } finally {
    await env.SEEN_ARTICLES.delete(LOCK_KEY).catch(() => {});
  }
}

// ── Trigger Next.js automate endpoint (Vercel handles the full pipeline) ──────
async function triggerAutomate(env) {
  // ── Agent ON/OFF check ────────────────────────────────────────────────────
  const agentEnabled = await env.SEEN_ARTICLES.get("agent:enabled");
  if (agentEnabled === "0") {
    console.log("[agent] Agent is disabled — skipping run");
    return;
  }

  const appUrl = env.VERCEL_APP_URL || "https://auto-news-station.vercel.app";
  const secret = env.AUTOMATE_SECRET;
  if (!secret) { console.warn("[auto-ppp-tv] AUTOMATE_SECRET not set"); return; }

  // ── Smart throttle — shadowban prevention ─────────────────────────────────
  // Instagram hard limit: 50 posts/24h. We target max 25/day (safe zone).
  // Cron fires every 5 min = 288 ticks/day. We skip most ticks randomly.
  // Target: ~25 posts/day = fire roughly every 58 min on average.
  // Strategy: check posts today, enforce max 25, add random jitter.
  const today = new Date().toISOString().slice(0, 10);
  const todayCountRaw = await env.SEEN_ARTICLES.get(`daily:${today}`);
  const todayCount = todayCountRaw ? parseInt(todayCountRaw) : 0;

  // Hard cap: never exceed 25 posts/day (well under IG's 50 limit)
  const MAX_DAILY = 25;
  if (todayCount >= MAX_DAILY) {
    console.log(`[throttle] Daily cap reached (${todayCount}/${MAX_DAILY}) — skipping`);
    return;
  }

  // Time-based throttle: enforce minimum gap between posts
  // As day fills up, increase minimum gap to spread posts evenly
  const lastPostTime = await env.SEEN_ARTICLES.get("last:post:time");
  if (lastPostTime) {
    const msSinceLast = Date.now() - parseInt(lastPostTime);
    // Minimum gap scales with how many posts we've made today
    // Early in day: 15 min min gap. Later: 30 min min gap.
    const minGapMs = todayCount < 10
      ? 15 * 60 * 1000   // first 10 posts: min 15 min gap
      : 30 * 60 * 1000;  // after 10 posts: min 30 min gap

    if (msSinceLast < minGapMs) {
      console.log(`[throttle] Too soon since last post (${Math.round(msSinceLast/60000)}m ago, min ${Math.round(minGapMs/60000)}m) — skipping`);
      return;
    }
  }

  // Random skip: even when gap is met, randomly skip ~40% of eligible ticks
  // This creates natural-looking irregular posting patterns
  const hourEAT = (new Date().getUTCHours() + 3) % 24;
  // Dead zone: 1am-5am EAT — skip entirely
  if (hourEAT >= 1 && hourEAT < 5) {
    console.log(`[throttle] Dead zone (${hourEAT}:00 EAT) — skipping`);
    return;
  }
  // Peak hours (7am-10pm EAT): 95% chance to post when eligible
  // Off-peak: 60% chance — still post regularly outside peak
  const isPeak = hourEAT >= 7 && hourEAT <= 22;
  const postChance = isPeak ? 0.95 : 0.60;
  if (Math.random() > postChance) {
    console.log(`[throttle] Random skip (${isPeak ? "peak" : "off-peak"} hour ${hourEAT}:00 EAT)`);
    return;
  }

  // Record this post attempt time
  await env.SEEN_ARTICLES.put("last:post:time", String(Date.now()), { expirationTtl: 24 * 3600 });

  // ── A/B testing: rotate caption variant every 10 runs ────────────────────
  const runCount = parseInt(await env.SEEN_ARTICLES.get("run-count") || "0");
  const abVariant = runCount % 20 < 10 ? "A" : "B"; // A=breaking style, B=casual style
  await env.SEEN_ARTICLES.put("agent:ab_variant", abVariant, { expirationTtl: 24 * 3600 });
  await env.SEEN_ARTICLES.put("agent:last_run", new Date().toISOString(), { expirationTtl: 7 * 24 * 3600 });

  try {
    // No jitter needed — throttle logic above handles timing
    const nextCount = runCount + 1;
    await env.SEEN_ARTICLES.put("run-count", String(nextCount), { expirationTtl: 24 * 3600 });

    const fireVideo = true;

    // Image pipeline
    const imagePromise = fetch(`${appUrl}/api/automate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", "X-AB-Variant": abVariant },
      body: "{}",
      signal: AbortSignal.timeout(280000),
    }).then(r => r.json()).then(async d => {
      console.log(`[burst] image: posted=${d.posted} errors=${d.errors?.length || 0}`);
      // Track performance for A/B learning
      if (d.posted > 0) {
        const total = parseInt(await env.SEEN_ARTICLES.get("agent:total_posts") || "0") + 1;
        await env.SEEN_ARTICLES.put("agent:total_posts", String(total), { expirationTtl: 365 * 24 * 3600 });
        // Log agent activity
        const logKey = `agent:log:${Date.now()}`;
        await env.SEEN_ARTICLES.put(logKey, JSON.stringify({
          ts: new Date().toISOString(), type: "image", posted: d.posted,
          abVariant, errors: d.errors?.length || 0,
        }), { expirationTtl: 7 * 24 * 3600 });
      }
    }).catch(e => console.error("[burst] image failed:", e.message));

    // Video pipeline
    const videoPromise = fireVideo
      ? fetch(`${appUrl}/api/automate-video`, {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", "X-AB-Variant": abVariant },
          body: "{}",
          signal: AbortSignal.timeout(280000),
        }).then(r => r.json()).then(async d => {
          console.log(`[burst] video: posted=${d.posted}`);
          if (d.posted > 0) {
            const logKey = `agent:log:${Date.now() + 1}`;
            await env.SEEN_ARTICLES.put(logKey, JSON.stringify({
              ts: new Date().toISOString(), type: "video", posted: d.posted,
              abVariant, source: d.video?.source,
            }), { expirationTtl: 7 * 24 * 3600 });
          }
        }).catch(e => console.error("[burst] video failed:", e.message))
      : Promise.resolve();

    // Carousel pipeline (every 3rd run) — scrapes IG carousels, replaces first image with branded thumb
    const carouselPromise = nextCount % 3 === 0
      ? fetch(`${appUrl}/api/automate-carousel`, {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: "{}",
          signal: AbortSignal.timeout(280000),
        }).then(r => r.json()).then(async d => {
          console.log(`[burst] carousel: posted=${d.posted} source=${d.source}`);
          if (d.posted > 0) {
            const logKey = `agent:log:${Date.now() + 2}`;
            await env.SEEN_ARTICLES.put(logKey, JSON.stringify({
              ts: new Date().toISOString(), type: "carousel", posted: d.posted,
              abVariant, source: d.source,
            }), { expirationTtl: 7 * 24 * 3600 });
          }
        }).catch(e => console.error("[burst] carousel failed:", e.message))
      : Promise.resolve();

    await Promise.all([imagePromise, videoPromise, carouselPromise]);
  } catch (err) {
    console.error("[auto-ppp-tv] trigger failed:", err.message);
  }
}
async function runPipeline(env) {
  console.log("[PPP TV] Pipeline started");

  // 1. Fetch articles from PPP TV worker feed
  let articles = [];
  try {
    const res = await fetch(FEED_URL, { headers: { "User-Agent": "PPPTVAutoPoster/5.0" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Feed ${res.status}`);
    const data = await res.json();
    const rawArticles = Array.isArray(data) ? data : (data.articles || []);
    articles = rawArticles.filter(a => a.title && (a.articleUrl || a.sourceUrl || a.slug));
    console.log(`[PPP TV] Fetched ${articles.length} articles`);
  } catch (err) {
    console.error("[PPP TV] Feed failed:", err.message);
    return;
  }

  if (articles.length === 0) { console.log("[PPP TV] No articles"); return; }

  // 2. Filter unseen
  const unseen = [];
  for (const a of articles) {
    const id = await sha256Short(a.articleUrl || a.sourceUrl || a.slug || a.title);
    const seen = await env.SEEN_ARTICLES.get(`seen:${id}`);
    if (!seen) unseen.push({ ...a, _id: id });
  }
  console.log(`[PPP TV] ${unseen.length} unseen articles`);
  if (unseen.length === 0) { console.log("[PPP TV] All seen. Done."); return; }

  // 3. Pick best article (newest first, already sorted by feed)
  const article = unseen[0];
  const id = article._id;

  // Mark seen immediately to prevent duplicate runs
  await env.SEEN_ARTICLES.put(`seen:${id}`, "1", { expirationTtl: TTL_SECONDS });
  console.log(`[PPP TV] Posting: ${article.title}`);

  // 4. Generate AI caption
  const caption = await generateCaption(article, env);
  console.log(`[PPP TV] Caption: ${caption.slice(0, 80)}...`);

  // 5. Get image URL — fetch and stage in R2 so IG can access it
  const rawImageUrl = article.imageUrlDirect || article.imageUrl || "";
  if (!rawImageUrl) {
    console.warn("[PPP TV] No image URL — skipping");
    const logKey = `log:${Date.now()}:${id}`;
    await env.SEEN_ARTICLES.put(logKey, JSON.stringify({
      articleId: id, title: article.title,
      url: article.articleUrl || article.sourceUrl,
      category: (article.category || "GENERAL").toUpperCase(),
      instagram: { success: false, error: "No image URL" },
      facebook: { success: false, error: "No image URL" },
      postedAt: new Date().toISOString(), isBreaking: false,
    }), { expirationTtl: TTL_SECONDS });
    return;
  }

  // Stage image in R2 so Instagram/Facebook can fetch it (they block many CDNs)
  let imageUrl = rawImageUrl;
  try {
    const imgRes = await fetch(rawImageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (imgRes.ok) {
      const imgBuf = await imgRes.arrayBuffer();
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const r2Key = `staged/${Date.now()}-${id}.jpg`;
      await env.VIDEOS.put(r2Key, imgBuf, {
        httpMetadata: { contentType },
        customMetadata: { uploadedAt: String(Date.now()) },
      });
      imageUrl = `${PUB_BASE}/${r2Key}`;
      console.log(`[PPP TV] Image staged: ${imageUrl}`);
    }
  } catch (err) {
    console.warn("[PPP TV] Image staging failed, using original URL:", err.message);
  }

  // 6. Post to Instagram
  const igResult = await postToInstagram(imageUrl, caption, env, (article.category || "GENERAL").toUpperCase());
  console.log(`[PPP TV] IG: ${igResult.success ? "✓ " + igResult.postId : "✗ " + igResult.error}`);

  // 7. Post to Facebook
  const fbResult = await postToFacebook(imageUrl, caption, article.articleUrl || article.sourceUrl, env);
  console.log(`[PPP TV] FB: ${fbResult.success ? "✓ " + fbResult.postId : "✗ " + fbResult.error}`);

  // 8. Log the post — always log, even on failure
  const logKey = `log:${Date.now()}:${id}`;
  await env.SEEN_ARTICLES.put(logKey, JSON.stringify({
    articleId: id,
    title: article.title,
    url: article.articleUrl || article.sourceUrl,
    category: (article.category || "GENERAL").toUpperCase(),
    instagram: igResult,
    facebook: fbResult,
    postedAt: new Date().toISOString(),
    isBreaking: false,
  }), { expirationTtl: TTL_SECONDS });
  console.log(`[PPP TV] Logged: IG=${igResult.success} FB=${fbResult.success}`);

  console.log("[PPP TV] Pipeline done");
}

// ── AI CAPTION ────────────────────────────────────────────────────────────────
const HOOK_PATTERNS = [
  "Lead with the most newsworthy verifiable fact — a specific number, name, or outcome.",
  "Lead with the consequence or outcome first, then explain the cause.",
  "Lead with a direct quote from a key person in the story if available.",
  "Lead with the most specific detail — an exact time, place, or figure.",
  "Lead with what changed — what is different today because of this story.",
];

// Engagement CTAs — journalist style, no clickbait (Meta penalizes clickbait CTAs)
const ENGAGEMENT_CTAS_WORKER = [
  "What are your thoughts on this?",
  "Share this with someone following this story.",
  "Tag someone who should know about this.",
  "Do you agree with this decision?",
  "What do you think happens next?",
  "Let us know your take in the comments.",
  "Pass this on to someone who needs to see it.",
  "Save this for later.",
];

const CAPTION_SYSTEM_PROMPT = `You are the senior news writer at PPP TV Kenya — a verified Kenyan entertainment and news media brand.

Write captions like a professional journalist. Factual, specific, no clickbait. Meta penalizes clickbait and rewards news-style writing.

STRUCTURE (3 parts, blank line between each):

1. LEDE — One sentence: WHO did WHAT, WHERE, WHEN. Lead with the most newsworthy fact. No emojis. No ALL CAPS.

2. BODY — 2-4 sentences of verified detail. Names, exact figures, locations, dates, direct quotes. AP/Reuters style — tight and factual.

3. CLOSE — What happens next, or the reader's stake in the story. End with source credit.

RULES:
- ONLY use facts explicitly stated in the article provided. NEVER invent, assume, or infer any fact not directly in the article text. If a detail is not in the article, do not include it.
- NEVER use: "shocking", "you won't believe", "breaking", "must see", "find out more", "stay tuned", "the internet is buzzing"
- NEVER withhold facts to create artificial curiosity — Meta penalizes this
- No ALL CAPS in body
- No hashtags
- Emojis are allowed — use 2-4 relevant emojis to make the post feel human and engaging
- Always end with: "Source: [publication name]"
- Under 200 words`;

async function generateCaption(article, env) {
  const content = (article.excerpt || article.content || "").slice(0, 1500);
  const hookPattern = HOOK_PATTERNS[Math.floor(Math.random() * HOOK_PATTERNS.length)];
  const engagementCTA = ENGAGEMENT_CTAS_WORKER[Math.floor(Math.random() * ENGAGEMENT_CTAS_WORKER.length)];
  const sourceCredit = article.sourceName ? `\n\nSource: ${article.sourceName}` : "";

  const prompt = `${CAPTION_SYSTEM_PROMPT}

---
TITLE: ${article.title}
CATEGORY: ${article.category || "GENERAL"}
SOURCE: ${article.sourceName || "PPP TV Kenya"}
${content ? `ARTICLE:\n${content}` : ""}

LEDE APPROACH: ${hookPattern}
END WITH THIS CTA: ${engagementCTA}
ALWAYS END WITH: "Source: ${article.sourceName || "PPP TV Kenya"}"

CRITICAL: Only use facts explicitly stated in the ARTICLE text above. Do NOT invent, assume, or add any names, dates, statistics, titles, or events that are not directly in the article. If a detail is not in the article, leave it out.

Write the caption following the instructions above. Factual, no clickbait, journalist style.
Reply with ONLY the caption text — no labels, no preamble.`;

  // Try Gemini first
  if (env.GEMINI_API_KEY) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.8, maxOutputTokens: 800 } }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const d = await res.json();
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text && text.length > 40) return text;
      }
    } catch (err) { console.warn("[gemini]", err.message); }
  }

  // Try NVIDIA fallback
  if (env.NVIDIA_API_KEY) {
    try {
      const res = await fetch(NVIDIA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.NVIDIA_API_KEY}` },
        body: JSON.stringify({ model: "meta/llama-3.1-8b-instruct", messages: [{ role: "user", content: prompt }], temperature: 0.7, max_tokens: 400 }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const d = await res.json();
        const text = d.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 40) return text;
      }
    } catch (err) { console.warn("[nvidia]", err.message); }
  }

  // Fallback: use excerpt
  return (article.excerpt || article.title) + sourceCredit + "\n\n" + engagementCTA;
}

// ── INSTAGRAM POSTING ─────────────────────────────────────────────────────────
const HASHTAG_BANK_WORKER = {
  MUSIC:         "#KenyaMusic #AfrobeatKenya #NairobiMusic #KenyanArtist #EastAfricaMusic #PPPTVKenya #MusicKE",
  CELEBRITY:     "#KenyaCelebrity #NairobiCelebs #KenyanCelebs #PPPTVKenya #NairobiGossip #KenyaEntertainment",
  ENTERTAINMENT: "#KenyaEntertainment #NairobiEntertainment #PPPTVKenya #KenyaNews #EntertainmentKE",
  "TV & FILM":   "#KenyaTV #NairobiFilm #KenyanFilm #PPPTVKenya #AfricanFilm #KenyaMovies",
  MOVIES:        "#KenyaMovies #NairobiCinema #AfricanFilm #PPPTVKenya #MovieNews",
  SPORTS:        "#KenyaSports #HarambeeStars #KenyaAthletics #PPPTVKenya #SportKE",
  POLITICS:      "#KenyaPolitics #KenyaNews #NairobiPolitics #PPPTVKenya",
  BUSINESS:      "#KenyaBusiness #NairobiBusiness #KenyaEconomy #PPPTVKenya",
  NEWS:          "#KenyaNews #NairobiNews #PPPTVKenya #KenyaToday",
  GENERAL:       "#Kenya #Nairobi #PPPTVKenya #KenyaNews #NairobiLife #EastAfrica",
};

function getHashtagsForCategory(category) {
  return HASHTAG_BANK_WORKER[(category || "GENERAL").toUpperCase()] || HASHTAG_BANK_WORKER.GENERAL;
}

async function postFirstCommentIG(mediaId, comment, token) {
  try {
    await fetch(`https://graph.facebook.com/v19.0/${mediaId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: comment, access_token: token }),
      signal: AbortSignal.timeout(10000),
    });
  } catch { /* non-fatal */ }
}

async function postToInstagram(imageUrl, caption, env, category) {
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = env.INSTAGRAM_ACCOUNT_ID;
  if (!token || !accountId) return { success: false, error: "Missing IG credentials" };

  try {
    // Step 1: Create media container
    const createRes = await fetch(`https://graph.facebook.com/v19.0/${accountId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
      signal: AbortSignal.timeout(30000),
    });
    const createData = await createRes.json();
    if (!createRes.ok || createData.error) throw new Error(createData.error?.message || `Create failed: ${createRes.status}`);

    const containerId = createData.id;
    if (!containerId) throw new Error("No container ID returned");

    // Wait for container to be ready
    await sleep(3000);

    // Step 2: Publish
    const publishRes = await fetch(`https://graph.facebook.com/v19.0/${accountId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: containerId, access_token: token }),
      signal: AbortSignal.timeout(30000),
    });
    const publishData = await publishRes.json();
    if (!publishRes.ok || publishData.error) throw new Error(publishData.error?.message || `Publish failed: ${publishRes.status}`);

    // Post hashtags as first comment (keeps caption clean, boosts discoverability)
    if (publishData.id) {
      await sleep(2000);
      await postFirstCommentIG(publishData.id, getHashtagsForCategory(category), token);
    }

    return { success: true, postId: publishData.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── FACEBOOK POSTING ──────────────────────────────────────────────────────────
async function postToFacebook(imageUrl, caption, articleUrl, env) {
  const token = env.FACEBOOK_ACCESS_TOKEN;
  const pageId = env.FACEBOOK_PAGE_ID;
  if (!token || !pageId) return { success: false, error: "Missing FB credentials" };

  try {
    const message = caption + (articleUrl ? `\n\nRead more: ${articleUrl}` : "");
    const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: imageUrl, message, access_token: token }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || `FB post failed: ${res.status}`);
    return { success: true, postId: data.post_id || data.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── CLEANUP OLD LOGS ──────────────────────────────────────────────────────────
async function cleanupOldLogs(env) {
  const list = await env.SEEN_ARTICLES.list({ prefix: "log:" });
  const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
  let deleted = 0;
  for (const key of list.keys) {
    const ts = parseInt(key.name.split(":")[1] || "0");
    if (ts && ts < cutoff) { await env.SEEN_ARTICLES.delete(key.name); deleted++; }
  }
  console.log(`[cleanup] Deleted ${deleted} old log entries`);
}

// ── CLEANUP OLD VIDEOS IN R2 (12h TTL) ────────────────────────────────────────
async function cleanupOldVideos(env) {
  const cutoff = Date.now() - (12 * 60 * 60 * 1000);
  let cursor = undefined;
  let deleted = 0;
  do {
    const page = await env.VIDEOS.list({ cursor, prefix: "" });
    cursor = page.cursor;
    for (const obj of page.objects || []) {
      const ts = obj.uploaded ? new Date(obj.uploaded).getTime() : 0;
      if (ts && ts < cutoff) {
        await env.VIDEOS.delete(obj.key);
        deleted++;
      }
    }
  } while (cursor);
  if (deleted) console.log(`[cleanup] Deleted ${deleted} old videos (>12h)`);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
async function sha256Short(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// ── DEBUG PIPELINE (synchronous, returns result) ─────────────────────────────
async function runPipelineDebug(env) {
  const log = [];
  const step = (msg) => { log.push(msg); console.log("[DEBUG]", msg); };

  step("Fetching feed...");
  const res = await fetch(FEED_URL, { headers: { "User-Agent": "PPPTVAutoPoster/5.0" }, signal: AbortSignal.timeout(15000) });
  step(`Feed response: ${res.status} ${res.statusText}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    step(`Feed error body: ${body.slice(0, 200)}`);
    return { error: `Feed ${res.status}`, log };
  }
  const data = await res.json();
  const rawArticles = Array.isArray(data) ? data : (data.articles || []);
  const articles = rawArticles.filter(a => a.title && (a.articleUrl || a.sourceUrl || a.slug));
  step(`Feed returned ${articles.length} articles`);
  if (articles.length === 0) return { error: "No articles", log };

  const unseen = [];
  for (const a of articles) {
    const id = await sha256Short(a.articleUrl || a.sourceUrl);
    const seen = await env.SEEN_ARTICLES.get(`seen:${id}`);
    if (!seen) unseen.push({ ...a, _id: id });
  }
  step(`${unseen.length} unseen out of ${articles.length}`);
  if (unseen.length === 0) return { error: "All seen", log };

  const article = unseen[0];
  step(`Selected: ${article.title}`);
  step(`Image URL: ${article.imageUrlDirect || article.imageUrl || "NONE"}`);

  const caption = await generateCaption(article, env);
  step(`Caption (${caption.length} chars): ${caption.slice(0, 100)}`);

  const rawImageUrl = article.imageUrlDirect || article.imageUrl || "";
  if (!rawImageUrl) return { error: "No image URL", log };

  // Stage image
  let imageUrl = rawImageUrl;
  try {
    const imgRes = await fetch(rawImageUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
    step(`Image fetch: ${imgRes.status} ${imgRes.headers.get("content-type")}`);
    if (imgRes.ok) {
      const imgBuf = await imgRes.arrayBuffer();
      const r2Key = `staged/${Date.now()}-debug.jpg`;
      await env.VIDEOS.put(r2Key, imgBuf, { httpMetadata: { contentType: "image/jpeg" } });
      imageUrl = `https://pub-8244b5f99b024cda91b74e1131378a14.r2.dev/${r2Key}`;
      step(`Staged to R2: ${imageUrl}`);
    }
  } catch (err) { step(`Image staging error: ${err.message}`); }

  const igResult = await postToInstagram(imageUrl, caption, env, (article.category || "GENERAL").toUpperCase());
  step(`IG result: ${JSON.stringify(igResult)}`);

  const fbResult = await postToFacebook(imageUrl, caption, article.articleUrl || article.sourceUrl, env);
  step(`FB result: ${JSON.stringify(fbResult)}`);

  return { log, igResult, fbResult, article: { title: article.title, imageUrl, category: article.category } };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
