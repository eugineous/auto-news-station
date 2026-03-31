/**
 * /api/admin/pipeline
 * GET  — get pipeline status (paused, rate-limited, etc.)
 * POST — pause/resume pipeline, trigger emergency stop
 */
import { NextRequest, NextResponse } from "next/server";
import { alertPipelineHealth } from "@/lib/alerts";

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";

function isAuthed(req: NextRequest) {
  return req.headers.get("authorization") === "Bearer " + process.env.AUTOMATE_SECRET;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const r = await fetch(WORKER_URL + "/pipeline/status", {
      headers: { Authorization: "Bearer " + WORKER_SECRET },
      signal: AbortSignal.timeout(5000),
    });
    const d = await r.json() as any;
    return NextResponse.json(d);
  } catch {
    return NextResponse.json({ paused: false, rateLimited: false, error: "Worker unreachable" });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json() as any;
  const action = body.action as "pause" | "resume" | "emergency_stop";

  try {
    if (action === "pause" || action === "emergency_stop") {
      await fetch(WORKER_URL + "/pipeline/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + WORKER_SECRET },
        body: JSON.stringify({ reason: action }),
        signal: AbortSignal.timeout(5000),
      });
      alertPipelineHealth("degraded", `Pipeline ${action === "emergency_stop" ? "EMERGENCY STOPPED" : "paused"} by operator`).catch(() => {});
      return NextResponse.json({ ok: true, status: "paused" });
    }

    if (action === "resume") {
      await fetch(WORKER_URL + "/pipeline/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + WORKER_SECRET },
        signal: AbortSignal.timeout(5000),
      });
      alertPipelineHealth("ok", "Pipeline resumed by operator").catch(() => {});
      return NextResponse.json({ ok: true, status: "running" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
