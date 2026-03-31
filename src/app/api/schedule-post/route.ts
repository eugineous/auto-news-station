import { NextRequest, NextResponse } from "next/server";

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";

export async function POST(req: NextRequest) {
  const body = await req.json() as any;
  const { url, headline, caption, category, scheduledAt } = body;
  if (!url || !headline || !caption || !scheduledAt) {
    return NextResponse.json({ error: "url, headline, caption, scheduledAt required" }, { status: 400 });
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try {
    const r = await fetch(WORKER_URL + "/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + WORKER_SECRET },
      body: JSON.stringify({ url, headline, caption, category: category || "GENERAL", scheduledAt, id }),
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json() as any;
    if (!r.ok) return NextResponse.json({ error: d.error || "Worker error" }, { status: r.status });
    return NextResponse.json({ ok: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const r = await fetch(WORKER_URL + "/schedule", {
      headers: { Authorization: "Bearer " + WORKER_SECRET },
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json() as any;
    return NextResponse.json(d);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as any;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const r = await fetch(WORKER_URL + "/schedule/" + id, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + WORKER_SECRET },
      signal: AbortSignal.timeout(8000),
    });
    return NextResponse.json({ ok: r.ok });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
