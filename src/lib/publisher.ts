import { SocialPost, PublishResult } from "./types";

const GRAPH_API = "https://graph.facebook.com/v19.0";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try { return await fn(); }
    catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      // Don't retry 4xx errors
      if (status && status >= 400 && status < 500) throw err;
      lastErr = err;
      if (attempt < maxRetries - 1) await sleep(2000);
    }
  }
  throw lastErr;
}

// Stage image in R2 via worker so IG/FB can fetch it (they block many CDNs)
async function stageImageInR2(imageBuffer: Buffer): Promise<string | null> {
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
  const workerSecret = process.env.WORKER_SECRET || "ppptvWorker2024";
  try {
    const res = await fetch(workerUrl + "/stage-image", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + workerSecret },
      body: JSON.stringify({ imageBuffer: imageBuffer.toString("base64") }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const d = await res.json() as any;
    return d?.url || null;
  } catch { return null; }
}

// Poll IG container status — faster intervals, fewer retries
async function waitForIGContainer(containerId: string, token: string): Promise<void> {
  // Poll every 3s for up to 45s total (15 attempts)
  for (let i = 0; i < 15; i++) {
    await sleep(3000);
    try {
      const res = await fetch(
        `${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${token}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const data = await res.json() as any;
      const status = data.status_code || data.status || "";
      if (status === "FINISHED") return;
      if (status === "ERROR" || status === "EXPIRED") throw new Error(`IG container failed: ${status}`);
      // IN_PROGRESS or empty — keep polling
    } catch (err: any) {
      if (err.message?.includes("failed:")) throw err;
    }
  }
  // Timed out — attempt publish anyway (often works)
  console.warn("[ig] container polling timed out — attempting publish anyway");
}

// Post first comment (hashtags) after publish
async function postFirstComment(mediaId: string, comment: string, token: string): Promise<void> {
  try {
    await fetch(`${GRAPH_API}/${mediaId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: comment, access_token: token }),
      signal: AbortSignal.timeout(10000),
    });
  } catch { /* non-fatal */ }
}

