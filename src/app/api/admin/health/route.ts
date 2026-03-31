import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const GRAPH_API = "https://graph.facebook.com/v19.0";

async function checkMeta(): Promise<{ ok: boolean; latencyMs: number; tokenExpiresIn?: number; error?: string }> {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!token) return { ok: false, latencyMs: 0, error: "FB token not configured" };
  const start = Date.now();
  try {
    // Check token expiry via debug_token
    if (appId && appSecret) {
      const r = await fetch(
        `${GRAPH_API}/debug_token?input_token=${token}&access_token=${appId}|${appSecret}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const d = await r.json() as any;
      const latencyMs = Date.now() - start;
      if (d.data?.is_valid === false) return { ok: false, latencyMs, error: "Token invalid" };
      const expiresAt = d.data?.expires_at;
      const tokenExpiresIn = expiresAt ? Math.floor((expiresAt * 1000 - Date.now()) / 86400000) : undefined;
      return { ok: true, latencyMs, tokenExpiresIn };
    }
    // Fallback: just ping the API
    const r = await fetch(`${GRAPH_API}/me?access_token=${token}`, { signal: AbortSignal.timeout(8000) });
    return { ok: r.ok, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

async function checkGemini(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, latencyMs: 0, error: "Not configured" };
  const start = Date.now();
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    return { ok: r.ok, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

async function checkWorker(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const url = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
  const start = Date.now();
  try {
    const r = await fetch(url + "/health", { signal: AbortSignal.timeout(8000) });
    return { ok: r.ok, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

async function checkR2(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const url = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
  const secret = process.env.WORKER_SECRET || "ppptvWorker2024";
  const start = Date.now();
  try {
    const r = await fetch(url + "/r2-health", {
      headers: { Authorization: "Bearer " + secret },
      signal: AbortSignal.timeout(8000),
    });
    return { ok: r.ok, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== "Bearer " + process.env.AUTOMATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [meta, gemini, worker, r2] = await Promise.all([
    checkMeta(), checkGemini(), checkWorker(), checkR2(),
  ]);

  const allOk = meta.ok && gemini.ok && worker.ok;
  const status = allOk ? "ok" : (meta.ok || gemini.ok) ? "degraded" : "down";

  // Token expiry warning
  const warnings: string[] = [];
  if (meta.tokenExpiresIn !== undefined && meta.tokenExpiresIn < 7) {
    warnings.push(`Meta token expires in ${meta.tokenExpiresIn} days — renew now!`);
  }

  return NextResponse.json({
    status,
    warnings,
    checkedAt: new Date().toISOString(),
    dependencies: {
      metaGraphApi: meta,
      geminiApi: gemini,
      cloudflareWorker: worker,
      r2Storage: r2,
      xPosting: {
        ok: !!(process.env.X_USERNAME && process.env.X_PASSWORD),
        latencyMs: 0,
        error: (!process.env.X_USERNAME || !process.env.X_PASSWORD) ? "X credentials not configured" : undefined,
      },
    },
  });
}
