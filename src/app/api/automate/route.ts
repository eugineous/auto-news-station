import { NextRequest, NextResponse } from "next/server";
import { fetchArticles } from "@/lib/scraper";
import { filterUnseen, markSeen } from "@/lib/dedup";
import { generateAIContent } from "@/lib/gemini";
import { generateImage } from "@/lib/image-gen";
import { publish } from "@/lib/publisher";
import { Article, SchedulerResponse } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== "Bearer " + process.env.AUTOMATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response: SchedulerResponse = { posted: 0, skipped: 0, errors: [] };

  let body: { article?: Article } = {};
  try { body = await req.json(); } catch { /* no body */ }

  let articles: Article[];
  if (body.article) {
    articles = [body.article];
  } else {
    try {
      const all = await fetchArticles();
      articles = await filterUnseen(all);
      response.skipped = all.length - articles.length;
    } catch (err: any) {
      return NextResponse.json({ error: "Scraper failed: " + err.message }, { status: 500 });
    }
  }

  for (const article of articles) {
    try {
      // Generate AI clickbait title + caption
      const ai = await generateAIContent(article);

      // Override article title with AI clickbait title for the image
      const articleWithAITitle = { ...article, title: ai.clickbaitTitle };

      // Build posts: AI caption for both platforms
      const igPost = { platform: "instagram" as const, caption: ai.caption, articleUrl: article.url };
      const fbPost = { platform: "facebook" as const, caption: ai.caption, articleUrl: article.url };

      // Generate image using the AI clickbait title + original article image
      const imageBuffer = await generateImage(articleWithAITitle);

      const result = await publish({ ig: igPost, fb: fbPost }, imageBuffer);

      const anySuccess = result.facebook.success || result.instagram.success;

      if (anySuccess) {
        await markSeen(article.id);
        response.posted++;

        // Log the post to Cloudflare KV
        await logPost({
          articleId: article.id,
          title: ai.clickbaitTitle,
          url: article.url,
          category: article.category,
          instagram: result.instagram,
          facebook: result.facebook,
          postedAt: new Date().toISOString(),
        }).catch(() => {});
      }

      if (!result.instagram.success || !result.facebook.success) {
        const errs: string[] = [];
        if (!result.instagram.success) errs.push("ig: " + result.instagram.error);
        if (!result.facebook.success) errs.push("fb: " + result.facebook.error);
        if (!anySuccess) {
          response.errors.push({ articleId: article.id, message: errs.join(" | ") });
        }
      }
    } catch (err: any) {
      response.errors.push({ articleId: article.id, message: err.message });
    }
  }

  return NextResponse.json(response);
}

async function logPost(entry: object) {
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL || "https://ppptv-worker.euginemicah.workers.dev";
  const secret = process.env.WORKER_SECRET;
  if (!secret) return;
  await fetch(workerUrl + "/post-log", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + secret },
    body: JSON.stringify(entry),
    signal: AbortSignal.timeout(5000),
  });
}
