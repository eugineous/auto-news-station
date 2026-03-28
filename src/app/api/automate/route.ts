import { NextRequest, NextResponse } from "next/server";
import { fetchArticles } from "@/lib/scraper";
import { generateAIContent } from "@/lib/gemini";
import { generateImage } from "@/lib/image-gen";
import { publish, publishStories, publishVideo } from "@/lib/publisher";
import { Article, SchedulerResponse } from "@/lib/types";

export const maxDuration = 300;

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";

// ── Kenya relevance filter ────────────────────────────────────────────────────
const KENYA_TERMS = [
  // Geography
  "kenya","nairobi","mombasa","kisumu","nakuru","eldoret","thika","machakos",
  "nyeri","kakamega","garissa","malindi","lamu","kitale","kericho","embu",
  "kenyan","kenyans","east africa","eastafrica",
  // Economy
  "ksh","kes","safaricom","mpesa","m-pesa","equity bank","kcb","co-op bank",
  "nse","nairobi stock","kengen","kplc","kenya power","kra","jubilee",
  // Politics
  "uhuru","ruto","raila","odinga","azimio","odm","jubilee","cord","nasa",
  "william ruto","uhuru kenyatta","raila odinga","dp ruto","cs","cs kenya",
  // Culture / Food
  "ugali","matatu","nyama choma","sukuma wiki","githeri","mandazi","chapati",
  // Media / Brands
  "ppptv","ppp tv","citizen tv","ntv kenya","kbc","k24","standard media",
  "nation media","the star kenya","tuko","kenyans.co.ke","nairobinews",
  // Institutions
  "kcaa","kaa","knbs","iebc","dci kenya","nps","kdf","gsma","safaricom",
  // Artists / Celebs
  "wahu","avril","size 8","nameless","akothee","bahati","sauti sol",
  "nyashinski","khaligraph","octopizzo","nviiri","bien","bensoul",
  "naiboi","otile","brown mauzo","tanasha","vera sidika","huddah",
  "eric omondi","polyann","polyann njeri","sauti","sol band",
  "king kaka","rabbit","fena gitu","nadia mukami","arrow bwoy",
  "rekles","mejja","timmy tdat","stivo simple boy","gengetone",
  "victoria kimani","dela","vivian","mercy masika","ruth kahiu",
  "lupita nyong","lupita","nick mutuma","brenda wairimu","jacky vike",
  "abel mutua","phil karanja","kate actress","celestine ndinda",
  "mwende macharia","betty kyallo","janet mbugua","lillian muli",
  "kanze dena","lulu hassan","rashid abdalla","willis raburu",
  "jeff koinange","larry madowo","ken wa maria","kamene goro",
  "andrew kibe","jalang'o","felix odiwuor","mwalimu rachel",
  // Sports
  "harambee stars","gor mahia","afc leopards","tusker fc","bandari",
  "eliud kipchoge","kipchoge","faith kipyegon","peres jepchirchir",
  "timothy cheruiyot","conseslus kipruto","kenya athletics",
];

function isKenyaRelevant(a: Article): boolean {
  const text = (a.title + " " + (a.summary || "") + " " + a.category + " " + (a.url || "")).toLowerCase();
  // Also match .co.ke domains and common Kenya news sites
  if (text.includes(".co.ke") || text.includes("kenyans.co") || text.includes("tuko.co") || text.includes("standardmedia") || text.includes("nation.africa") || text.includes("the-star.co")) return true;
  return KENYA_TERMS.some(t => text.includes(t));
}

// ── Quality gate ──────────────────────────────────────────────────────────────
function hasMinimumContent(a: Article): boolean {
  if (!a.title || a.title.trim().length < 10) return false;
  if (!a.summary || a.summary.trim().length < 30) return false;
  return true;
}

// ── Best-time scheduler — EAT hours ──────────────────────────────────────────
function isPostingHour(): boolean {
  const hourEAT = (new Date().getUTCHours() + 3) % 24;
  // Only skip true dead zone: 1am–5am EAT
  return !(hourEAT >= 1 && hourEAT < 5);
}

