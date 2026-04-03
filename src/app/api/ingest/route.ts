/**
 * /api/ingest
 * Receives articles pushed from PPP TV site and stores them in Supabase.
 * The auto-poster picks them up from Supabase on the next cron tick.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const INGEST_SECRET = process.env.INGEST_SECRET || process.env.AUTOMATE_SECRET || "ppptvWorker2024";

export interface IngestArticle {
  id: string;               // unique slug or hash
  title: string;
  excerpt: string;
  content?: string;
  category: string;         // ENTERTAINMENT | CELEBRITY | MUSIC | SPORTS | TV & FILM | etc.
  sourceName: string;       // e.g. "PPP TV Kenya"
  sourceUrl: string;        // canonical article URL on ppp-tv-site.vercel.app
  articleUrl: string;       // same as sourceUrl
  publishedAt: string;      // ISO 8601
  imageUrl: string;         // CDN image URL (R2 or external)
  imageUrlDirect?: string;  // direct image URL if different
  videoUrl?: string;        // direct video URL if article has video
  videoEmbedUrl?: string;   // YouTube/Vimeo embed URL
  isBreaking?: boolean;
  tags?: string[];
}

export async function POST(req: NextRequest) {
  // Auth check
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${INGEST_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { articles?: IngestArticle[]; article?: IngestArticle };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Accept single article or batch
  const articles: IngestArticle[] = body.articles || (body.article ? [body.article] : []);
  if (!articles.length) {
    return NextResponse.json({ error: "No articles provided" }, { status: 400 });
  }

  const results = { inserted: 0, skipped: 0, errors: [] as string[] };

  for (const article of articles) {
    if (!article.id || !article.title || !article.sourceUrl) {
      results.errors.push(`Missing required fields: id, title, sourceUrl`);
      continue;
    }

    try {
      // Upsert into ingest_queue table — auto-poster reads from here
      const { error } = await supabaseAdmin
        .from("ingest_queue")
        .upsert({
          id: article.id,
          title: article.title,
          excerpt: article.excerpt || "",
          content: article.content || "",
          category: (article.category || "ENTERTAINMENT").toUpperCase(),
          source_name: article.sourceName || "PPP TV Kenya",
          source_url: article.sourceUrl,
          article_url: article.articleUrl || article.sourceUrl,
          published_at: article.publishedAt || new Date().toISOString(),
          image_url: article.imageUrl || "",
          image_url_direct: article.imageUrlDirect || article.imageUrl || "",
          video_url: article.videoUrl || null,
          video_embed_url: article.videoEmbedUrl || null,
          is_breaking: article.isBreaking || false,
          tags: article.tags || [],
          ingested_at: new Date().toISOString(),
          posted: false,
        }, { onConflict: "id" });

      if (error) {
        results.errors.push(`${article.id}: ${error.message}`);
      } else {
        results.inserted++;
      }
    } catch (e: any) {
      results.errors.push(`${article.id}: ${e.message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    inserted: results.inserted,
    skipped: results.skipped,
    errors: results.errors,
    total: articles.length,
  });
}

// GET — health check so PPP TV site can verify the endpoint is live
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${INGEST_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    endpoint: "/api/ingest",
    accepts: "POST { articles: IngestArticle[] } or { article: IngestArticle }",
    version: "1.0.0",
  });
}
