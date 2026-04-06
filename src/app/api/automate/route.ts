import { NextRequest, NextResponse } from "next/server";
import { fetchArticles } from "@/lib/scraper";
import { generateAIContent, verifyStory } from "@/lib/gemini";
import { generateImage } from "@/lib/image-gen";
import { publish, publishStories, publishVideo } from "@/lib/publisher";
import { Article, SchedulerResponse } from "@/lib/types";
import { logPost, isArticleSeen, markArticleSeen, getBlacklist, getPostLog } from "@/lib/supabase";
import { getMixBudget, updateBudget, selectPipeline, todayStr } from "@/lib/content-mix";
import { getNextDueSeries, generateSeriesPost, logSeriesPost } from "@/lib/series-engine";

export const maxDuration = 300;

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";

// ── Startup warning ───────────────────────────────────────────────────────────
if (!process.env.SUPABASE_SERVICE_KEY) {
  console.warn("[dedup] SUPABASE_SERVICE_KEY not set — falling back to KV dedup");
}

// ── Category rotation cycle ───────────────────────────────────────────────────
const CATEGORY_CYCLE = [
  "ENTERTAINMENT", "SPORTS", "MUSIC", "CELEBRITY",
  "TV & FILM", "MOVIES", "LIFESTYLE", "GENERAL",
];

function selectNextCategory(lastCategory: string, availableCategories: string[]): string | null {
  if (!lastCategory || availableCategories.length === 0) return null;
  const lastUpper = lastCategory.toUpperCase();
  const lastIdx = CATEGORY_CYCLE.findIndex(c => c === lastUpper);
  // Try each category in cycle order starting from next position
  for (let i = 1; i <= CATEGORY_CYCLE.length; i++) {
    const nextCat = CATEGORY_CYCLE[(lastIdx + i) % CATEGORY_CYCLE.length];
    if (availableCategories.includes(nextCat)) return nextCat;
  }
  // Fall back to any category different from last
  return availableCategories.find(c => c !== lastUpper) ?? null;
}

// ── In-memory title fingerprint dedup ────────────────────────────────────────
function deduplicateByTitleFingerprint(articles: Article[]): Article[] {
  const seen = new Set<string>();
  return articles.filter(a => {
    const fp = a.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
    if (seen.has(fp)) return false;
    seen.add(fp);
    return true;
  });
}

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
  if (!a.title || a.title.trim().length < 5) return false;
  // Summary is optional — ingest_queue articles may have short excerpts
  return true;
}

