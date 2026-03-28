import { NextRequest, NextResponse } from "next/server";
import { fetchAllVideoSources } from "@/lib/video-sources";

const PPPTV_NEWS_API = "https://ppptv-v2.vercel.app/api/news";

export async function GET() {
  try {
    const res = await fetch(PPPTV_NEWS_API, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: "News API unreachable", articles: [], categories: {} });
    const data = await res.json();
    const articles = data.articles || [];
    const categories: Record<string, number> = {};
    articles.forEach((a: any) => {
      categories[a.category] = (categories[a.category] || 0) + 1;
    });
    return NextResponse.json({
      total: articles.length,
      categories,
      latest: articles.slice(0, 10),
      fetchedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, articles: [], categories: {} });
  }
}

// POST — scrape all video sources and return the list for the composer UI
export async function POST(_req: NextRequest) {
  try {
    const videos = await fetchAllVideoSources();
    return NextResponse.json({ videos, total: videos.length, fetchedAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, videos: [] }, { status: 500 });
  }
}
