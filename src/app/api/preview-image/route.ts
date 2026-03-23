import { NextRequest, NextResponse } from "next/server";
import { generateImage } from "@/lib/image-gen";
import { Article } from "@/lib/types";

// GET /api/preview-image?title=...&category=...&imageUrl=...&categoryLabel=...
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const imageUrl = searchParams.get("imageUrl") ?? "";

  const article: Article = {
    id: "preview",
    title: searchParams.get("title") ?? "PPP TV KENYA NEWS",
    url: "https://ppptv-v2.vercel.app",
    imageUrl,
    summary: searchParams.get("summary") ?? "",
    fullBody: "",
    sourceName: "PPP TV",
    publishedAt: new Date(),
    category: (searchParams.get("category") ?? "GENERAL").toUpperCase(),
  };

  const categoryLabel = searchParams.get("categoryLabel") ?? "TRENDING";

  try {
    const buffer = await generateImage(article, { categoryLabel });
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/preview-image — accepts base64 image for carousel cover preview
export async function POST(req: NextRequest) {
  let body: { title?: string; category?: string; imageBase64?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { title = "PPP TV KENYA NEWS", category = "GENERAL", imageBase64 } = body;
  if (!imageBase64) return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });

  // Write base64 to a data URL so generateImage can fetch it
  const dataUrl = `data:image/jpeg;base64,${imageBase64}`;

  const article: Article = {
    id: "preview",
    title,
    url: "https://ppptv-v2.vercel.app",
    imageUrl: dataUrl,
    summary: "",
    fullBody: "",
    sourceName: "PPP TV",
    publishedAt: new Date(),
    category: category.toUpperCase(),
  };

  try {
    const buffer = await generateImage(article, { categoryLabel: "TRENDING" });
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
