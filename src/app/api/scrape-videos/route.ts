import { NextRequest, NextResponse } from "next/server";
import { fetchAllVideoSources } from "@/lib/video-sources";

export const maxDuration = 60;

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
  try {
    const videos = await fetchAllVideoSources();
    return NextResponse.json({ videos, count: videos.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
