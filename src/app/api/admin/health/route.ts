import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";

async function checkMeta(): Promise<{ ok: boolean; latencyMs: number; error?: string; tokenExpiresIn?: number }> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  if (!token || !accountId) return { ok: false, latencyMs: 0, error: "Credentials not configured" };
  const start = Date.now();
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${accountId}?fields=id,name&access_token=${token}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const latencyMs = Date.now() - start;
    const data = await res.json() as any;
    if (!res.ok || data.error) return { ok: false, latencyMs, error: data.error?.message || `HTTP ${res.status}` };
    return { ok: true, latencyMs };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

async function checkGemini(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, latencyMs: 0, error: "GEMINI_API_KEY not set" };
  const start = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const d = await res.json() as any;
      return { ok: false, latencyMs, error: d.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true, latencyMs };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

async function checkCloudflareWorker(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const res = await fetch(`${WORKER_URL}/health`, {
      headers: { Authorization: `Bearer ${WORKER_SECRET}` },
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) return { ok: false, latencyMs, error: `HTTP ${res.status}` };
    return { ok: true, latencyMs };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

async function checkR2(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const res = await fetch(`${WORKER_URL}/r2-health`, {
      headers: { Authorization: `Bearer ${WORKER_SECRET}` },
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) return { ok: false, latencyMs, error: `HTTP ${res.status}` };
    const d = await res.json() as any;
    return { ok: d.ok === true, latencyMs, error: d.error };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

async function checkXPosting(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const hasKey = !!(process.env.X_API_KEY && process.env.X_API_SECRET &&
    process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_SECRET);
  if (!hasKey) return { ok: false, latencyMs: 0, error: "X credentials not configured" };
  // Just verify credentials are present — live API check would consume rate limit
  return { ok: true, latencyMs: 0 };
}

export async function GET(req: NextRequest) {
  const [meta, gemini, worker, r2, x] = await Promise.all([
    checkMeta(),
    checkGemini(),
    checkCloudflareWorker(),
    checkR2(),
    checkXPosting(),
  ]);

  const deps = {
    metaGraphApi: meta,
    geminiApi: gemini,
    cloudflareWorker: worker,
    r2Storage: r2,
    xPosting: x,
  };

  const allOk = Object.values(deps).every(d => d.ok);
  const anyDown = Object.values(deps).some(d => !d.ok);
  const status = allOk ? "ok" : anyDown ? "degraded" : "ok";

  const warnings: string[] = [];
  if (!meta.ok) warnings.push(`Meta Graph API: ${meta.error}`);
  if (!gemini.ok) warnings.push(`Gemini AI: ${gemini.error}`);
  if (!worker.ok) warnings.push(`Cloudflare Worker: ${worker.error}`);
  if (!r2.ok) warnings.push(`R2 Storage: ${r2.error}`);

  return NextResponse.json({ status, dependencies: deps, warnings });
}
