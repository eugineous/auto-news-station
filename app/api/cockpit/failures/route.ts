import { NextResponse } from "next/server";
import { mockPosts } from "@/lib/cockpit/data";

export async function GET() {
  const failed = mockPosts.filter((p) => p.status === "failed" || p.failures?.length);
  return NextResponse.json({ failures: failed });
}
