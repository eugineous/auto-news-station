import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const channelId = req.nextUrl.searchParams.get("channelId");
  if (!channelId) {
    return NextResponse.json({ error: "channelId is required" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const r = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/2.0)" },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    if (!r.ok) {
      return NextResponse.json({ error: "YouTube feed unavailable" }, { status: 502 });
    }
    const xml = await r.text();
    return new NextResponse(xml, {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  } catch {
    clearTimeout(timeout);
    return NextResponse.json({ error: "Failed to fetch YouTube feed" }, { status: 502 });
  }
}
