/**
 * /api/admin/breaking
 * GET — check for breaking news in the last 30 minutes
 * POST — trigger immediate post of a breaking story
 */
import { NextRequest, NextResponse } from "next/server";
import { checkBreakingNews, getKenyaTrending } from "@/lib/breaking-news";
import { alertBreakingNews } from "@/lib/alerts";

export const maxDuration = 30;

function isAuthed(req: NextRequest) {
  return req.headers.get("authorization") === "Bearer " + process.env.AUTOMATE_SECRET;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [breaking, trending] = await Promise.all([checkBreakingNews(), getKenyaTrending()]);
  return NextResponse.json({ breaking, trending, checkedAt: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json() as any;
  const { title, url, source } = body;
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  // Alert via Telegram
  await alertBreakingNews(title || "Breaking Story", source || "Unknown", url);

  // Trigger immediate post via automate pipeline
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;

  const postRes = await fetch(`${baseUrl}/api/post-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      headline: (title || "BREAKING NEWS").toUpperCase().slice(0, 120),
      caption: `BREAKING: ${title}\n\nFollow @PPPTVKenya for live updates.\n\nSource: ${source || url}`,
      category: "GENERAL",
      isBreaking: true,
    }),
  });

  // Drain SSE stream
  let finalResult: any = null;
  if (postRes.body) {
    const reader = postRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try { const evt = JSON.parse(line.slice(6)); if (evt.done) finalResult = evt; } catch {}
      }
    }
  }

  return NextResponse.json({ ok: true, result: finalResult });
}
