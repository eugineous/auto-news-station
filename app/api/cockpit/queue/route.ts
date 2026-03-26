import { NextResponse } from "next/server";
import { mockPosts } from "@/lib/cockpit/data";

export async function GET() {
  return NextResponse.json({ queue: mockPosts });
}
