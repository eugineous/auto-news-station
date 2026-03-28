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
  for (let i = 0; i < 24; i++) {
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

// ── Post first comment (hashtags) after publish ───────────────────────────────
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

    // Post first comment with hashtags (keeps caption clean, boosts discoverability)
    if (post.firstComment && published.id) {
      await sleep(2000); // brief delay before commenting
      await postFirstComment(published.id, post.firstComment, token);
    }

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

// Posts as branded image with video link in caption on both platforms
export async function publish(
  posts: { ig?: SocialPost; fb?: SocialPost },
  imageBuffer: Buffer,
  _videoBuffer?: Buffer,
  _coverImageUrl?: string
): Promise<PublishResult> {
  const [instagram, facebook] = await Promise.all([
    posts.ig ? publishToInstagram(posts.ig, imageBuffer) : Promise.resolve({ success: false, error: "skipped" }),
    posts.fb ? publishToFacebook(posts.fb, imageBuffer) : Promise.resolve({ success: false, error: "skipped" }),
  ]);
  return { instagram, facebook };
}

// ── Story posting ─────────────────────────────────────────────────────────────
// Stages image in R2 then posts as IG Story + FB Story
export async function publishStories(
  imageBuffer: Buffer,
  workerUrl: string,
  workerSecret: string
): Promise<{ igStory: { success: boolean; error?: string }; fbStory: { success: boolean; error?: string } }> {
  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const fbToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const fbPageId = process.env.FACEBOOK_PAGE_ID;

  // Stage image in R2 so IG/FB can fetch it
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
    return { igStory: { success: false, error: "Image staging failed" }, fbStory: { success: false, error: "Image staging failed" } };
  }

  // Post IG Story
  const igStory = await (async () => {
    if (!igToken || !igAccountId) return { success: false, error: "IG credentials missing" };
    try {
      const createRes = await fetch(`${GRAPH_API}/${igAccountId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: stagedUrl, media_type: "STORIES", access_token: igToken }),
        signal: AbortSignal.timeout(30000),
      });
      const createData = await createRes.json() as any;
      if (!createRes.ok || createData.error) throw new Error(createData.error?.message || "IG story container failed");
      await sleep(3000);
      const publishRes = await fetch(`${GRAPH_API}/${igAccountId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: createData.id, access_token: igToken }),
        signal: AbortSignal.timeout(30000),
      });
      const publishData = await publishRes.json() as any;
      if (!publishRes.ok || publishData.error) throw new Error(publishData.error?.message || "IG story publish failed");
      return { success: true, storyId: publishData.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })();

  // Post FB Story
  const fbStory = await (async () => {
    if (!fbToken || !fbPageId) return { success: false, error: "FB credentials missing" };
    try {
      // FB Stories via photo_stories endpoint
      const res = await fetch(`${GRAPH_API}/${fbPageId}/photo_stories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: stagedUrl, access_token: fbToken }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json() as any;
      if (!res.ok || data.error) throw new Error(data.error?.message || "FB story failed");
      return { success: true, storyId: data.post_id || data.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  })();

  return { igStory, fbStory };
}
