import { SocialPost, PublishResult } from "./types";

const GRAPH_API = "https://graph.facebook.com/v19.0";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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

async function uploadImageToFB(imageBuffer: Buffer, pageId: string, accessToken: string, published = false): Promise<string> {
  const blob = new Blob(
    [imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength) as ArrayBuffer],
    { type: "image/jpeg" }
  );
  const form = new FormData();
  form.append("source", blob, "image.jpg");
  form.append("published", String(published));
  form.append("access_token", accessToken);
  const res = await fetch(`${GRAPH_API}/${pageId}/photos`, { method: "POST", body: form });
  const data = await res.json() as any;
  if (!res.ok || data.error) throw new Error(data?.error?.message ?? `Upload failed: HTTP ${res.status}`);
  return data.id as string;
}

async function waitForIGContainer(containerId: string, token: string): Promise<void> {
  const maxAttempts = 24;
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(5000);
    try {
      const res = await fetch(`${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${token}`);
      const data = await res.json() as any;
      const status = data.status_code || data.status || "";
      console.log(`[ig] container ${containerId} status: ${status} (attempt ${i + 1})`);
      if (status === "FINISHED") return;
      if (status === "ERROR" || status === "EXPIRED") throw new Error(`IG container failed: ${status}`);
    } catch (err: any) {
      if (err.message.includes("failed:")) throw err;
    }
  }
  console.warn("[ig] container polling timed out — attempting publish anyway");
}

