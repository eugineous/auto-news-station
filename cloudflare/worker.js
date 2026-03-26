/**
 * PPP TV Auto Poster — Cloudflare Worker
 * Cron: every 5 minutes — trigger Next.js /api/automate
 * Cron: daily at 3am — delete R2 videos older than 24h
 */

const TTL_SECONDS = 30 * 24 * 60 * 60;
const R2_PUBLIC_BASE = "https://pub-8244b5f99b024cda91b74e1131378a14.r2.dev";
const VIDEO_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === "0 3 * * *") {
      ctx.waitUntil(cleanupVideos(env));
    } else {
      ctx.waitUntil(triggerAutomate(env));
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const auth = request.headers.get("authorization");
    const authed = auth === `Bearer ${env.WORKER_SECRET}`;

    if (url.pathname === "/") return json({ status: "ok", service: "PPP TV Auto Poster" });

    if (url.pathname === "/trigger") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      // Fire and forget
      triggerAutomate(env).catch(console.error);
      return json({ status: "triggered" });
    }

    // ── /seen/check — check which article IDs have been posted ───────────────
    if (url.pathname === "/seen/check" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { ids = [], titles = [] } = await request.json();
        const seen = [];
        await Promise.all(ids.map(async (id, i) => {
          const byId = await env.SEEN_ARTICLES.get(`seen:${id}`);
          if (byId) { seen.push(id); return; }
          // Also check by title fingerprint
          if (titles[i]) {
            const fp = titles[i].toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
            const byTitle = await env.SEEN_ARTICLES.get(`title:${fp}`);
            if (byTitle) seen.push(id);
          }
        }));
        return json({ seen });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /seen — mark articles as seen ────────────────────────────────────────
    if (url.pathname === "/seen" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const { ids = [] } = await request.json();
        await Promise.all(ids.map(id =>
          env.SEEN_ARTICLES.put(`seen:${id}`, "1", { expirationTtl: TTL_SECONDS })
        ));
        return json({ ok: true, marked: ids.length });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /daily-count — track posts per day ───────────────────────────────────
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

    // ── /last-category — track category rotation ─────────────────────────────
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

    // ── /x-trends — Kenya trending topics (static fallback) ──────────────────
    if (url.pathname === "/x-trends") {
      const trends = [
        { title: "#Kenya" }, { title: "#Nairobi" }, { title: "#KenyaPolitics" },
        { title: "#Ruto" }, { title: "#NairobiLife" }, { title: "#EastAfrica" },
        { title: "#KenyaNews" }, { title: "#AfricaNews" },
      ];
      return json({ trends, source: "static" });
    }

    // ── /post-log ─────────────────────────────────────────────────────────────
    if (url.pathname === "/post-log" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      try {
        const entry = await request.json();
        const key = `log:${Date.now()}:${entry.articleId || "unknown"}`;
        await env.SEEN_ARTICLES.put(key, JSON.stringify(entry), { expirationTtl: TTL_SECONDS });
        return json({ ok: true });
      } catch (err) { return json({ error: err.message }, 500); }
    }

    // ── /stage-video ──────────────────────────────────────────────────────────
    if (url.pathname === "/stage-video" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      let body;
      try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
      const { videoUrl } = body;
      if (!videoUrl) return new Response("videoUrl required", { status: 400 });
      try {
        const videoRes = await fetch(videoUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/1.0)" },
          signal: AbortSignal.timeout(120000),
        });
        if (!videoRes.ok) throw new Error(`Download failed: HTTP ${videoRes.status}`);
        const contentType = videoRes.headers.get("content-type") || "video/mp4";
        const videoBuffer = await videoRes.arrayBuffer();
        const timestamp = Date.now();
        const key = `videos/${timestamp}-${crypto.randomUUID()}.mp4`;
        await env.VIDEOS.put(key, videoBuffer, {
          httpMetadata: { contentType },
          customMetadata: { uploadedAt: String(timestamp) },
        });
        return json({ success: true, url: `${R2_PUBLIC_BASE}/${key}`, key, expiresAt: new Date(timestamp + VIDEO_MAX_AGE_MS).toISOString() });
      } catch (err) { return json({ success: false, error: err.message }, 500); }
    }

    // ── /delete-video ─────────────────────────────────────────────────────────
    if (url.pathname === "/delete-video" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      const { key } = await request.json();
      if (!key) return new Response("key required", { status: 400 });
      await env.VIDEOS.delete(key);
      return json({ success: true });
    }

    // ── /clear-cache ──────────────────────────────────────────────────────────
    if (url.pathname === "/clear-cache" && request.method === "POST") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      const list = await env.SEEN_ARTICLES.list({ prefix: "seen:" });
      await Promise.all(list.keys.map(k => env.SEEN_ARTICLES.delete(k.name)));
      return json({ cleared: list.keys.length });
    }

    return new Response("Not found", { status: 404 });
  },
};

// ── Trigger Next.js automate endpoint ────────────────────────────────────────
async function triggerAutomate(env) {
  const appUrl = env.VERCEL_APP_URL || "https://auto-news-station.vercel.app";
  const secret = env.AUTOMATE_SECRET;
  if (!secret) { console.warn("[auto-ppp-tv] AUTOMATE_SECRET not set"); return; }

  try {
    const res = await fetch(`${appUrl}/api/automate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(280000), // 280s — just under CF's 300s limit
    });
    const data = await res.json();
    console.log(`[auto-ppp-tv] automate result: posted=${data.posted} skipped=${data.skipped} errors=${data.errors?.length || 0}`);
  } catch (err) {
    console.error("[auto-ppp-tv] trigger failed:", err.message);
  }
}

// ── Cleanup R2 videos older than 24h ─────────────────────────────────────────
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
