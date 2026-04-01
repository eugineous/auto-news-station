/**
 * /api/proxy-feed
 * Proxies RSS/XML feeds server-side to avoid CORS issues in the browser.
 */
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/2.0)", "Accept": "application/rss+xml, application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status });
    const text = await res.text();
    return new NextResponse(text, {
      headers: { "Content-Type": "application/xml", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=120" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
