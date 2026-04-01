import { NextResponse } from "next/server";
import { fetchAllVideoSources } from "@/lib/video-sources";

export const maxDuration = 60;

export async function GET() {
  try {
    const videos = await fetchAllVideoSources();
    return NextResponse.json({
      total: videos.length,
      byType: videos.reduce<Record<string,number>>((a,v) => { a[v.sourceType]=(a[v.sourceType]||0)+1; return a; }, {}),
      sample: videos.slice(0, 5).map(v => ({
        id: v.id,
        title: v.title.slice(0, 60),
        sourceType: v.sourceType,
        sourceName: v.sourceName,
        hasDirectUrl: !!v.directVideoUrl,
        directUrlPreview: v.directVideoUrl?.slice(0, 80),
        urlPreview: v.url.slice(0, 80),
        publishedAt: v.publishedAt,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
