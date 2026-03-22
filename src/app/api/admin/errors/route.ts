import { NextRequest, NextResponse } from "next/server";

// In-memory error store (persists per serverless instance)
// For production, swap with KV/DB
const errorStore: Array<{
  id: string;
  timestamp: string;
  level: "error" | "warn" | "info";
  source: string;
  message: string;
  details?: string;
}> = [];

export async function GET() {
  return NextResponse.json({ errors: errorStore.slice().reverse().slice(0, 200) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    level: body.level || "error",
    source: body.source || "unknown",
    message: body.message || "Unknown error",
    details: body.details,
  };
  errorStore.push(entry);
  if (errorStore.length > 500) errorStore.splice(0, errorStore.length - 500);
  return NextResponse.json({ ok: true, id: entry.id });
}

export async function DELETE() {
  errorStore.splice(0, errorStore.length);
  return NextResponse.json({ ok: true });
}
