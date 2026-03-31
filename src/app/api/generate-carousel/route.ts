/**
 * /api/generate-carousel
 * Takes a URL or article text and generates a multi-slide Instagram carousel.
 * Returns an array of slide image buffers as base64.
 */
import { NextRequest, NextResponse } from "next/server";
import { scrapeUrl } from "@/lib/url-scraper";
import { GoogleGenAI } from "@google/genai";
import satori from "satori";
import sharp from "sharp";
import { readFile } from "fs/promises";
import path from "path";
import React from "react";

export const maxDuration = 60;

const W = 1080, H = 1080;

async function getFont() {
  try {
    const p = path.join(process.cwd(), "public", "fonts", "BebasNeue-Regular.ttf");
    return await readFile(p);
  } catch { return null; }
}

async function generateSlideImage(
  slide: { headline: string; body: string; slideNum: number; total: number; category: string; color: string }
): Promise<string> {
  const fontData = await getFont();
  const fonts = fontData ? [{ name: "Bebas Neue", data: fontData, weight: 400 as const }] : [];

  const el = React.createElement(
    "div",
    {
      style: {
        width: W, height: H, background: "#0a0a0a",
        display: "flex", flexDirection: "column" as const,
        padding: 60, fontFamily: "Bebas Neue, sans-serif",
        border: `8px solid ${slide.color}`,
        position: "relative" as const,
      },
    },
    React.createElement("div", { style: { fontSize: 18, color: slide.color, letterSpacing: 4, marginBottom: 30 } }, `${slide.slideNum} / ${slide.total}`),
    React.createElement("div", { style: { background: slide.color + "22", color: slide.color, border: `1px solid ${slide.color}44`, fontSize: 14, fontWeight: 800, padding: "6px 16px", borderRadius: 4, letterSpacing: 2, marginBottom: 40, alignSelf: "flex-start" as const } }, slide.category),
    React.createElement("div", { style: { fontSize: slide.slideNum === 1 ? 72 : 56, color: "#ffffff", lineHeight: 1.1, marginBottom: 30, flex: 1 } }, slide.headline),
    React.createElement("div", { style: { fontSize: 22, color: "#aaaaaa", lineHeight: 1.6 } }, slide.body),
    React.createElement("div", { style: { position: "absolute" as const, bottom: 40, right: 60, fontSize: 20, color: slide.color, letterSpacing: 3 } }, "PPP TV KENYA"),
  );

  const svg = await satori(el, { width: W, height: H, fonts });
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  return buf.toString("base64");
}

export async function POST(req: NextRequest) {
  const body = await req.json() as any;
  const { url, category = "GENERAL" } = body;
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });

  try {
    const scraped = await scrapeUrl(url);
    const content = scraped.bodyText?.slice(0, 3000) || scraped.description || scraped.title;

    const client = new GoogleGenAI({ apiKey });
    const prompt = `You are a social media content creator for PPP TV Kenya. Create a 6-slide Instagram carousel from this article.

Article: ${content}

Return ONLY valid JSON array with exactly 6 objects, each with:
- "headline": short punchy headline (max 8 words, ALL CAPS)
- "body": 1-2 sentence explanation (max 30 words)

Slide 1: Hook/title slide
Slides 2-5: Key points/facts
Slide 6: CTA ("Follow @PPPTVKenya for more")

JSON only, no markdown:`;

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { temperature: 0.7, maxOutputTokens: 1000 },
    });

    let slides: { headline: string; body: string }[] = [];
    try {
      const text = response.text?.trim() || "[]";
      const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      slides = JSON.parse(clean);
    } catch {
      return NextResponse.json({ error: "AI failed to generate slides" }, { status: 500 });
    }

    const CAT_COLORS: Record<string, string> = {
      CELEBRITY: "#e1306c", MUSIC: "#a855f7", SPORTS: "#22c55e",
      POLITICS: "#ef4444", TECHNOLOGY: "#06b6d4", GENERAL: "#FF007A",
    };
    const color = CAT_COLORS[category.toUpperCase()] || "#FF007A";

    const images = await Promise.all(
      slides.map((s, i) => generateSlideImage({
        headline: s.headline,
        body: s.body,
        slideNum: i + 1,
        total: slides.length,
        category: category.toUpperCase(),
        color,
      }))
    );

    return NextResponse.json({
      slides: images.map((img, i) => ({ base64: img, headline: slides[i].headline })),
      count: images.length,
      title: scraped.title,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
