import { NextRequest, NextResponse } from "next/server";
import { fetchAllVideoSources } from "@/lib/video-sources";
import { fetchViralTikTokVideos } from "@/lib/viral-intelligence";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== "Bearer ppptvWorker2024") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [allVideos, viralVideos] = await Promise.all([
    fetchAllVideoSources().catch(e => ({ error: e.message })),
    fetchViralTikTokVideos(["nairobi viral", "celebrity news today"]).catch(e => ({ error: e.message })),
  ]);

  return NextResponse.json({
    allVideos: Array.isArray(allVideos)
      ? { count: allVideos.length, samples: allVideos.slice(0, 3).map(v => ({ id: v.id, title: v.title, source: v.sourceName, type: v.sourceType, hasDirectUrl: !!v.directVideoUrl })) }
      : allVideos,
    viralVideos: Array.isArray(viralVideos)
      ? { count: viralVideos.length, samples: viralVideos.slice(0, 3).map(v => ({ id: v.id, title: v.title, source: v.sourceName, playCount: v.playCount })) }
      : viralVideos,
  });
}