// ── Instagram image post ──────────────────────────────────────────────────────
async function publishToInstagram(
  post: SocialPost,
  imageBuffer: Buffer,
  stagedUrl?: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  if (!token || !accountId) return { success: false, error: "Instagram tokens not configured" };

  // Use staged R2 URL if available, otherwise stage now
  let imageUrl = stagedUrl;
  if (!imageUrl) {
    imageUrl = await stageImageInR2(imageBuffer) ?? undefined;
  }
  if (!imageUrl) return { success: false, error: "Could not stage image for Instagram" };

  try {
    // Create media container
    const containerRes = await withRetry(() =>
      fetch(`${GRAPH_API}/${accountId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl, caption: post.caption, access_token: token }),
        signal: AbortSignal.timeout(20000),
      })
    );
    const container = await containerRes.json() as any;
    if (!containerRes.ok || container.error) throw new Error(container?.error?.message ?? "IG container creation failed");

    await waitForIGContainer(container.id, token);

    // Publish
    const publishRes = await withRetry(() =>
      fetch(`${GRAPH_API}/${accountId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: container.id, access_token: token }),
        signal: AbortSignal.timeout(20000),
      })
    );
    const published = await publishRes.json() as any;
    if (!publishRes.ok || published.error) throw new Error(published?.error?.message ?? "IG publish failed");

    // Post hashtags as first comment
    if (post.firstComment && published.id) {
      setTimeout(() => postFirstComment(published.id, post.firstComment!, token), 3000);
    }

    return { success: true, postId: published.id };
  } catch (err: any) {
    console.error("[ig] error:", err?.message);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

// ── Facebook image post ───────────────────────────────────────────────────────
async function publishToFacebook(
  post: SocialPost,
  imageBuffer: Buffer,
  stagedUrl?: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;
  if (!token || !pageId) return { success: false, error: "Facebook tokens not configured" };

  try {
    const fbCaption = post.articleUrl ? post.caption + "\n\n🔗 " + post.articleUrl : post.caption;

    // Prefer staged URL (faster, avoids multipart upload)
    if (stagedUrl) {
      const res = await withRetry(() =>
        fetch(`${GRAPH_API}/${pageId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: stagedUrl, caption: fbCaption, access_token: token }),
          signal: AbortSignal.timeout(20000),
        })
      );
      const data = await res.json() as any;
      if (!res.ok || data.error) throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
      return { success: true, postId: data.post_id || data.id };
    }

    // Fallback: multipart upload
    const blob = new Blob(
      [imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength) as ArrayBuffer],
      { type: "image/jpeg" }
    );
    const form = new FormData();
    form.append("source", blob, "image.jpg");
    form.append("caption", fbCaption);
    form.append("access_token", token);
    const res = await withRetry(() => fetch(`${GRAPH_API}/${pageId}/photos`, { method: "POST", body: form, signal: AbortSignal.timeout(30000) } as any));
    const data = await res.json() as any;
    if (!res.ok || data.error) throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
    return { success: true, postId: data.post_id || data.id };
  } catch (err: any) {
    console.error("[fb] error:", err?.message);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

// ── Main publish — stages image once, posts to both platforms in parallel ─────
export async function publish(
  posts: { ig?: SocialPost; fb?: SocialPost },
  imageBuffer: Buffer,
  _videoBuffer?: Buffer,
  _coverImageUrl?: string
): Promise<PublishResult> {
  // Stage image once in R2 — both IG and FB can use the same URL
  const stagedUrl = await stageImageInR2(imageBuffer) ?? undefined;

  const [instagram, facebook] = await Promise.all([
    posts.ig
      ? publishToInstagram(posts.ig, imageBuffer, stagedUrl)
      : Promise.resolve({ success: false, error: "skipped" }),
    posts.fb
      ? publishToFacebook(posts.fb, imageBuffer, stagedUrl)
      : Promise.resolve({ success: false, error: "skipped" }),
  ]);
  return { instagram, facebook };
}

// ── Story posting ─────────────────────────────────────────────────────────────
export async function publishStories(
  imageBuffer: Buffer,
  workerUrl: string,
  workerSecret: string
): Promise<{ igStory: { success: boolean; error?: string }; fbStory: { success: boolean; error?: string } }> {
  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const fbToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const fbPageId = process.env.FACEBOOK_PAGE_ID;

  // Stage image in R2
  let stagedUrl: string | null = null;
  try {
    const stageRes = await fetch(workerUrl + "/stage-image", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + workerSecret },
      body: JSON.stringify({ imageBuffer: imageBuffer.toString("base64") }),
      signal: AbortSignal.timeout(15000),
    });
    if (stageRes.ok) {
      const d = await stageRes.json() as any;
      stagedUrl = d?.url || null;
    }
  } catch { /* non-fatal */ }

  if (!stagedUrl) {
    return {
      igStory: { success: false, error: "Image staging failed" },
      fbStory: { success: false, error: "Image staging failed" },
    };
  }

  const [igStory, fbStory] = await Promise.all([
    // IG Story
    (async () => {
      if (!igToken || !igAccountId) return { success: false, error: "IG credentials missing" };
      try {
        const createRes = await fetch(`${GRAPH_API}/${igAccountId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: stagedUrl, media_type: "STORIES", access_token: igToken }),
          signal: AbortSignal.timeout(20000),
        });
        const createData = await createRes.json() as any;
        if (!createRes.ok || createData.error) throw new Error(createData.error?.message || "IG story container failed");
        await sleep(3000);
        const publishRes = await fetch(`${GRAPH_API}/${igAccountId}/media_publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creation_id: createData.id, access_token: igToken }),
          signal: AbortSignal.timeout(20000),
        });
        const publishData = await publishRes.json() as any;
        if (!publishRes.ok || publishData.error) throw new Error(publishData.error?.message || "IG story publish failed");
        return { success: true };
      } catch (err: any) { return { success: false, error: err.message }; }
    })(),
    // FB Story
    (async () => {
      if (!fbToken || !fbPageId) return { success: false, error: "FB credentials missing" };
      try {
        const res = await fetch(`${GRAPH_API}/${fbPageId}/photo_stories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: stagedUrl, access_token: fbToken }),
          signal: AbortSignal.timeout(20000),
        });
        const data = await res.json() as any;
        if (!res.ok || data.error) throw new Error(data.error?.message || "FB story failed");
        return { success: true };
      } catch (err: any) { return { success: false, error: err.message }; }
    })(),
  ]);

  return { igStory, fbStory };
}
