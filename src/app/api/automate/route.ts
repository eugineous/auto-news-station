import { NextRequest, NextResponse } from "next/server";
import { fetchArticles } from "@/lib/scraper";
import { generateAIContent } from "@/lib/gemini";
import { generateImage } from "@/lib/image-gen";
import { publish } from "@/lib/publisher";
import { Article, SchedulerResponse } from "@/lib/types";

export const maxDuration = 120; // 2 min — enough for 2 articles

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://ppptv-worker.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "";

// Hard Kenya relevance filter
const KENYA_TERMS = [
  "kenya", "nairobi", "mombasa", "kisumu", "nakuru", "eldoret",
  "kenyan", "kenyans", "ksh", "kes", "safaricom", "mpesa", "m-pesa",
  "uhuru", "ruto", "raila", "odinga", "jubilee", "azimio", "odm",
  "east africa", "eastafrica", "ugali", "matatu", "ppptv", "ppp tv",
  "wahu", "avril", "size 8", "nameless", "akothee", "bahati", "sauti sol",
  "nyashinski", "khaligraph", "octopizzo", "nviiri", "bien", "bensoul",
];

function isKenyaRelevant(article: Article): boolean {
  const text = (article.title + " " + (article.summary || "") + " " + article.category).toLowerCase();
  return KENYA_TERMS.some(t => text.includes(t));
}

// Quality gate — skip articles with no usable content
function hasMinimumContent(article: Article): boolean {
  // Must have a title of at least 10 chars
  if (!article.title || article.title.trim().length < 10) return false;
  // Must have an image (no image = bad post)
  if (!article.imageUrl || article.imageUrl.trim().length === 0) return false;
  return true;
}

async function filterUnseen(articles: Article[]): Promise<Article[]> {
  if (!WORKER_SECRET || articles.length === 0) return articles;
  try {
    const res = await fetch(WORKER_URL + "/seen/check", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
      body: JSON.stringify({ ids: articles.map(a => a.id) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return articles;
    const { seen } = await res.json() as { seen: string[] };
    const seenSet = new Set(seen);
    return articles.filter(a => !seenSet.has(a.id));
  } catch {
    return articles;
  }
}

async function markSeen(id: string): Promise<void> {
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

async function postOneArticle(article: Article): Promise<{ success: boolean; error?: string }> {
  // Mark seen BEFORE posting — prevents duplicate posts if function retries
  await markSeen(article.id);

  // Generate AI clickbait title + caption
  const ai = await generateAIContent(article);

  // Image uses the AI clickbait title
  const articleWithAITitle = { ...article, title: ai.clickbaitTitle };
  const imageBuffer = await generateImage(articleWithAITitle);

  const igPost = { platform: "instagram" as const, caption: ai.caption, articleUrl: article.url };
  const fbPost = { platform: "facebook" as const, caption: ai.caption, articleUrl: article.url };
  const result = await publish({ ig: igPost, fb: fbPost }, imageBuffer);

  const anySuccess = result.facebook.success || result.instagram.success;

  if (anySuccess) {
    await logPost({
      articleId: article.id,
      title: ai.clickbaitTitle,
      url: article.url,
      category: article.category,
      instagram: result.instagram,
      facebook: result.facebook,
      postedAt: new Date().toISOString(),
    });
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

  try {
    const all = await fetchArticles(50);

    // 1. Kenya filter
    const kenya = all.filter(isKenyaRelevant);

    // 2. Quality gate — must have title + image
    const quality = kenya.filter(hasMinimumContent);

    // 3. Dedup — remove already-posted articles
    const unseen = await filterUnseen(quality);

    response.skipped = all.length - unseen.length;

    if (unseen.length === 0) {
      return NextResponse.json({ ...response, message: "No new Kenya articles to post" });
    }

    // 4. Post up to 2 articles per run (newest first)
    const toPost = unseen.slice(0, 2);

    for (const article of toPost) {
      try {
        const result = await postOneArticle(article);
        if (result.success) {
          response.posted++;
        } else {
          response.errors.push({ articleId: article.id, message: result.error || "Unknown error" });
        }
      } catch (err: any) {
        response.errors.push({ articleId: article.id, message: err.message });
      }
    }
  } catch (err: any) {
    response.errors.push({ articleId: "scraper", message: err.message });
  }

  return NextResponse.json(response);
}