// ── Best-time scheduler — EAT hours ──────────────────────────────────────────
function isPostingHour(): boolean {
  // Worker handles dead-zone logic — always return true here to avoid double-blocking
  return true;
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

// ── Dedup + Blacklist via Supabase ───────────────────────────────────────────
async function filterUnseen(articles: Article[]): Promise<Article[]> {
  if (articles.length === 0) return articles;
  try {
    const results = await Promise.all(articles.map(a => {
      const titleFp = a.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
      return isArticleSeen(a.id, titleFp);
    }));
    return articles.filter((_, i) => !results[i]);
  } catch { return articles; }
}

async function filterBlacklisted(articles: Article[]): Promise<Article[]> {
  if (articles.length === 0) return articles;
  try {
    const blacklist = await getBlacklist();
    if (blacklist.length === 0) return articles;
    return articles.filter(a => {
      const domain = (() => { try { return new URL(a.url).hostname.toLowerCase(); } catch { return ""; } })();
      const titleLower = a.title.toLowerCase();
      return !blacklist.some(e => {
        if (e.type === "domain") return domain.includes(e.value.toLowerCase());
        if (e.type === "keyword") return titleLower.includes(e.value.toLowerCase());
        return false;
      });
    });
  } catch { return articles; }
}

async function markSeen(id: string, title?: string): Promise<void> {
  await markArticleSeen(id, title);
}

// logPost is now imported from @/lib/supabase

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
  // ── Story verification — block fake/unverified stories ───────────────────
  const verification = await verifyStory(article.title, article.url);
  if (!verification.verified) {
    console.warn(`[verify] BLOCKED: "${article.title}" — ${verification.reason}`);
    return { success: false, error: `Blocked: ${verification.reason}` };
  }
  if (verification.confidence < 40) {
    console.warn(`[verify] LOW CONFIDENCE (${verification.confidence}%): "${article.title}" — skipping`);
    return { success: false, error: `Low confidence (${verification.confidence}%)` };
  }
  console.log(`[verify] APPROVED (${verification.confidence}%): "${article.title}"`);

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

  // URL attribution is handled in firstComment by generateAIContent — do not append inline

  // Generate thumbnail using AI clickbait title
  const articleWithAITitle = { ...article, title: clickbaitTitle };
  let imageBuffer: Buffer | null = null;
  try {
    imageBuffer = await generateImage(articleWithAITitle, { isBreaking });
  } catch (err: any) {
    console.error("[automate] generateImage failed, skipping post:", err.message);
    return { success: false, error: `Image generation failed: ${err.message}` };
  }

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
            logPost({ article_id: article.id, title: clickbaitTitle, url: article.url, category: article.category, ig_success: result.instagram.success, ig_post_id: result.instagram.postId, ig_error: result.instagram.error, fb_success: result.facebook.success, fb_post_id: result.facebook.postId, fb_error: result.facebook.error, post_type: "video" }),
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
        article_id: article.id, title: clickbaitTitle, url: article.url,
        category: article.category,
        ig_success: result.instagram.success, ig_post_id: result.instagram.postId, ig_error: result.instagram.error,
        fb_success: result.facebook.success, fb_post_id: result.facebook.postId, fb_error: result.facebook.error,
        post_type: "image",
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
  const validSecrets = [
    "Bearer " + process.env.AUTOMATE_SECRET,
    "Bearer " + process.env.WORKER_SECRET,
    "Bearer ppptvWorker2024",
  ].filter(Boolean);
  if (!validSecrets.includes(auth || "")) {
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
    // ── Mix budget check — determine which pipeline to run ────────────────────
    const today = todayStr();
    const budget = await getMixBudget(today);
    const pipeline = selectPipeline(budget);

    // ── Series pipeline ───────────────────────────────────────────────────────
    if (pipeline === "series") {
      const now = new Date();
      const dueSeries = await getNextDueSeries(now);
      if (dueSeries) {
        try {
          const seriesPost = await generateSeriesPost(dueSeries);
          const igPost = { platform: "instagram" as const, caption: seriesPost.caption, articleUrl: "" };
          const fbPost = { platform: "facebook" as const, caption: seriesPost.caption, articleUrl: "" };

          // Generate a placeholder 1x1 image buffer for the series post
          const placeholderBuffer = Buffer.alloc(0);
          const result = await publish({ ig: igPost, fb: fbPost }, placeholderBuffer).catch(() => ({
            instagram: { success: false as const, postId: undefined, error: "publish failed" },
            facebook: { success: false as const, postId: undefined, error: "publish failed" },
            twitter: { success: false as const, postId: undefined, error: "skipped" },
          }));

          const anySuccess = result.instagram.success || result.facebook.success;
          if (anySuccess) {
            await Promise.all([
              logPost({
                title: seriesPost.seriesName,
                category: dueSeries.category,
                ig_success: result.instagram.success,
                ig_post_id: result.instagram.postId,
                ig_error: result.instagram.error,
                fb_success: result.facebook.success,
                fb_post_id: result.facebook.postId,
                fb_error: result.facebook.error,
                post_type: "image",
              }),
              logSeriesPost(dueSeries.id, seriesPost),
              updateBudget(today, "series").catch(() => {}),
            ]);
            return NextResponse.json({ posted: 1, pipeline: "series", series: seriesPost.seriesName });
          }
        } catch (err: any) {
          console.warn("[automate] series pipeline failed, falling through to viral_clip:", err.message);
        }
      }
      // No series due or series failed — fall through to viral_clip
    }

    // ── Feature video pipeline — future work, fall through ───────────────────
    // if (pipeline === "feature_video") { ... }

    // Fetch articles + trending topics in parallel
    const [all, trendingTopics, lastCategory] = await Promise.all([
      fetchArticles(50),
      getTrendingTopics(),
      getLastCategory(),
    ]);

    // 1. No geo filter — post everything from the feed
    const kenya = all;

    // 2. Quality gate
    const quality = kenya.filter(hasMinimumContent);

    // 3. Only block pure hard-politics categories — entertainment/sports/music/celebrity always pass
    const nonPolitical = quality.filter(a => {
      const cat = a.category?.toUpperCase();
      // Only drop if the category is explicitly political/hard-news AND title has no entertainment angle
      if (cat === "POLITICS") return false;
      return true;
    });

    // 4. Blacklist + Dedup via Supabase (with title_fp) + in-memory batch dedup
    const notBlacklisted = await filterBlacklisted(nonPolitical);

    // In-memory title fingerprint dedup pass BEFORE Supabase check
    const batchDeduped = deduplicateByTitleFingerprint(notBlacklisted);

    const unseen = await filterUnseen(batchDeduped);
    response.skipped = quality.length - unseen.length;

    // Final in-memory dedup pass on unseen results
    const dedupedUnseen = deduplicateByTitleFingerprint(unseen);

    if (dedupedUnseen.length === 0) {
      return NextResponse.json({ ...response, message: "No new Kenya articles to post" });
    }

    // 5. Category rotation — hard-exclude last category, pick next in CATEGORY_CYCLE
    const availableCats = Array.from(new Set(dedupedUnseen.map(a => a.category?.toUpperCase()).filter(Boolean) as string[]));

    // Hard-exclude last category if alternatives exist
    let candidates = dedupedUnseen;
    if (lastCategory) {
      const notLast = dedupedUnseen.filter(a => a.category?.toUpperCase() !== lastCategory.toUpperCase());
      if (notLast.length > 0) candidates = notLast;
    }

    // Find next category in cycle among remaining candidates
    const candidateCats = Array.from(new Set(candidates.map(a => a.category?.toUpperCase()).filter(Boolean) as string[]));
    const targetCategory = selectNextCategory(lastCategory, candidateCats);
    if (targetCategory) {
      const catFiltered = candidates.filter(a => a.category?.toUpperCase() === targetCategory);
      if (catFiltered.length > 0) candidates = catFiltered;
    }

    // Suppress unused variable warning
    void availableCats;

    // 5. Score and sort — freshest first within the target category
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
