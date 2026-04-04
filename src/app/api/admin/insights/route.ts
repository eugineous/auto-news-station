import { NextRequest, NextResponse } from "next/server";
import { getPostLog } from "@/lib/supabase";

export const maxDuration = 30;

const GRAPH_API = "https://graph.facebook.com/v19.0";

export async function GET(_req: NextRequest) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "INSTAGRAM_ACCESS_TOKEN not set" }, { status: 500 });

  try {
    // Get recent successful IG posts
    const log = await getPostLog(30, 1);
    const igPosts = log.filter((p: any) => p.ig_success && p.ig_post_id);

    const insights = await Promise.allSettled(
      igPosts.slice(0, 20).map(async (p: any) => {
        try {
          const res = await fetch(
            `${GRAPH_API}/${p.ig_post_id}/insights?metric=impressions,reach,plays,saved,shares,comments,likes&access_token=${token}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (!res.ok) return null;
          const d = await res.json() as any;
          const metrics: Record<string, number> = {};
          for (const m of d.data || []) {
            metrics[m.name] = m.values?.[0]?.value ?? m.value ?? 0;
          }
          const reach = metrics.reach || 0;
          const impressions = metrics.impressions || 0;
          const plays = metrics.plays || 0;
          const saves = metrics.saved || 0;
          const shares = metrics.shares || 0;
          const comments = metrics.comments || 0;
          const likes = metrics.likes || 0;
          const engagementRate = reach > 0
            ? Math.round(((likes + comments + saves + shares) / reach) * 1000) / 10
            : 0;
          return {
            id: p.ig_post_id,
            impressions, reach, plays, saves, shares, comments, likes, engagementRate,
          };
        } catch { return null; }
      })
    );

    const posts = insights
      .filter(r => r.status === "fulfilled" && r.value !== null)
      .map(r => (r as PromiseFulfilledResult<any>).value);

    return NextResponse.json({ posts, fetched: posts.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
