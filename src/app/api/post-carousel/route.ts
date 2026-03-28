import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

export const maxDuration = 180;

const GRAPH_API = "https://graph.facebook.com/v19.0";
const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try { return await fn(); }
    catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      if (status && status >= 400 && status < 500) throw err;
      lastErr = err;
      await sleep(Math.pow(2, attempt) * 1500);
    }
  }
  throw lastErr;
}

async function waitForContainer(id: string, token: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    try {
      const res = await fetch(`${GRAPH_API}/${id}?fields=status_code,status&access_token=${token}`);
      const d = await res.json() as any;
      const s = d.status_code || d.status || "";
      if (s === "FINISHED") return;
      if (s === "ERROR" || s === "EXPIRED") throw new Error(`Container failed: ${s}`);
    } catch (err: any) { if (err.message.includes("failed:")) throw err; }
  }
}

async function logPost(entry: object): Promise<void> {
  if (!WORKER_SECRET) return;
  try {
    await fetch(WORKER_URL + "/post-log", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
      body: JSON.stringify(entry),
      signal: AbortSignal.timeout(5000),
    });
  } catch {}
}

// Upload image buffer to FB (unpublished) and return hosted URL
async function uploadImageGetUrl(imageBase64: string, fbPageId: string, fbToken: string): Promise<string> {
  const imageBuffer = Buffer.from(imageBase64, "base64");
  const blob = new Blob(
    [imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength) as ArrayBuffer],
    { type: "image/jpeg" }
  );
  const form = new FormData();
  form.append("source", blob, "image.jpg");
  form.append("published", "false");
  form.append("access_token", fbToken);
  const res = await fetch(`${GRAPH_API}/${fbPageId}/photos`, { method: "POST", body: form });
  const data = await res.json() as any;
  if (!res.ok || data.error) throw new Error(data?.error?.message ?? "FB upload failed");
  // Get hosted URL
  await sleep(3000);
  const photoRes = await fetch(`${GRAPH_API}/${data.id}?fields=images&access_token=${fbToken}`);
  const photoData = await photoRes.json() as any;
  const url = photoData.images?.[0]?.source ?? "";
  if (!url) throw new Error("Could not get hosted image URL");
  return url;
}

export async function POST(req: NextRequest) {

  let body: {
    // items: array of { type: "image"|"video", base64?: string, url?: string }
    // First item is the cover image (required, must be image)
    items?: { type: "image" | "video"; base64?: string; url?: string }[];
    caption?: string;
    headline?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { items, caption, headline } = body;
  if (!items || items.length < 2) return NextResponse.json({ error: "Need at least 2 items (cover + 1 more)" }, { status: 400 });
  if (!caption) return NextResponse.json({ error: "caption is required" }, { status: 400 });
  if (items.length > 10) return NextResponse.json({ error: "Max 10 items in a carousel" }, { status: 400 });

  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const fbToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const fbPageId = process.env.FACEBOOK_PAGE_ID;

  if (!igToken || !igAccountId || !fbToken || !fbPageId) {
    return NextResponse.json({ error: "Social tokens not configured" }, { status: 500 });
  }

  try {
    // ── Instagram Carousel ──────────────────────────────────────────────
    // Create a child container for each item
    const childIds: string[] = [];

    for (const item of items) {
      let containerBody: Record<string, string>;

      if (item.type === "video" && item.url) {
        containerBody = {
          media_type: "VIDEO",
          video_url: item.url,
          is_carousel_item: "true",
          access_token: igToken,
        };
      } else if (item.type === "image") {
        // Upload to FB first to get a hosted URL
        if (!item.base64) throw new Error("Image item missing base64 data");
        const hostedUrl = await uploadImageGetUrl(item.base64, fbPageId, fbToken);
        containerBody = {
          image_url: hostedUrl,
          is_carousel_item: "true",
          access_token: igToken,
        };
      } else {
        throw new Error("Each item needs type=image with base64, or type=video with url");
      }

      const childRes = await withRetry(() =>
        fetch(`${GRAPH_API}/${igAccountId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(containerBody),
        })
      );
      const child = await childRes.json() as any;
      if (!childRes.ok || child.error) throw new Error(child?.error?.message ?? "IG child container failed");

      // Wait for video items to process
      if (item.type === "video") await waitForContainer(child.id, igToken);
      childIds.push(child.id);
    }

    // Create carousel container
    const carouselRes = await withRetry(() =>
      fetch(`${GRAPH_API}/${igAccountId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "CAROUSEL",
          children: childIds.join(","),
          caption,
          access_token: igToken,
        }),
      })
    );
    const carousel = await carouselRes.json() as any;
    if (!carouselRes.ok || carousel.error) throw new Error(carousel?.error?.message ?? "IG carousel container failed");

    await waitForContainer(carousel.id, igToken);

    // Publish carousel
    const publishRes = await withRetry(() =>
      fetch(`${GRAPH_API}/${igAccountId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: carousel.id, access_token: igToken }),
      })
    );
    const published = await publishRes.json() as any;
    if (!publishRes.ok || published.error) throw new Error(published?.error?.message ?? "IG carousel publish failed");

    const igResult = { success: true, postId: published.id };

    // ── Facebook Album (multiple photos) ────────────────────────────────
    // FB doesn't support carousel API the same way — post as multi-photo
    let fbResult: { success: boolean; postId?: string; error?: string } = { success: false, error: "skipped" };
    try {
      const attachedMedia: { media_fbid: string }[] = [];
      for (const item of items) {
        if (item.type === "image" && item.base64) {
          const imageBuffer = Buffer.from(item.base64, "base64");
          const blob = new Blob(
            [imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength) as ArrayBuffer],
            { type: "image/jpeg" }
          );
          const form = new FormData();
          form.append("source", blob, "image.jpg");
          form.append("published", "false");
          form.append("access_token", fbToken);
          const r = await fetch(`${GRAPH_API}/${fbPageId}/photos`, { method: "POST", body: form });
          const d = await r.json() as any;
          if (r.ok && !d.error) attachedMedia.push({ media_fbid: d.id });
        }
        // Video items skipped for FB album (FB video album API is different)
      }

      if (attachedMedia.length > 0) {
        const fbCaption = headline ? `${headline}\n\n${caption}` : caption;
        const feedRes = await fetch(`${GRAPH_API}/${fbPageId}/feed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: fbCaption, attached_media: attachedMedia, access_token: fbToken }),
        });
        const feedData = await feedRes.json() as any;
        if (feedRes.ok && !feedData.error) fbResult = { success: true, postId: feedData.id };
        else fbResult = { success: false, error: feedData?.error?.message ?? "FB album post failed" };
      }
    } catch (err: any) {
      fbResult = { success: false, error: err.message };
    }

    const postId = createHash("sha256").update(caption + Date.now()).digest("hex").slice(0, 16);
    await logPost({
      articleId: postId, title: headline || caption.slice(0, 80),
      url: "", category: "GENERAL",
      instagram: igResult, facebook: fbResult,
      postedAt: new Date().toISOString(), manualPost: true, postType: "carousel",
      itemCount: items.length,
    });

    return NextResponse.json({ success: true, instagram: igResult, facebook: fbResult });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
