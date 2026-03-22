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

// Upload image buffer as multipart to FB photos endpoint
async function uploadImageToFB(
  imageBuffer: Buffer,
  pageId: string,
  accessToken: string,
  published = false
): Promise<string> {
  const blob = new Blob(
    [imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength) as ArrayBuffer],
    { type: "image/jpeg" }
  );
  const form = new FormData();
  form.append("source", blob, "image.jpg");
  form.append("published", String(published));
  form.append("access_token", accessToken);

  const res = await fetch(`${GRAPH_API}/${pageId}/photos`, {
    method: "POST",
    body: form,
  });
  const data = await res.json() as any;
  if (!res.ok || data.error) {
    throw new Error(data?.error?.message ?? `Upload failed: HTTP ${res.status}`);
  }
  return data.id as string;
}

// Poll IG container until status is FINISHED (or timeout after 60s)
async function waitForIGContainer(containerId: string, token: string): Promise<void> {
  const maxAttempts = 12; // 12 × 5s = 60s max
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(5000); // wait 5s between polls
    try {
      const res = await fetch(
        `${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${token}`
      );
      const data = await res.json() as any;
      const status = data.status_code || data.status || "";
      console.log(`[ig] container ${containerId} status: ${status} (attempt ${i + 1})`);
      if (status === "FINISHED") return;
      if (status === "ERROR" || status === "EXPIRED") {
        throw new Error(`IG container failed with status: ${status}`);
      }
      // IN_PROGRESS or empty — keep polling
    } catch (err: any) {
      if (err.message.includes("failed with status")) throw err;
      // network error — keep trying
    }
  }
  // Timeout — try publishing anyway (sometimes status endpoint is unreliable)
  console.warn("[ig] container status polling timed out — attempting publish anyway");
}

async function publishToInstagram(
  post: SocialPost,
  imageBuffer: Buffer
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const fbToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const fbPageId = process.env.FACEBOOK_PAGE_ID;

  if (!token || !accountId || !fbToken || !fbPageId) {
    return { success: false, error: "Instagram/Facebook tokens not configured" };
  }

  try {
    // Step 1: Upload image to FB as unpublished to get a hosted URL
    const fbPhotoId = await withRetry(() =>
      uploadImageToFB(imageBuffer, fbPageId, fbToken, false)
    );

    // Step 2: Get the hosted image URL from FB
    const photoRes = await fetch(
      `${GRAPH_API}/${fbPhotoId}?fields=images&access_token=${fbToken}`
    );
    const photoData = await photoRes.json() as any;
    const hostedUrl: string = photoData.images?.[0]?.source ?? "";
    if (!hostedUrl) throw new Error("Could not get hosted image URL from FB");

    // Step 3: Create IG media container
    const containerRes = await withRetry(() =>
      fetch(`${GRAPH_API}/${accountId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: hostedUrl,
          caption: post.caption,
          access_token: token,
        }),
      })
    );
    const container = await containerRes.json() as any;
    if (!containerRes.ok || container.error) {
      throw new Error(container?.error?.message ?? "IG container creation failed");
    }

    // Step 4: WAIT for container to be ready (fixes "Media ID is not available")
    await waitForIGContainer(container.id, token);

    // Step 5: Publish the container
    const publishRes = await withRetry(() =>
      fetch(`${GRAPH_API}/${accountId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: container.id, access_token: token }),
      })
    );
    const published = await publishRes.json() as any;
    if (!publishRes.ok || published.error) {
      throw new Error(published?.error?.message ?? "IG publish failed");
    }

    return { success: true, postId: published.id };
  } catch (err: any) {
    console.error("[ig] error:", err?.message);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

async function publishToFacebook(
  post: SocialPost,
  imageBuffer: Buffer
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;

  if (!token || !pageId) {
    return { success: false, error: "Facebook tokens not configured" };
  }

  try {
    const blob = new Blob(
      [imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength) as ArrayBuffer],
      { type: "image/jpeg" }
    );
    const form = new FormData();
    form.append("source", blob, "image.jpg");
    form.append("caption", post.caption);
    form.append("access_token", token);

    const res = await withRetry(() =>
      fetch(`${GRAPH_API}/${pageId}/photos`, { method: "POST", body: form })
    );
    const data = await res.json() as any;
    if (!res.ok || data.error) {
      throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
    }

    return { success: true, postId: data.id };
  } catch (err: any) {
    console.error("[fb] error:", err?.message);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

export async function publish(
  posts: { ig?: SocialPost; fb?: SocialPost },
  imageBuffer: Buffer
): Promise<PublishResult> {
  const [instagram, facebook] = await Promise.all([
    posts.ig ? publishToInstagram(posts.ig, imageBuffer) : Promise.resolve({ success: false, error: "skipped" }),
    posts.fb ? publishToFacebook(posts.fb, imageBuffer) : Promise.resolve({ success: false, error: "skipped" }),
  ]);
  return { instagram, facebook };
}
