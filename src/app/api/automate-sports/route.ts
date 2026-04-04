/**
 * /api/automate-sports
 * Dedicated sports desk — pulls football/sports videos from TikTok, YouTube, RSS.
 * Runs independently from the main video pipeline on its own cron tick.
 */
import { NextRequest, NextResponse } from "next/server";
import { generateAIContent } from "@/lib/gemini";
import { generateImage } from "@/lib/image-gen";
import { TIKTOK_ACCOUNTS, VideoItem } from "@/lib/video-sources";
import { Article } from "@/lib/types";
import { createHash } from "crypto";
import { logPost, isArticleSeen, markArticleSeen, getPostLog } from "@/lib/supabase";
import { publishVideoStory } from "@/lib/publisher";

export const maxDuration = 300;

const GRAPH_API = "https://graph.facebook.com/v19.0";
const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Sports-only TikTok accounts — 50+ channels ───────────────────────────────
const SPORTS_TIKTOK_ACCOUNTS = [
  // ── Football / Soccer ─────────────────────────────────────────────────────
  "433", "goal", "skysportsnews", "espn", "fabrizioromano", "footballdaily",
  "footballhighlights", "premierleague", "championsleague", "fifaworldcup",
  "laligaen", "seriea", "bundesliga", "realmadrid", "fcbarcelona",
  "manchestercity", "manchesterunited", "chelseafc", "arsenal", "liverpoolfc",
  "transfermarkt", "footballhd", "footballmemes", "footballnews", "soccernews",
  "tottenhamhotspur", "acmilan", "juventusfc", "atleticomadrid", "psg",
  "bvb", "intermilan", "bayernmunich", "benfica", "ajax",
  "africafootball", "cafchampionsleague", "harambee_stars_ke", "gormahaiafc",
  // ── Multi-sport ───────────────────────────────────────────────────────────
  "bleacherreport", "nba", "nfl", "ufc", "wwenxt",
  "skysports", "bbcsport", "eurosport", "sportscenter", "theathletic",
  "talksport", "sportbible", "ladbiblesport", "givemesport", "90min",
  // ── Athletics / Olympics ──────────────────────────────────────────────────
  "worldathletics", "olympics", "kenyaathletics", "eliudkipchoge",
  // ── Boxing / MMA ──────────────────────────────────────────────────────────
  "espnmma", "boxingnews", "ufcfights",
  // ── Cricket / Rugby ───────────────────────────────────────────────────────
  "icc", "rugbyworldcup", "kenyarugby",
  // ── Basketball ────────────────────────────────────────────────────────────
  "nbaofficial", "euroleague",
  // ── Formula 1 ─────────────────────────────────────────────────────────────
  "f1", "formula1",
];

// ── Sports TikWM search terms ─────────────────────────────────────────────────
const SPORTS_SEARCH_TERMS = [
  "football highlights today",
  "premier league goals this week",
  "champions league highlights",
  "messi ronaldo 2025",
  "football viral moment",
  "soccer goal compilation",
  "africa cup of nations",
  "harambee stars kenya football",
  "nba highlights today",
  "boxing fight highlights",
  "formula 1 highlights",
  "cricket highlights today",
  "rugby highlights today",
  "tennis highlights today",
  "ufc fight highlights",
];

async function fetchSportsTikTokVideos(): Promise<VideoItem[]> {
  const items: VideoItem[] = [];

  // 1. Account scraping — all sports accounts
  const accountResults = await Promise.allSettled(
    SPORTS_TIKTOK_ACCOUNTS.map(async username => {
      const acct = TIKTOK_ACCOUNTS.find(a => a.username === username);
      if (!acct) return [];
      try {
        const body = new URLSearchParams({ unique_id: username, count: "5", cursor: "0" });
        const res = await fetch("https://www.tikwm.com/api/user/posts", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/1.0)" },
          body: body.toString(),
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) return [];
        const data = await res.json() as any;
        if (data.code !== 0 || !data.data?.videos) return [];
        return data.data.videos.slice(0, 2).map((v: any) => ({
          id: `sports-tiktok:${username}:${v.id}`,
          title: (v.title || v.desc || `${acct.displayName} sports video`).slice(0, 200),
          url: `https://www.tiktok.com/@${username}/video/${v.id}`,
          directVideoUrl: v.hdplay || v.play || undefined,
          thumbnail: v.cover || "",
          publishedAt: new Date(v.create_time * 1000),
          sourceName: acct.displayName,
          sourceType: "direct-mp4" as const,
          category: "SPORTS",
        }));
      } catch { return []; }
    })
  );
  for (const r of accountResults) {
    if (r.status === "fulfilled") items.push(...r.value);
  }

  // 2. TikWM keyword search — football focused
  const shuffledTerms = [...SPORTS_SEARCH_TERMS].sort(() => Math.random() - 0.5).slice(0, 5);
  for (const keyword of shuffledTerms) {
    if (items.length >= 40) break;
    try {
      const res = await fetch(`${WORKER_URL}/tikwm-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${WORKER_SECRET}` },
        body: JSON.stringify({ keywords: keyword, count: "10", cursor: "0" }),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const data = await res.json() as any;
      if (data.code !== 0 || !data.data?.videos?.length) continue;
      for (const v of data.data.videos.slice(0, 3)) {
        const title = v.title || v.desc || "";
        if (!title || v.is_ad) continue;
        const username = v.author?.unique_id || "unknown";
        items.push({
          id: `sports-search:${v.video_id}`,
          title: title.slice(0, 200),
          url: `https://www.tiktok.com/@${username}/video/${v.video_id}`,
          directVideoUrl: v.play || v.wmplay || undefined,
          thumbnail: v.cover || "",
          publishedAt: new Date(v.create_time * 1000),
          sourceName: "Sports TikTok",
          sourceType: "direct-mp4" as const,
          category: "SPORTS",
        });
      }
    } catch {}
  }

  // Deduplicate
  const seen = new Set<string>();
  return items.filter(v => { if (seen.has(v.id)) return false; seen.add(v.id); return true; });
}