// ── Daily post cap — max 6 posts per day ─────────────────────────────────────
async function getDailyCount(): Promise<number> {
  if (!WORKER_SECRET) return 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(WORKER_URL + "/daily-count?date=" + today, {
      headers: { "Authorization": "Bearer " + WORKER_SECRET },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return 0;
    const d = await res.json() as { count: number };
    return d.count || 0;
  } catch { return 0; }
}

async function incrementDailyCount(): Promise<void> {
  if (!WORKER_SECRET) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    await fetch(WORKER_URL + "/daily-count", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
      body: JSON.stringify({ date: today }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* non-fatal */ }
}

// ── Category rotation — track last posted category ───────────────────────────
async function getLastCategory(): Promise<string> {
  if (!WORKER_SECRET) return "";
  try {
    const res = await fetch(WORKER_URL + "/last-category", {
      headers: { "Authorization": "Bearer " + WORKER_SECRET },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";
    const d = await res.json() as { category: string };
    return d.category || "";
  } catch { return ""; }
}

async function setLastCategory(category: string): Promise<void> {
  if (!WORKER_SECRET) return;
  try {
    await fetch(WORKER_URL + "/last-category", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
      body: JSON.stringify({ category }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* non-fatal */ }
}

// ── Article scoring — freshness + Kenya relevance strength ───────────────────
function scoreArticle(a: Article, trendingTopics: string[]): number {
  let score = 0;
  const text = (a.title + " " + (a.summary || "")).toLowerCase();
  const ageMs = Date.now() - new Date(a.publishedAt).getTime();
  const ageHours = ageMs / 3600000;

  // Freshness: articles under 2h get big boost
  if (ageHours < 2) score += 100;
  else if (ageHours < 6) score += 60;
  else if (ageHours < 12) score += 30;
  else score += 10;

  // Kenya term density
  const kenyanHits = KENYA_TERMS.filter(t => text.includes(t)).length;
  score += kenyanHits * 15;

  // Trending topic match — huge boost
  const trendHits = trendingTopics.filter(t => text.includes(t.toLowerCase())).length;
  score += trendHits * 50;

  // Has good summary
  if (a.summary && a.summary.length > 100) score += 20;

  // VIDEO BOOST: videos get 3-5x more reach — always prioritize
  if (a.isVideo && a.videoUrl) score += 80;

  // High-engagement categories on Kenyan social media
  const hotCategories = ["CELEBRITY", "MUSIC", "ENTERTAINMENT", "TV & FILM", "MOVIES", "SPORTS"];
  if (hotCategories.includes(a.category.toUpperCase())) score += 30;

  return score;
}

// ── Dedup via CF KV ───────────────────────────────────────────────────────────
async function filterUnseen(articles: Article[]): Promise<Article[]> {
  if (!WORKER_SECRET || articles.length === 0) return articles;
  try {
    const res = await fetch(WORKER_URL + "/seen/check", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
      body: JSON.stringify({ ids: articles.map(a => a.id), titles: articles.map(a => a.title) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return articles;
    const { seen } = await res.json() as { seen: string[] };
    const seenSet = new Set(seen);
    return articles.filter(a => !seenSet.has(a.id));
  } catch { return articles; }
}

async function markSeen(id: string, title?: string): Promise<void> {
  if (!WORKER_SECRET) return;
  try {
    await fetch(WORKER_URL + "/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
      body: JSON.stringify({ ids: [id] }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* non-fatal */ }
}

async function logPost(entry: object): Promise<void> {
  if (!WORKER_SECRET) return;
  try {
    await fetch(WORKER_URL + "/post-log", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
      body: JSON.stringify(entry),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* non-fatal */ }
}

// ── Distributed lock via CF KV — prevents concurrent runs double-posting ──────
const LOCK_KEY = "pipeline:lock";
const LOCK_TTL = 270; // 4.5 min — safely under the 10-min cron interval

async function acquireLock(): Promise<boolean> {
  if (!WORKER_SECRET) return true; // no KV, skip lock
  try {
    const res = await fetch(WORKER_URL + "/lock/acquire", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
      body: JSON.stringify({ key: LOCK_KEY, ttl: LOCK_TTL }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return true; // endpoint not yet deployed — fail open
    const d = await res.json() as { acquired: boolean };
    return d.acquired !== false;
  } catch { return true; } // fail open — better a rare dup than never posting
}

async function releaseLock(): Promise<void> {
  if (!WORKER_SECRET) return;
  try {
    await fetch(WORKER_URL + "/lock/release", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
      body: JSON.stringify({ key: LOCK_KEY }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* non-fatal */ }
}

// ── Get current X/Twitter Kenya trending topics ───────────────────────────────
async function getTrendingTopics(): Promise<string[]> {
  try {
    const res = await fetch(WORKER_URL + "/x-trends", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const d = await res.json() as { trends: { title: string }[] };
    return (d.trends || []).map(t => t.title.toLowerCase());
  } catch { return []; }
}

async function postOneArticle(article: Article, isBreaking: boolean): Promise<{ success: boolean; error?: string }> {
  // Generate AI content — Gemini for headline, NVIDIA for caption
  let clickbaitTitle = article.title;
  let caption = "";
  let firstComment = "";

  try {
    const ai = await generateAIContent(article);
    clickbaitTitle = ai.clickbaitTitle || article.title;
    caption = ai.caption || "";
    firstComment = ai.firstComment || "";
  } catch (err: any) {
    console.warn("[automate] AI generation failed, using fallback:", err.message);
  }

  // Fallback caption if AI failed
  if (!caption || caption.length < 40) {
    const body = article.fullBody?.trim() || article.summary?.trim() || article.title;
    caption = body.slice(0, 400) + (body.length > 400 ? "..." : "");
    caption += "\n\nRead more 👇";
  }

  // Always append article link
  if (article.url && !caption.includes(article.url)) {
    caption += `\n\n${article.url}`;
  }

  // Generate thumbnail using AI clickbait title
  const articleWithAITitle = { ...article, title: clickbaitTitle };
  const imageBuffer = await generateImage(articleWithAITitle, { isBreaking });

  // If article has a video URL, stage it and post as Reel
  if (article.isVideo && article.videoUrl) {
    let stagedVideoUrl: string | null = null;
    let stagedKey: string | null = null;

    try {
      const stageRes = await fetch(WORKER_URL + "/stage-video", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
        body: JSON.stringify({ videoUrl: article.videoUrl }),
        signal: AbortSignal.timeout(60000),
      });
      if (stageRes.ok) {
        const stageData = await stageRes.json() as { url: string; key: string };
        stagedVideoUrl = stageData.url;
        stagedKey = stageData.key;
      } else {
        console.warn("[automate] video staging failed, falling back to image post");
      }
    } catch (err: any) {
      console.warn("[automate] video staging error, falling back to image post:", err.message);
    }

    if (stagedVideoUrl) {
      const videoCaption = caption + (firstComment ? `\n\n${firstComment}` : "");
      const igPost = { platform: "instagram" as const, caption: videoCaption, articleUrl: article.url, firstComment };
      const fbPost = { platform: "facebook" as const, caption: videoCaption, articleUrl: article.url, firstComment };

      // Use the generated thumbnail as cover image for IG Reel
      const coverImageUrl = imageBuffer
        ? await (async () => {
            try {
              const stageImgRes = await fetch(WORKER_URL + "/stage-image", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
                body: JSON.stringify({ imageBuffer: imageBuffer.toString("base64") }),
                signal: AbortSignal.timeout(15000),
              });
              if (stageImgRes.ok) {
                const d = await stageImgRes.json() as any;
                return d?.url as string | undefined;
              }
            } catch { /* non-fatal */ }
            return undefined;
          })()
        : undefined;

      try {
        const result = await publishVideo({ ig: igPost, fb: fbPost }, stagedVideoUrl, coverImageUrl);
        const anySuccess = result.instagram.success || result.facebook.success;

        if (anySuccess) {
          await Promise.all([
            logPost({ articleId: article.id, title: clickbaitTitle, url: article.url, category: article.category, instagram: result.instagram, facebook: result.facebook, postedAt: new Date().toISOString(), isBreaking, postType: "video" }),
            incrementDailyCount(),
            setLastCategory(article.category),
          ]);

          // Fire-and-forget: delete staged video from R2
          if (stagedKey) {
            fetch(WORKER_URL + "/delete-video", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
              body: JSON.stringify({ key: stagedKey }),
              signal: AbortSignal.timeout(10000),
            }).catch(() => {});
          }

          return { success: true };
        }
      } catch (err: any) {
        console.warn("[automate] publishVideo failed, falling back to image:", err.message);
      }
    }
  }

  const igPost = { platform: "instagram" as const, caption, articleUrl: article.url, firstComment };
  const fbPost = { platform: "facebook" as const, caption, articleUrl: article.url, firstComment };
  const result = await publish({ ig: igPost, fb: fbPost }, imageBuffer);

  // Always fire stories — no limit, no gate, stories bypass the feed algorithm
  publishStories(imageBuffer, WORKER_URL, WORKER_SECRET).then(stories => {
    console.log(`[automate] IG story: ${stories.igStory.success ? "✓" : "✗ " + stories.igStory.error}`);
    console.log(`[automate] FB story: ${stories.fbStory.success ? "✓" : "✗ " + stories.fbStory.error}`);
  }).catch(() => {});

  const anySuccess = result.facebook.success || result.instagram.success;

  if (anySuccess) {
    // Self-comment warmup — post a follow-up comment 3-5 min after publishing
    // This drives early engagement signals that tell the algorithm the post is active
    if (result.instagram.success && result.instagram.postId) {
      const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
      if (igToken) {
        const warmupDelay = (3 + Math.random() * 2) * 60 * 1000; // 3-5 min
        setTimeout(async () => {
          const warmupComments = [
            `Full story: ${article.url}`,
            `Read the full report at the link in our bio.`,
            `More details at the link in bio. Follow @ppptvke for updates.`,
            `Source: ${article.sourceName || "PPP TV Kenya"} | Full story in bio link.`,
          ];
          const comment = warmupComments[Math.floor(Math.random() * warmupComments.length)];
          await fetch(`https://graph.facebook.com/v19.0/${result.instagram.postId}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: comment, access_token: igToken }),
            signal: AbortSignal.timeout(10000),
          }).catch(() => {});
        }, warmupDelay);
      }
    }

    await Promise.all([
      logPost({
        articleId: article.id, title: clickbaitTitle, url: article.url,
        category: article.category, instagram: result.instagram,
        facebook: result.facebook, postedAt: new Date().toISOString(),
        isBreaking,
      }),
      incrementDailyCount(),
      setLastCategory(article.category),
    ]);
    return { success: true };
  }

  const errs: string[] = [];
  if (!result.instagram.success) errs.push("ig: " + result.instagram.error);
  if (!result.facebook.success) errs.push("fb: " + result.facebook.error);
  return { success: false, error: errs.join(" | ") };
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== "Bearer " + process.env.AUTOMATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response: SchedulerResponse = { posted: 0, skipped: 0, errors: [] };

  // ── Peak hour check ───────────────────────────────────────────────────────
  if (!isPostingHour()) {
    return NextResponse.json({ ...response, message: "Off-peak hours (1-5am EAT) — skipping" });
  }

  // ── Daily cap removed — post as many as needed ───────────────────────────
  // No artificial limit; Instagram rate limits will self-regulate

  // ── Distributed lock — prevent concurrent runs from double-posting ────────
  const lockAcquired = await acquireLock();
  if (!lockAcquired) {
    return NextResponse.json({ ...response, message: "Another run in progress — skipped" });
  }

  try {
    // Fetch articles + trending topics in parallel
    const [all, trendingTopics, lastCategory] = await Promise.all([
      fetchArticles(50),
      getTrendingTopics(),
      getLastCategory(),
    ]);

    // 1. Kenya filter
    const kenya = all.filter(isKenyaRelevant);

    // 2. Quality gate
    const quality = kenya.filter(hasMinimumContent);

    // 3. Dedup via KV
    const unseen = await filterUnseen(quality);
    response.skipped = quality.length - unseen.length;

    // Extra in-memory title dedup — catches same article with different URL variants
    const seenTitles = new Set<string>();
    const dedupedUnseen = unseen.filter(a => {
      const fp = a.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);
      if (seenTitles.has(fp)) return false;
      seenTitles.add(fp);
      return true;
    });

    if (dedupedUnseen.length === 0) {
      return NextResponse.json({ ...response, message: "No new Kenya articles to post" });
    }

    // 4. Category rotation — avoid repeating the same category, prefer underrepresented ones
    let candidates = dedupedUnseen;
    if (lastCategory) {
      // First try: exclude the last posted category entirely
      const different = dedupedUnseen.filter(a => a.category !== lastCategory);
      if (different.length > 0) candidates = different;
    }
    // Among candidates, boost variety by deprioritizing any category that appeared in last 3 posts
    // (already handled by scoring — just ensure we don't pick same category twice in a row)

    // 5. Score and sort — trending articles first, then freshest
    const scored = candidates
      .map(a => ({ article: a, score: scoreArticle(a, trendingTopics) }))
      .sort((a, b) => b.score - a.score);

    // 6. Post exactly 1 article per run (10-min cron, no daily cap)
    const toPost = scored.slice(0, 1).map(s => s.article);

    // CRITICAL: Mark all selected articles as seen IMMEDIATELY before posting
    // This prevents concurrent cron runs from picking the same articles
    if (toPost.length > 0) {
      await Promise.all(toPost.map(a => markSeen(a.id, a.title)));
    }

    for (const article of toPost) {
      try {
        const ageHours = (Date.now() - new Date(article.publishedAt).getTime()) / 3600000;
        const isBreaking = ageHours < 2;
        const result = await postOneArticle(article, isBreaking);
        if (result.success) {
          response.posted++;
          // Respect IG rate limits — wait 8s between posts
          if (toPost.indexOf(article) < toPost.length - 1) {
            await new Promise(r => setTimeout(r, 8000));
          }
        } else {
          response.errors.push({ articleId: article.id, message: result.error || "Unknown error" });
        }
      } catch (err: any) {
        response.errors.push({ articleId: article.id, message: err.message });
      }
    }
  } catch (err: any) {
    response.errors.push({ articleId: "scraper", message: err.message });
  } finally {
    await releaseLock();
  }

  return NextResponse.json(response);
}
