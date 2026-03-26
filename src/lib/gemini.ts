import { GoogleGenAI } from "@google/genai";
import { Article } from "./types";

export interface AIContent {
  clickbaitTitle: string;
  caption: string;
}

// ── NVIDIA NIM API — used for caption body generation ─────────────────────────
const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL = "nvidia/llama-3.1-nemotron-ultra-253b-v1";

async function generateWithNvidia(prompt: string, systemPrompt: string): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY not set");

  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      max_tokens: 800,
      top_p: 0.9,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`NVIDIA API error ${res.status}: ${err}`);
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// ── Gemini — used for headline title generation ───────────────────────────────
let _geminiClient: GoogleGenAI | null = null;
function getGeminiClient(apiKey: string): GoogleGenAI {
  if (!_geminiClient) _geminiClient = new GoogleGenAI({ apiKey });
  return _geminiClient;
}

async function generateTitleWithGemini(article: Article): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const client = getGeminiClient(apiKey);
  const prompt =
    `Write a punchy ALL CAPS headline (max 12 words) for this article.\n` +
    `TITLE: ${article.title}\n` +
    `CATEGORY: ${article.category}\n` +
    `SUMMARY: ${(article.summary || "").slice(0, 300)}\n\n` +
    `Rules:\n` +
    `- ALL CAPS only\n` +
    `- Max 12 words\n` +
    `- Must include a real name, number, or place from the article\n` +
    `- Be specific and punchy\n` +
    `- No hashtags, no quotes around the title\n` +
    `- Reply with ONLY the headline, nothing else`;

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { temperature: 0.7, maxOutputTokens: 80 },
  });

  return response.text?.trim().replace(/^["']|["']$/g, "").toUpperCase() ?? "";
}

// ── Caption system prompt (for NVIDIA) ───────────────────────────────────────
const CAPTION_SYSTEM = `You are the head of content at PPP TV Kenya — a popular Kenyan entertainment and news brand on Instagram and Facebook. You write like a seasoned Nairobi journalist who hooks readers while delivering real news.

Write a social media caption with this exact structure (3 parts, blank lines between):

1. LEDE — one punchy sentence: WHO did WHAT, WHERE. Real name required. No ALL CAPS.
2. BODY — one paragraph (3-5 sentences) of real detail. Include names, locations, figures, dates, quotes, context. ONE paragraph only — no bullet points.
3. CTA — one engaging question specific to this story + optional 👇

CRITICAL RULES:
- NEVER start with the headline or title — not even paraphrased
- NEVER use ALL CAPS in the caption body
- Every sentence must have a specific fact (name, number, place, date, or quote)
- No hashtags whatsoever
- Max 2 emojis total
- No filler phrases like "the internet is buzzing", "here's everything you need to know", "stay tuned"`;

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateAIContent(
  article: Article,
  options?: { isVideo?: boolean }
): Promise<AIContent> {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasNvidia = !!process.env.NVIDIA_API_KEY;

  const content = (article.fullBody?.trim().length ?? 0) > 50
    ? article.fullBody.trim().slice(0, 2000)
    : (article.summary?.trim() ?? "");

  const captionPrompt =
    `Write a PPP TV Kenya social media caption for this article:\n\n` +
    `TITLE: ${article.title}\n` +
    `CATEGORY: ${article.category}\n` +
    `SOURCE: ${article.sourceName || "unknown"}\n` +
    (content ? `ARTICLE:\n${content}\n\n` : "\n") +
    `Use ONLY facts from the article. No hashtags. No fabrication.\n` +
    `Reply with ONLY the caption text (no labels, no "CAPTION:" prefix).`;

  // Run title (Gemini) and caption (NVIDIA) in parallel
  const results = await Promise.allSettled([
    hasGemini ? generateTitleWithGemini(article) : Promise.reject("no gemini"),
    hasNvidia ? generateWithNvidia(captionPrompt, CAPTION_SYSTEM) : Promise.reject("no nvidia"),
  ]);

  let clickbaitTitle = "";
  let caption = "";

  // Title — prefer Gemini, fall back to article title
  if (results[0].status === "fulfilled" && results[0].value) {
    clickbaitTitle = results[0].value;
  } else {
    if (results[0].status === "rejected") console.warn("[gemini] title failed:", results[0].reason);
    clickbaitTitle = article.title.toUpperCase().slice(0, 100);
  }

  // Caption — prefer NVIDIA, fall back to Gemini, then excerpt
  if (results[1].status === "fulfilled" && results[1].value) {
    caption = results[1].value;
  } else {
    if (results[1].status === "rejected") console.warn("[nvidia] caption failed:", results[1].reason);
    if (hasGemini) {
      try { caption = await generateCaptionWithGemini(article, content); }
      catch (err) { console.warn("[gemini] caption fallback failed:", err); }
    }
    if (!caption) caption = buildExcerptCaption(article);
  }

  // Safety: strip any headline that leaked into caption top
  caption = stripLeadingHeadline(caption, article.title);
  caption = caption.replace(/#\w+/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!caption || caption.length < 40) caption = buildExcerptCaption(article);

  return { clickbaitTitle, caption };
}

// ── Gemini caption fallback ───────────────────────────────────────────────────
async function generateCaptionWithGemini(article: Article, content: string): Promise<string> {
  const client = getGeminiClient(process.env.GEMINI_API_KEY!);
  const prompt =
    `Write a PPP TV Kenya social media caption.\n\n` +
    `TITLE: ${article.title}\n` +
    `CATEGORY: ${article.category}\n` +
    (content ? `ARTICLE:\n${content}\n\n` : "\n") +
    `Structure: lede sentence → body paragraph → question CTA\n` +
    `Do NOT start with the headline. No hashtags. No ALL CAPS in body.\n` +
    `Reply with ONLY the caption text.`;

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { systemInstruction: CAPTION_SYSTEM, temperature: 0.7, maxOutputTokens: 800 },
  });
  return response.text?.trim() ?? "";
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildExcerptCaption(article: Article): string {
  const body = article.fullBody?.trim() || article.summary?.trim() || article.title;
  const cleaned = body
    .split(/\n+/)
    .filter(line => {
      const t = line.trim();
      if (!t) return false;
      const upperRatio = (t.match(/[A-Z]/g) || []).length / Math.max(t.replace(/\s/g, "").length, 1);
      return upperRatio < 0.7;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  return (cleaned || article.title) + "\n\nWhat do you think? 👇";
}

function stripLeadingHeadline(caption: string, originalTitle: string): string {
  const lines = caption.split("\n");
  const first = lines[0].trim();
  if (first === first.toUpperCase() && first.length > 10 && first.replace(/[^A-Z]/g, "").length > 5) {
    lines.shift();
    while (lines.length && lines[0].trim() === "") lines.shift();
    return lines.join("\n");
  }
  const titleNorm = originalTitle.toLowerCase().slice(0, 40);
  if (first.toLowerCase().startsWith(titleNorm.slice(0, 30))) {
    lines.shift();
    while (lines.length && lines[0].trim() === "") lines.shift();
    return lines.join("\n");
  }
  return caption;
}
