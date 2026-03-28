import { NextRequest, NextResponse } from "next/server";
import { publish } from "@/lib/publisher";
import { generateImage } from "@/lib/image-gen";
import { Article } from "@/lib/types";
import { createHash } from "crypto";

export const maxDuration = 60;

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
const WORKER_SECRET = process.env.WORKER_SECRET || "ppptvWorker2024";

async function updateLog(articleId: string, platform: "instagram" | "facebook", result: { success: boolean; postId?: string; error?: string }) {
  if (!WORKER_SECRET) return;
  try {
    await fetch(WORKER_URL + "/post-log/update", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + WORKER_SECRET },
      body: JSON.stringify({ articleId, platform, result }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* non-fatal */ }
}

export async function POST(req: NextRequest) {
  const secret = process.env.AUTOMATE_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  let body: { articleId?: string; title?: string; caption?: string; imageUrl?: string; articleUrl?: string; category?: string; platform?: "instagram" | "facebook" | "both" };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { articleId, title, caption, imageUrl, articleUrl, category = "GENERAL", platform = "both" } = body;
  if (!articleId || !title || !caption || !articleUrl) {
    return NextResponse.json({ error: "Missing required fields: articleId, title, caption, articleUrl" }, { status: 400 });
  }

  try {
    // Rebuild the branded image
    const article: Article = {
      id: articleId,
      title,
      url: articleUrl,
      imageUrl: imageUrl || "",
      summary: caption,
      fullBody: caption,
      sourceName: "PPP TV Kenya",
      category,
      publishedAt: new Date(),
    };

    const imageBuffer = await generateImage(article, { isBreaking: false });

    const igPost = { platform: "instagram" as const, caption, articleUrl };
    const fbPost = { platform: "facebook" as const, caption, articleUrl };

    let result;
    if (platform === "instagram") {
      result = await publish({ ig: igPost }, imageBuffer);
    } else if (platform === "facebook") {
      result = await publish({ fb: fbPost }, imageBuffer);
    } else {
      result = await publish({ ig: igPost, fb: fbPost }, imageBuffer);
    }

    return NextResponse.json({
      success: (result.instagram?.success || result.facebook?.success) ?? false,
      instagram: result.instagram,
      facebook: result.facebook,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
