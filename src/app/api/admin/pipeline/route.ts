import { NextRequest, NextResponse } from "next/server";

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";

export async function POST(req: NextRequest) {
  try {
    const { action } = await req.json();

    if (action === "clear-cache") {
      const r = await fetch(`${WORKER_URL}/clear-cache`, {
        method: "POST",
        headers: { Authorization: `Bearer ${WORKER_SECRET}` },
        signal: AbortSignal.timeout(10000),
      });
      const d = await r.json() as any;
      return NextResponse.json({ cleared: d.cleared || 0 });
    }

    if (action === "trigger") {
      fetch(`${WORKER_URL}/trigger`, {
        headers: { Authorization: `Bearer ${WORKER_SECRET}` },
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
      return NextResponse.json({ triggered: true });
    }

    if (action === "pause") {
      await fetch(`${WORKER_URL}/pipeline/pause`, {
        method: "POST",
        headers: { Authorization: `Bearer ${WORKER_SECRET}` },
        signal: AbortSignal.timeout(5000),
      });
      return NextResponse.json({ ok: true, status: "paused" });
    }

    if (action === "resume") {
      await fetch(`${WORKER_URL}/pipeline/resume`, {
        method: "POST",
        headers: { Authorization: `Bearer ${WORKER_SECRET}` },
        signal: AbortSignal.timeout(5000),
      });
      return NextResponse.json({ ok: true, status: "running" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
