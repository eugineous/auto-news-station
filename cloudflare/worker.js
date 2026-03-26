/**
 * PPP TV Auto Poster — Cloudflare Worker (STANDALONE)
 * Does everything: fetch articles → AI caption → thumbnail → post to IG + FB
 * No Vercel dependency for the cron pipeline.
 * Cron: every 10 minutes
 */

const TTL_SECONDS = 30 * 24 * 60 * 60;
const FEED_URL = "https://ppp-tv-worker.euginemicah.workers.dev/feed?limit=20";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

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
      ctx.waitUntil(runPipeline(env));
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const auth = request.headers.get("authorization");
    const authed = auth === `Bearer ${env.WORKER_SECRET}`;

    if (url.pathname === "/") return json({ status: "ok", service: "PPP TV Auto Poster", cron: "*/10 * * * *" });

    // Open trigger — no auth required for manual testing
    if (url.pathname === "/trigger") {
      runPipeline(env).catch(e => console.error("[trigger]", e.message));
      return json({ status: "triggered" });
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

    return new Response("Not found", { status: 404 });
  },
};

// ── MAIN PIPELINE ─────────────────────────────────────────────────────────────
async function runPipeline(env) {
  console.log("[PPP TV] Pipeline started");

  // 1. Fetch articles from PPP TV worker feed
  let articles = [];
  try {
    const res = await fetch(FEED_URL, { headers: { "User-Agent": "PPPTVAutoPoster/5.0" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Feed ${res.status}`);
    const data = await res.json();
    articles = (data.articles || []).filter(a => a.title && (a.articleUrl || a.sourceUrl));
    console.log(`[PPP TV] Fetched ${articles.length} articles`);
  } catch (err) {
    console.error("[PPP TV] Feed failed:", err.message);
    return;
  }

  if (articles.length === 0) { console.log("[PPP TV] No articles"); return; }

  // 2. Filter unseen
  const unseen = [];
  for (const a of articles) {
    const id = await sha256Short(a.articleUrl || a.sourceUrl);
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

  // 5. Get image URL (use direct image URL from feed)
  const imageUrl = article.imageUrlDirect || article.imageUrl || "";
  if (!imageUrl) {
    console.warn("[PPP TV] No image URL — skipping");
    return;
  }

  // 6. Post to Instagram
  const igResult = await postToInstagram(imageUrl, caption, env);
  console.log(`[PPP TV] IG: ${igResult.success ? "✓ " + igResult.postId : "✗ " + igResult.error}`);

  // 7. Post to Facebook
  const fbResult = await postToFacebook(imageUrl, caption, article.articleUrl || article.sourceUrl, env);
  console.log(`[PPP TV] FB: ${fbResult.success ? "✓ " + fbResult.postId : "✗ " + fbResult.error}`);

  // 8. Log the post
  if (igResult.success || fbResult.success) {
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
    console.log(`[PPP TV] Logged post`);
  }

  console.log("[PPP TV] Pipeline done");
}

// ── AI CAPTION ────────────────────────────────────────────────────────────────
async function generateCaption(article, env) {
  const content = (article.excerpt || article.content || "").slice(0, 1500);
  const prompt = `Write a PPP TV Kenya Instagram/Facebook caption for this article.

TITLE: ${article.title}
CATEGORY: ${article.category || "GENERAL"}
SOURCE: ${article.sourceName || "PPP TV Kenya"}
${content ? `ARTICLE:\n${content}` : ""}

Structure:
1. One punchy lede sentence (WHO did WHAT, WHERE — real name required)
2. 2-3 sentences of real detail (names, numbers, places, dates)
3. One engaging question + 👇

Rules: No hashtags. No ALL CAPS in body. Max 2 emojis. No filler phrases.
Reply with ONLY the caption text.`;

  // Try Gemini first
  if (env.GEMINI_API_KEY) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 600 } }),
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
  return (article.excerpt || article.title) + "\n\nWhat do you think? 👇";
}

// ── INSTAGRAM POSTING ─────────────────────────────────────────────────────────
async function postToInstagram(imageUrl, caption, env) {
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

// ── HELPERS ───────────────────────────────────────────────────────────────────
async function sha256Short(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
