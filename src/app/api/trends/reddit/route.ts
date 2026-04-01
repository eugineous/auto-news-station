import { NextResponse } from "next/server";

export const maxDuration = 15;

const SUBREDDITS = ["Kenya", "AfricanMusic", "entertainment", "Music", "worldnews"];

export async function GET() {
  const trends: any[] = [];
  const now = new Date().toISOString();

  await Promise.allSettled(SUBREDDITS.map(async (sub) => {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=10`, {
        headers: { "User-Agent": "PPPTVBot/2.0 (news aggregator)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const data = await res.json() as any;
      for (const post of data?.data?.children || []) {
        const p = post.data;
        if (!p.title || p.stickied) continue;
        trends.push({
          id: `reddit:${p.id}`,
          title: p.title,
          source: "reddit",
          volume: p.score || 0,
          category: sub === "Kenya" ? "NEWS" : sub === "AfricanMusic" ? "MUSIC" : "ENTERTAINMENT",
          url: `https://reddit.com${p.permalink}`,
          description: p.selftext?.slice(0, 120) || `r/${sub} · ${p.num_comments} comments`,
          fetchedAt: now,
        });
      }
    } catch {}
  }));

  trends.sort((a, b) => (b.volume || 0) - (a.volume || 0));
  return NextResponse.json({ trends: trends.slice(0, 20) });
}
