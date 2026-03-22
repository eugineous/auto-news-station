import { NextRequest, NextResponse } from "next/server";

const PPPTV_URL = "https://ppptv-v2.vercel.app";

async function checkEndpoint(url: string, label: string) {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const ms = Date.now() - start;
    return { label, url, status: res.status, ok: res.ok, ms, error: null };
  } catch (e: any) {
    return { label, url, status: 0, ok: false, ms: Date.now() - start, error: e.message };
  }
}

export async function GET(req: NextRequest) {
  const checks = await Promise.all([
    checkEndpoint(PPPTV_URL, "Homepage"),
    checkEndpoint(`${PPPTV_URL}/api/news`, "News API"),
    checkEndpoint(`${PPPTV_URL}/news`, "News Page"),
    checkEndpoint(`${PPPTV_URL}/sitemap.xml`, "Sitemap"),
    checkEndpoint(`${PPPTV_URL}/robots.txt`, "Robots.txt"),
    checkEndpoint(`${PPPTV_URL}/api/trending`, "Trending API"),
  ]);

  const allOk = checks.every(c => c.ok);
  const avgMs = Math.round(checks.reduce((a, c) => a + c.ms, 0) / checks.length);

  // Score: 100 - deductions
  let score = 100;
  checks.forEach(c => {
    if (!c.ok) score -= 15;
    else if (c.ms > 3000) score -= 5;
    else if (c.ms > 1500) score -= 2;
  });
  score = Math.max(0, score);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    overall: allOk ? "healthy" : "degraded",
    score,
    avgResponseMs: avgMs,
    checks,
  });
}
