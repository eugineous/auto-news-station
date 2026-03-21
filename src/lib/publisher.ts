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
      if (status && status >= 400 && status < 500) throw err;
      lastErr = err;
      await sleep(Math.pow(2, attempt) * 1000);
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
  // Use native FormData (Node 18+) instead of form-data package
  const blob = new Blob([imageBuffer], { type: "image/jpeg" });
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

async function publishToInstagram(
  post: SocialPost,
  imageBuffer: Buffer
): Promise<{ success: boolean; postId?: string; error?: string }> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const fbToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const fbPageId = process.env.FACEBOOK_PAGE_ID;

  console.log("[ig] accountId:", accountId, "fbPageId:", fbPageId, "token set:", !!token, "fbToken set:", !!fbToken);

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
        body: JSON.stringify({ image_url: hostedUrl, caption: post.caption, access_token: token }),
      })
    );
    const container = await (containerRes as any).json() as any;
    if (!(containerRes as any).ok || container.error) {
      throw new Error(container?.error?.message ?? "IG container creation failed");
    }

    // Step 4: Publish the container
    const publishRes = await withRetry(() =>
      fetch(`${GRAPH_API}/${accountId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: container.id, access_token: token }),
      })
    );
    const published = await (publishRes as any).json() as any;
    if (!(publishRes as any).ok || published.error) {
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

  console.log("[fb] pageId:", pageId, "token set:", !!token);

  if (!token || !pageId) {
    return { success: false, error: "Facebook tokens not configured" };
  }

  try {
    const blob = new Blob([imageBuffer], { type: "image/jpeg" });
    const form = new FormData();
    form.append("source", blob, "image.jpg");
    form.append("caption", post.caption);
    form.append("access_token", token);

    const res = await withRetry(() =>
      fetch(`${GRAPH_API}/${pageId}/photos`, { method: "POST", body: form })
    );
    const data = await (res as any).json() as any;
    if (!(res as any).ok || data.error) {
      throw new Error(data?.error?.message ?? `HTTP ${(res as any).status}`);
    }

    return { success: true, postId: data.id };
  } catch (err: any) {
    console.error("[fb] error:", err?.message);
    return { success: false, error: err?.message ?? "Unknown error" };
  }
}

export async function publish(
  posts: { ig: SocialPost; fb: SocialPost },
  imageBuffer: Buffer
): Promise<PublishResult> {
  const [instagram, facebook] = await Promise.all([
    publishToInstagram(posts.ig, imageBuffer),
    publishToFacebook(posts.fb, imageBuffer),
  ]);
  return { instagram, facebook };
}