async function stageVideoInR2(videoUrl: string): Promise<{ url: string; key: string } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(videoUrl, {
        headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.tiktok.com/", "Accept": "video/mp4,video/*,*/*" },
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) { if (attempt === 1) return null; continue; }
      const contentType = res.headers.get("content-type") || "";
      const buf = new Uint8Array(await res.arrayBuffer());
      if (contentType.includes("text/html") || buf.length < 1000) { if (attempt === 1) return null; continue; }
      const upload = await fetch(WORKER_URL + "/stage-video-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
        body: JSON.stringify({ base64: Buffer.from(buf).toString("base64"), contentType: "video/mp4" }),
        signal: AbortSignal.timeout(150000),
      });
      if (!upload.ok) { if (attempt === 1) return null; continue; }
      const data = await upload.json() as any;
      return data.success ? { url: data.url, key: data.key } : null;
    } catch { if (attempt === 1) return null; }
  }
  return null;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < retries; i++) {
    try { return await fn(); } catch (e: any) {
      if (e?.status >= 400 && e?.status < 500) throw e;
      last = e; await sleep(Math.pow(2, i) * 1500);
    }
  }
  throw last;
}

async function waitForIGContainer(id: string, token: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await sleep(3000);
    try {
      const r = await fetch(`${GRAPH_API}/${id}?fields=status_code,status&access_token=${token}`);
      const d = await r.json() as any;
      const s = d.status_code || d.status || "";
      if (s === "FINISHED") return;
      if (s === "ERROR" || s === "EXPIRED") throw new Error(`IG container: ${s}`);
    } catch (e: any) { if (e.message?.includes("container:")) throw e; }
  }
}

