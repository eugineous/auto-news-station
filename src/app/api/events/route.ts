export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const WORKER = process.env.CLOUDFLARE_WORKER_URL || 'https://auto-ppp-tv.euginemicah.workers.dev';
const SECRET = process.env.WORKER_SECRET || 'ppptvWorker2024';

async function fetchLog(): Promise<unknown[]> {
  try {
    const r = await fetch(WORKER + '/post-log?limit=50', {
      headers: { Authorization: 'Bearer ' + SECRET },
      signal: AbortSignal.timeout(5000),
    });
    const data = await r.json() as { log?: unknown[] };
    return Array.isArray(data.log) ? data.log : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const stream = new ReadableStream({
    async start(controller) {
      const encode = (obj: unknown) =>
        new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);

      let lastLog = await fetchLog();
      try {
        controller.enqueue(encode({ type: 'log', log: lastLog }));
      } catch {
        return;
      }

      const interval = setInterval(async () => {
        const newLog = await fetchLog();
        if (newLog.length !== lastLog.length) {
          lastLog = newLog;
          try {
            controller.enqueue(encode({ type: 'log', log: newLog }));
          } catch {
            clearInterval(interval);
          }
        }
      }, 15000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
