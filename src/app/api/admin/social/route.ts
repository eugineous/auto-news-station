import { NextRequest, NextResponse } from "next/server";

const IG_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || "";
const IG_ACCOUNT = process.env.INSTAGRAM_ACCOUNT_ID || "";
const FB_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN || "";
const FB_PAGE = process.env.FACEBOOK_PAGE_ID || "";

// GET /api/admin/social?platform=instagram&action=posts
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform");
  const action = searchParams.get("action");

  if (platform === "instagram" && action === "posts") {
    if (!IG_TOKEN || !IG_ACCOUNT) {
      return NextResponse.json({ error: "Instagram not configured", posts: [] });
    }
    try {
      const res = await fetch(
        `https://graph.instagram.com/${IG_ACCOUNT}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,permalink&limit=20&access_token=${IG_TOKEN}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const data = await res.json();
      return NextResponse.json({ posts: data.data || [], error: data.error?.message });
    } catch (e: any) {
      return NextResponse.json({ error: e.message, posts: [] });
    }
  }

  if (platform === "facebook" && action === "posts") {
    if (!FB_TOKEN || !FB_PAGE) {
      return NextResponse.json({ error: "Facebook not configured", posts: [] });
    }
    try {
      const res = await fetch(
        `https://graph.facebook.com/${FB_PAGE}/posts?fields=id,message,story,created_time,full_picture,permalink_url&limit=20&access_token=${FB_TOKEN}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const data = await res.json();
      return NextResponse.json({ posts: data.data || [], error: data.error?.message });
    } catch (e: any) {
      return NextResponse.json({ error: e.message, posts: [] });
    }
  }

  return NextResponse.json({ error: "Invalid params" }, { status: 400 });
}

// DELETE /api/admin/social  body: { platform, postId }
export async function DELETE(req: NextRequest) {
  const { platform, postId } = await req.json();

  if (platform === "instagram") {
    if (!IG_TOKEN) return NextResponse.json({ error: "Instagram not configured" }, { status: 400 });
    // Note: Instagram Graph API does not support deleting media via API for most account types
    // This is a placeholder - returns instructions
    return NextResponse.json({
      ok: false,
      note: "Instagram does not allow post deletion via API. Please delete manually at instagram.com",
      postId,
    });
  }

  if (platform === "facebook") {
    if (!FB_TOKEN) return NextResponse.json({ error: "Facebook not configured" }, { status: 400 });
    try {
      const res = await fetch(
        `https://graph.facebook.com/${postId}?access_token=${FB_TOKEN}`,
        { method: "DELETE", signal: AbortSignal.timeout(8000) }
      );
      const data = await res.json();
      return NextResponse.json({ ok: data.success || false, error: data.error?.message });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message });
    }
  }

  return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
}

// POST /api/admin/social  body: { platform, message, imageUrl }
export async function POST(req: NextRequest) {
  const { platform, message, imageUrl } = await req.json();

  if (platform === "facebook") {
    if (!FB_TOKEN || !FB_PAGE) return NextResponse.json({ error: "Facebook not configured" }, { status: 400 });
    try {
      const body: Record<string, string> = { message, access_token: FB_TOKEN };
      const endpoint = imageUrl
        ? `https://graph.facebook.com/${FB_PAGE}/photos`
        : `https://graph.facebook.com/${FB_PAGE}/feed`;
      if (imageUrl) body.url = imageUrl;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      return NextResponse.json({ ok: !!data.id, postId: data.id, error: data.error?.message });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message });
    }
  }

  return NextResponse.json({ error: "Manual Instagram posting: use the composer tab" }, { status: 400 });
}