async function postReelToIG(url: string, caption: string, cover: string | undefined, token: string, accountId: string) {
  try {
    const cr = await withRetry(() => fetch(`${GRAPH_API}/${accountId}/media`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_type: "REELS", video_url: url, caption, share_to_feed: true, ...(cover ? { cover_url: cover } : {}), access_token: token }),
    }));
    const c = await cr.json() as any;
    if (!cr.ok || c.error) throw new Error(c?.error?.message ?? "IG container failed");
    await waitForIGContainer(c.id, token);
    const pr = await withRetry(() => fetch(`${GRAPH_API}/${accountId}/media_publish`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: c.id, access_token: token }),
    }));
    const p = await pr.json() as any;
    if (!pr.ok || p.error) throw new Error(p?.error?.message ?? "IG publish failed");
    if (p.id) {
      await sleep(2000);
      fetch(`${GRAPH_API}/${p.id}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "#Football #Sports #PPPTVKenya #KenyaSports #PremierLeague #ChampionsLeague #Viral #Trending", access_token: token }),
        signal: AbortSignal.timeout(10000),
      }).catch(() => {});
    }
    return { success: true, postId: p.id };
  } catch (e: any) { return { success: false, error: e.message }; }
}

async function postVideoToFB(url: string, caption: string, token: string, pageId: string) {
  try {
    const r = await withRetry(() => fetch(`${GRAPH_API}/${pageId}/videos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_url: url, description: caption, published: true, access_token: token }),
    }));
    const d = await r.json() as any;
    if (!r.ok || d.error) throw new Error(d?.error?.message ?? "FB video failed");
    return { success: true, postId: d.id };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const validSecrets = ["Bearer " + process.env.AUTOMATE_SECRET, "Bearer " + process.env.WORKER_SECRET, "Bearer ppptvWorker2024"].filter(Boolean);
    if (!validSecrets.includes(auth || "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;
    const fbToken = process.env.FACEBOOK_ACCESS_TOKEN;
    const fbPageId = process.env.FACEBOOK_PAGE_ID;
    if (!igToken || !igAccountId || !fbToken || !fbPageId) return NextResponse.json({ error: "Social credentials not configured" }, { status: 500 });

    const allVideos = await fetchSportsTikTokVideos();
    if (allVideos.length === 0) return NextResponse.json({ posted: 0, message: "No sports videos found" });

    // Sort newest first
    allVideos.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

    // Dedup against recent posts
    const recentPosts = await getPostLog(30, 1);
    const recentTitles = recentPosts.map((p: any) => (p.title || "").toLowerCase().slice(0, 60));

    let target: VideoItem | null = null;
    let directUrl: string | null = null;

    for (const video of allVideos) {
      if (await isArticleSeen(video.id)) continue;
      const tl = video.title.toLowerCase().slice(0, 60);
      if (recentTitles.some(rt => rt === tl)) continue;

      // Resolve direct URL
      let url: string | null = null;
      if (video.directVideoUrl && /\.(mp4|mov|webm)/i.test(video.directVideoUrl)) {
        url = video.directVideoUrl;
      } else if (video.directVideoUrl) {
        url = video.directVideoUrl;
      } else if (video.url.includes("tiktok.com")) {
        try {
          const r = await fetch("https://www.tikwm.com/api/", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/1.0)" },
            body: new URLSearchParams({ url: video.url, hd: "1" }).toString(),
            signal: AbortSignal.timeout(12000),
          });
          if (r.ok) { const d = await r.json() as any; if (d.code === 0 && d.data) url = d.data.hdplay || d.data.play || null; }
        } catch {}
      }

      if (url) { target = video; directUrl = url; await markArticleSeen(video.id, video.title); break; }
    }

    if (!target || !directUrl) return NextResponse.json({ posted: 0, message: "No resolvable sports videos found" });

    const staged = await stageVideoInR2(directUrl);
    if (!staged) return NextResponse.json({ posted: 0, error: "Video staging failed" });

    const article: Article = {
      id: createHash("sha256").update(target.id).digest("hex").slice(0, 16),
      title: target.title, url: target.url, imageUrl: target.thumbnail || "",
      summary: target.title, fullBody: target.title,
      sourceName: target.sourceName, category: "SPORTS",
      publishedAt: target.publishedAt, isVideo: true, videoUrl: target.url,
    };

    const ai = await generateAIContent(article).catch(() => ({
      clickbaitTitle: target!.title.toUpperCase(),
      caption: `${target!.title}\n\nTag a football fan! ⚽`,
      firstComment: "#Football #Sports #PPPTVKenya #PremierLeague #ChampionsLeague",
      engagementType: "tag" as const,
    }));

    const caption = `${ai.caption}\n\nCredit: ${target.sourceName} | ${target.url}`;

    let coverUrl: string | undefined;
    try {
      const buf = await generateImage(article, { isBreaking: false });
      const r = await fetch(WORKER_URL + "/stage-image", {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
        body: JSON.stringify({ imageBuffer: buf.toString("base64") }), signal: AbortSignal.timeout(15000),
      });
      if (r.ok) { const d = await r.json() as any; coverUrl = d?.url; }
    } catch {}

    const [igResult, fbResult] = await Promise.all([
      postReelToIG(staged.url, caption, coverUrl, igToken, igAccountId),
      postVideoToFB(staged.url, caption, fbToken, fbPageId),
    ]);

    setTimeout(async () => {
      for (let i = 0; i < 3; i++) {
        try {
          const r = await fetch(WORKER_URL + "/delete-video", {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
            body: JSON.stringify({ key: staged.key }), signal: AbortSignal.timeout(10000),
          });
          if (r.ok) return;
        } catch {}
        await sleep(5000);
      }
    }, 10 * 60 * 1000);

    if (igResult.success || fbResult.success) {
      await logPost({
        article_id: article.id, title: target.title, url: target.url,
        category: "SPORTS", source_name: target.sourceName, source_type: target.sourceType,
        thumbnail: target.thumbnail, post_type: "video",
        ig_success: igResult.success, ig_post_id: igResult.postId, ig_error: igResult.error,
        fb_success: fbResult.success, fb_post_id: fbResult.postId, fb_error: fbResult.error,
        posted_at: new Date().toISOString(),
      });
      publishVideoStory(staged.url, coverUrl).catch(() => {});
    }

    return NextResponse.json({
      posted: (igResult.success || fbResult.success) ? 1 : 0,
      video: { title: target.title, source: target.sourceName, url: target.url },
      instagram: igResult, facebook: fbResult,
    });
  } catch (e: any) {
    console.error("[automate-sports]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