// ── Video posting to Instagram ───────────────────────────────────────────────
// Accepts a pre-staged FB video URL
async function publishVideoToInstagram(
  post: SocialPost,
  videoUrl: string,
  coverUrl?: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  if (!token || !accountId) return { success: false, error: "Instagram tokens not configured" };

  try {
    const containerRes = await withRetry(() =>
      fetch(`${GRAPH_API}/${accountId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "REELS",
          video_url: videoUrl,
          caption: post.caption,
          share_to_feed: true,
          ...(coverUrl ? { cover_url: coverUrl } : {}),
          access_token: token,
        }),
      })
    );
    const container = await containerRes.json() as any;
    if (!containerRes.ok || container.error) throw new Error(container?.error?.message ?? "IG video container failed");

    await waitForIGContainer(container.id, token);

    const publishRes = await withRetry(() =>
      fetch(`${GRAPH_API}/${accountId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: container.id, access_token: token }),
      })
    );
    const published = await publishRes.json() as any;
    if (!publishRes.ok || published.error) throw new Error(published?.error?.message ?? "IG video publish failed");
    return { success: true, postId: published.id };
  } catch (err: any) {
    console.error("[ig-video] error:", err?.message);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

// ── Image posting to Instagram ───────────────────────────────────────────────
async function publishToInstagram(post: SocialPost, imageBuffer: Buffer): Promise<{ success: boolean; postId?: string; error?: string }> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const fbToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const fbPageId = process.env.FACEBOOK_PAGE_ID;
  if (!token || !accountId || !fbToken || !fbPageId) return { success: false, error: "Instagram/Facebook tokens not configured" };

  try {
    const fbPhotoId = await withRetry(() => uploadImageToFB(imageBuffer, fbPageId, fbToken, false));
    const photoRes = await fetch(`${GRAPH_API}/${fbPhotoId}?fields=images&access_token=${fbToken}`);
    const photoData = await photoRes.json() as any;
    const hostedUrl: string = photoData.images?.[0]?.source ?? "";
    if (!hostedUrl) throw new Error("Could not get hosted image URL from FB");
    await sleep(4000);

    const containerRes = await withRetry(() =>
      fetch(`${GRAPH_API}/${accountId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: hostedUrl, caption: post.caption, access_token: token }),
      })
    );
    const container = await containerRes.json() as any;
    if (!containerRes.ok || container.error) throw new Error(container?.error?.message ?? "IG container creation failed");

    await waitForIGContainer(container.id, token);

    const publishRes = await withRetry(() =>
      fetch(`${GRAPH_API}/${accountId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: container.id, access_token: token }),
      })
    );
    const published = await publishRes.json() as any;
    if (!publishRes.ok || published.error) throw new Error(published?.error?.message ?? "IG publish failed");
    return { success: true, postId: published.id };
  } catch (err: any) {
    console.error("[ig] error:", err?.message);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

// ── Image posting to Facebook ────────────────────────────────────────────────
async function publishToFacebook(post: SocialPost, imageBuffer: Buffer): Promise<{ success: boolean; postId?: string; error?: string }> {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;
  if (!token || !pageId) return { success: false, error: "Facebook tokens not configured" };

  try {
    const blob = new Blob(
      [imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength) as ArrayBuffer],
      { type: "image/jpeg" }
    );
    const form = new FormData();
    form.append("source", blob, "image.jpg");
    const fbCaption = post.articleUrl ? post.caption + "\n\n\uD83D\uDD17 " + post.articleUrl : post.caption;
    form.append("caption", fbCaption);
    form.append("access_token", token);
    const res = await withRetry(() => fetch(`${GRAPH_API}/${pageId}/photos`, { method: "POST", body: form }));
    const data = await res.json() as any;
    if (!res.ok || data.error) throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
    return { success: true, postId: data.id };
  } catch (err: any) {
    console.error("[fb] error:", err?.message);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

export async function publish(
  posts: { ig?: SocialPost; fb?: SocialPost },
  imageBuffer: Buffer,
  videoBuffer?: Buffer,
  coverImageUrl?: string
): Promise<PublishResult> {
  if (videoBuffer) {
    // Stage video on FB first (unpublished) — this gives us a URL for IG
    // Then publish the same staged video to FB feed
    const fbToken = process.env.FACEBOOK_ACCESS_TOKEN;
    const fbPageId = process.env.FACEBOOK_PAGE_ID;

    let stagedVideoId: string | null = null;
    let stagedVideoUrl: string | null = null;

    if (fbToken && fbPageId) {
      try {
        const blob = new Blob(
          [videoBuffer.buffer.slice(videoBuffer.byteOffset, videoBuffer.byteOffset + videoBuffer.byteLength) as ArrayBuffer],
          { type: "video/mp4" }
        );
        const form = new FormData();
        form.append("source", blob, "video.mp4");
        form.append("published", "false");
        form.append("access_token", fbToken);
        const res = await fetch(`${GRAPH_API}/${fbPageId}/videos`, { method: "POST", body: form });
        const data = await res.json() as any;
        if (res.ok && !data.error) {
          stagedVideoId = data.id as string;
          // Poll for permalink
          for (let i = 0; i < 24; i++) {
            await sleep(5000);
            const infoRes = await fetch(`${GRAPH_API}/${stagedVideoId}?fields=permalink_url,status&access_token=${fbToken}`);
            const info = await infoRes.json() as any;
            console.log(`[fb-stage] video ${stagedVideoId} processing: ${info.status?.processing_progress ?? "?"}%`);
            if (info.permalink_url) {
              stagedVideoUrl = `https://www.facebook.com${info.permalink_url}`;
              break;
            }
          }
        }
      } catch (e: any) {
        console.error("[fb-stage] failed:", e?.message);
      }
    }

    // Post IG using the staged FB video URL
    const instagram = posts.ig && stagedVideoUrl
      ? await publishVideoToInstagram(posts.ig, stagedVideoUrl, coverImageUrl)
      : posts.ig
        ? { success: false, error: "FB video staging failed — no URL for IG" }
        : { success: false, error: "skipped" };

    // Publish the already-staged FB video to the feed
    let facebook: { success: boolean; postId?: string; error?: string } = { success: false, error: "skipped" };
    if (posts.fb && stagedVideoId && fbToken && fbPageId) {
      try {
        const fbCaption = posts.fb.articleUrl
          ? posts.fb.caption + "\n\n\uD83D\uDD17 " + posts.fb.articleUrl
          : posts.fb.caption;
        const pubRes = await fetch(`${GRAPH_API}/${stagedVideoId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ published: true, description: fbCaption, access_token: fbToken }),
        });
        const pubData = await pubRes.json() as any;
        if (pubRes.ok && !pubData.error) {
          facebook = { success: true, postId: stagedVideoId };
        } else {
          facebook = { success: false, error: pubData?.error?.message ?? "FB publish failed" };
        }
      } catch (e: any) {
        facebook = { success: false, error: e?.message };
      }
    } else if (posts.fb && !stagedVideoId) {
      facebook = { success: false, error: "FB video staging failed" };
    }

    return { instagram, facebook };
  }

  // Default: post as image
  const [instagram, facebook] = await Promise.all([
    posts.ig ? publishToInstagram(posts.ig, imageBuffer) : Promise.resolve({ success: false, error: "skipped" }),
    posts.fb ? publishToFacebook(posts.fb, imageBuffer) : Promise.resolve({ success: false, error: "skipped" }),
  ]);
  return { instagram, facebook };
}
