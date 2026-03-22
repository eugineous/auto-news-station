import { NextRequest, NextResponse } from "next/server";
import { scrapeUrl } from "@/lib/url-scraper";
import { generateAIContent } from "@/lib/gemini";
import { generateImage } from "@/lib/image-gen";
import { Article } from "@/lib/types";
import { createHash } from "crypto";

export const maxDuration = 60;

function typeToCategory(type: string, title: string): string {
  const t = title.toLowerCase();
  if (type === "youtube" || type === "tiktok") return "TV & FILM";
  if (type === "twitter") return "CELEBRITY";
  if (t.includes("music") || t.includes("song") || t.includes("album")) return "MUSIC";
  if (t.includes("fashion") || t.includes("style")) return "FASHION";
  if (t.includes("award") || t.includes("nomination")) return "AWARDS";
  return "GENERAL";
}

export async function POST(req: NextRequest) {
  let body: { url?: string; category?: string; manualTitle?: string; manualCaption?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { url, category, manualTitle, manualCaption } = body;
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  // Instagram: needs manual input if oEmbed fails
  if (/instagram\.com/.test(url) && !manualTitle) {
    const scraped = await scrapeUrl(url).catch(() => null);
    if (!scraped?.title) {
      return NextResponse.json({
        error: "INSTAGRAM_MANUAL",
        message: "Instagram blocked scraping. Enter title and caption manually.",
        videoEmbedUrl: scraped?.embedId ? `https://www.instagram.com/p/${scraped.embedId}/embed/` : null,
      }, { status: 422 });
    }
  }

  try {
    const scraped = await scrapeUrl(url);

    // Use manual overrides if provided (Instagram fallback)
    const title = manualTitle || scraped.title;
    const description = manualCaption || scraped.description;

    if (!title) return NextResponse.json({ error: "Could not extract content from this URL" }, { status: 422 });

    const article: Article = {
      id: createHash("sha256").update(url).digest("hex").slice(0, 16),
      title,
      url: scraped.sourceUrl,
      imageUrl: scraped.imageUrl || scraped.videoThumbnailUrl || "",
      summary: description,
      fullBody: scraped.bodyText || description,
      sourceName: scraped.sourceName,
      category: category || typeToCategory(scraped.type, title),
      publishedAt: new Date(),
    };

    const ai = await generateAIContent(article, { isVideo: scraped.isVideo, videoType: scraped.type });
    const articleWithAITitle = { ...article, title: ai.clickbaitTitle };
    const imageBuffer = await generateImage(articleWithAITitle, { isBreaking: false });

    return NextResponse.json({
      scraped: {
        type: scraped.type,
        title,
        description,
        imageUrl: scraped.imageUrl,
        sourceName: scraped.sourceName,
        isVideo: scraped.isVideo,
        videoEmbedUrl: scraped.videoEmbedUrl || null,
        videoUrl: scraped.videoUrl || null,
      },
      ai,
      category: article.category,
      imageBase64: "data:image/jpeg;base64," + imageBuffer.toString("base64"),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
