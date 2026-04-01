import { NextRequest, NextResponse } from "next/server";
import { getPostLog, getTodayPostCount, getCategoryBreakdown, getPostsByDay } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const days = parseInt(searchParams.get("days") || "7");
    const view = searchParams.get("view");

    if (view === "analytics") {
      const [byDay, byCategory, todayCount] = await Promise.all([
        getPostsByDay(days),
        getCategoryBreakdown(days),
        getTodayPostCount(),
      ]);
      return NextResponse.json({ byDay, byCategory, todayCount });
    }

    const log = await getPostLog(limit, days);
    const todayCount = await getTodayPostCount();
    return NextResponse.json({ log, todayCount });
  } catch (e: any) {
    return NextResponse.json({ log: [], error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Legacy: worker still calls this to log posts — now handled by Supabase directly
  // Keep for backward compat but just return ok
  return NextResponse.json({ ok: true });
}
