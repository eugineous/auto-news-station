/**
 * PPP TV Auto Poster  Cloudflare Worker
 * Cron: every 10 minutes — posts ONE latest article
 */

const RSS_URL = "https://ppptv-v2.vercel.app/api/rss";
const TTL_SECONDS = 30 * 24 * 60 * 60;

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runPipeline(env));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response(JSON.stringify({ status: "ok", service: "PPP TV Auto Poster", cron: "*/10 * * * *" }), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/trigger") {
      ctx.waitUntil(runPipeline(env));
      return new Response(JSON.stringify({ status: "triggered" }), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/clear-cache" && request.method === "POST") {
      const auth = request.headers.get("authorization");
      if (auth !== `Bearer ${env.AUTOMATE_SECRET}`) return new Response("Unauthorized", { status: 401 });
      const list = await env.SEEN_ARTICLES.list({ prefix: "seen:" });
      await Promise.all(list.keys.map((k) => env.SEEN_ARTICLES.delete(k.name)));
      return new Response(JSON.stringify({ cleared: list.keys.length }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response("Not found", { status: 404 });
  },
};

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