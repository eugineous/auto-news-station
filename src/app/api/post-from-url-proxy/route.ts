import { NextRequest, NextResponse } from "next/server";

// This proxy adds the AUTOMATE_SECRET server-side so it's never exposed to the browser.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const secret = process.env.AUTOMATE_SECRET;

  // Build the base URL — works on Vercel and locally
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;

  if (!secret) {
    // No secret configured — call post-from-url directly without auth check
    // This allows the cockpit/compose to work even without AUTOMATE_SECRET set
    const res = await fetch(`${baseUrl}/api/post-from-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(115000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  }

  const res = await fetch(`${baseUrl}/api/post-from-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(115000),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
