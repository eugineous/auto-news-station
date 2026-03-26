import { NextResponse } from "next/server";
import { heartbeat, stats } from "@/lib/cockpit/data";

export async function GET() {
  return NextResponse.json({ heartbeat, stats });
}
