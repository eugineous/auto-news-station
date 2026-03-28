import { NextRequest, NextResponse } from 'next/server';

const WORKER = process.env.CLOUDFLARE_WORKER_URL || 'https://auto-ppp-tv.euginemicah.workers.dev';
const SECRET = process.env.WORKER_SECRET || 'ppptvWorker2024';

export async function GET(_req: NextRequest) {
  try {
    const r = await fetch(WORKER + '/post-log?limit=50', {
      headers: { Authorization: 'Bearer ' + SECRET },
      signal: AbortSignal.timeout(5000),
    });
    const data = await r.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ log: [], error: e.message }, { status: 500 });
  }
}