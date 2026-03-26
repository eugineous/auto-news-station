import { NextResponse } from "next/server";
import { stats } from "@/lib/cockpit/data";

export async function GET() {
  return NextResponse.json({ stats });
}
