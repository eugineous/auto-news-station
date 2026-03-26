import { NextResponse } from "next/server";
import { mockFeed } from "@/lib/cockpit/data";

export async function GET() {
  return NextResponse.json({ feeds: mockFeed });
}
