import { NextResponse } from "next/server";
import { getAllNews } from "@/lib/news";

export const revalidate = 300; // 5 minutes

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") || "50");
  const force = searchParams.get("force") === "1";

  const news = await getAllNews({ includeExternal: true, limit });
  const res = NextResponse.json({ items: news.slice(0, limit) });

  if (force) {
    res.headers.set("Cache-Control", "no-store");
  } else {
    res.headers.set("Cache-Control", "s-maxage=300, stale-while-revalidate=60");
  }

  return res;
}
