import { GoogleGenAI } from "@google/genai";
import { Article } from "./types";

export interface AIContent {
  clickbaitTitle: string;
  caption: string;
  firstComment?: string; // hashtags go here, not in caption — keeps caption clean
  engagementType?: "debate" | "tag" | "save" | "share" | "poll"; // for analytics
}

// ── NVIDIA NIM API — used for caption body generation ─────────────────────────
const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL = "meta/llama-3.1-8b-instruct";

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
    `Write an ALL CAPS thumbnail headline for this article. It will appear on a news image card.\n\n` +
    `TITLE: ${article.title}\n` +
    `CATEGORY: ${article.category}\n` +
    `SUMMARY: ${(article.summary || "").slice(0, 300)}\n\n` +
    `Rules:\n` +
    `- ALL CAPS only — this is a visual headline on an image\n` +
    `- Max 10 words — shorter is better\n` +
    `- Must be grounded in a real fact from the article (name, number, place, or event)\n` +
    `- Write it like a front-page newspaper headline — specific, urgent, impossible to ignore\n` +
    `- Use a curiosity gap or surprising angle when possible\n` +
    `- NO emojis, no hashtags, no quotes\n` +
    `- Do NOT use generic filler: "SHOCKING", "UNBELIEVABLE", "YOU WON'T BELIEVE"\n` +
    `- Reply with ONLY the headline, nothing else`;

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { temperature: 0.7, maxOutputTokens: 80 },
  });

  return response.text?.trim().replace(/^["']|["']$/g, "").toUpperCase() ?? "";
}

// ── Caption system prompt (for NVIDIA) ───────────────────────────────────────
const CAPTION_SYSTEM = `You are the lead social media writer at PPP TV Kenya — one of Kenya's most-followed entertainment and news pages on Instagram and Facebook, targeting 1 million weekly reach.

Your captions are studied by other pages. They drive massive shares, saves, and comments because they use proven psychological triggers: curiosity gaps, social proof, FOMO, open loops, and specificity.

STRUCTURE (3 parts, blank line between each):

1. HOOK — One sentence that opens a curiosity gap. The reader must feel they are missing something important if they don't read on. Use a surprising fact, a contradiction, a number that shocks, or a "you didn't know this" angle. NEVER start with the person's name or the headline. No emojis here.

2. BODY — 2-4 sentences of real, specific detail. Names, exact numbers, places, dates, direct quotes. Build tension or stakes. Reveal enough to make the story feel real — but withhold the most satisfying detail so they must click.

3. CTA — One short punchy line. Rotate between: "Full story in the link." / "Details below 👇" / "What do you think about this?" / "Tag someone who needs to see this." / "Share this before it gets taken down."

RULES:
- NEVER start with the article title or headline
- NEVER use ALL CAPS anywhere in the caption
- NEVER use emojis in the first line
- No hashtags
- Max 1 emoji total (only in CTA if needed)
- No filler phrases: "the internet is buzzing", "you won't believe", "stay tuned", "here's everything you need to know"
- Every sentence must contain at least one specific fact (name, number, place, date, or quote)
- Write like a journalist who also understands virality — factual but impossible to ignore
- Under 180 words total`;

// ── Curiosity hook patterns (injected into prompt for variety) ────────────────
const HOOK_PATTERNS = [
  "Start with a number or statistic that surprises (e.g. 'Ksh 4.8 billion left Kenya last month — and most people have no idea where it went.')",
  "Start with a contradiction or unexpected twist (e.g. 'She was supposed to be celebrating. Instead, she was fired.')",
  "Start with a consequence before the cause (e.g. 'Three people lost their jobs over a single WhatsApp message.')",
  "Start with a question that implies the reader is missing something (e.g. 'Did you know this has been happening since January?')",
  "Start with a specific detail that makes the story feel real and urgent (e.g. 'At exactly 11:47am on Tuesday, everything changed for this Nairobi family.')",
];

// ── Kenya hashtag bank — by category ─────────────────────────────────────────
// These go in the FIRST COMMENT, not the caption (keeps caption clean, boosts reach)
const HASHTAG_BANK: Record<string, string[]> = {
  MUSIC:         ["#KenyaMusic", "#AfrobeatKenya", "#NairobiMusic", "#KenyanArtist", "#EastAfricaMusic", "#PPPTVKenya", "#MusicKE", "#NewMusic"],
  CELEBRITY:     ["#KenyaCelebrity", "#NairobiCelebs", "#KenyanCelebs", "#PPPTVKenya", "#NairobiGossip", "#KenyaEntertainment", "#CelebNews"],
  ENTERTAINMENT: ["#KenyaEntertainment", "#NairobiEntertainment", "#PPPTVKenya", "#KenyaNews", "#EntertainmentKE", "#NairobiLife"],
  "TV & FILM":   ["#KenyaTV", "#NairobiFilm", "#KenyanFilm", "#PPPTVKenya", "#AfricanFilm", "#KenyaMovies", "#NairobiCinema"],
  MOVIES:        ["#KenyaMovies", "#NairobiCinema", "#AfricanFilm", "#PPPTVKenya", "#MovieNews", "#FilmKenya"],
  SPORTS:        ["#KenyaSports", "#HarambeeStars", "#KenyaAthletics", "#PPPTVKenya", "#SportKE", "#NairobiSports", "#KenyaFootball"],
  POLITICS:      ["#KenyaPolitics", "#KenyaNews", "#NairobiPolitics", "#PPPTVKenya", "#KenyaGovernment", "#PoliticsKE"],
  BUSINESS:      ["#KenyaBusiness", "#NairobiBusiness", "#KenyaEconomy", "#PPPTVKenya", "#StartupKenya", "#BusinessKE"],
  NEWS:          ["#KenyaNews", "#NairobiNews", "#PPPTVKenya", "#BreakingKE", "#KenyaToday", "#NairobiToday"],
  GENERAL:       ["#Kenya", "#Nairobi", "#PPPTVKenya", "#KenyaNews", "#NairobiLife", "#EastAfrica", "#KenyaToday"],
};

// ── Engagement CTA rotation — proven high-engagement patterns ─────────────────
// Based on what drives comments/shares on Kenyan social media
const ENGAGEMENT_CTAS = [
  { cta: "Tag someone who needs to see this.", type: "tag" as const },
  { cta: "What do you think? Drop your thoughts below.", type: "debate" as const },
  { cta: "Save this — you'll want to come back to it.", type: "save" as const },
  { cta: "Share this with someone who follows this story.", type: "share" as const },
  { cta: "Do you agree or disagree? Comment below.", type: "debate" as const },
  { cta: "Tag a friend who needs to know this.", type: "tag" as const },
  { cta: "Who saw this coming? Comment below.", type: "debate" as const },
  { cta: "Share this — not everyone has seen it yet.", type: "share" as const },
];

function getHashtags(category: string): string {
  const tags = HASHTAG_BANK[category.toUpperCase()] ?? HASHTAG_BANK.GENERAL;
  return tags.join(" ");
}

function getEngagementCTA(): { cta: string; type: "debate" | "tag" | "save" | "share" | "poll" } {
  return ENGAGEMENT_CTAS[Math.floor(Math.random() * ENGAGEMENT_CTAS.length)];
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateAIContent(
  article: Article,
  options?: { isVideo?: boolean; videoType?: string }
): Promise<AIContent> {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasNvidia = !!process.env.NVIDIA_API_KEY;

  const content = (article.fullBody?.trim().length ?? 0) > 50
    ? article.fullBody.trim().slice(0, 2000)
    : (article.summary?.trim() ?? "");

  const hookPattern = HOOK_PATTERNS[Math.floor(Math.random() * HOOK_PATTERNS.length)];

  const captionPrompt =
    `Write a PPP TV Kenya social media caption for this article. Target: maximum shares, saves, and comments from a Kenyan audience.\n\n` +
    `TITLE: ${article.title}\n` +
    `CATEGORY: ${article.category}\n` +
    `SOURCE: ${article.sourceName || "unknown"}\n` +
    (content ? `ARTICLE:\n${content}\n\n` : "\n") +
    `HOOK TECHNIQUE TO USE: ${hookPattern}\n\n` +
    `Write the caption following the system instructions exactly.\n` +
    `Use ONLY facts from the article. No fabrication. No hashtags.\n` +
    `Reply with ONLY the caption text — no labels, no "Caption:", no preamble.`;

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

  // Build first comment: hashtags + engagement CTA (keeps caption clean)
  const engagementCTA = getEngagementCTA();
  const hashtags = getHashtags(article.category);
  const firstComment = `${hashtags}`;

  // Inject engagement CTA into caption if AI didn't include one
  const hasCTA = /tag|comment|share|save|think|agree|disagree/i.test(caption.slice(-100));
  if (!hasCTA) {
    caption = caption.trimEnd() + "\n\n" + engagementCTA.cta;
  }

  return { clickbaitTitle, caption, firstComment, engagementType: engagementCTA.type };
}

// ── Gemini caption fallback ───────────────────────────────────────────────────
async function generateCaptionWithGemini(article: Article, content: string): Promise<string> {
  const client = getGeminiClient(process.env.GEMINI_API_KEY!);
  const hookPattern = HOOK_PATTERNS[Math.floor(Math.random() * HOOK_PATTERNS.length)];
  const prompt =
    `Write a PPP TV Kenya social media caption for maximum engagement.\n\n` +
    `TITLE: ${article.title}\n` +
    `CATEGORY: ${article.category}\n` +
    (content ? `ARTICLE:\n${content}\n\n` : "\n") +
    `HOOK TECHNIQUE: ${hookPattern}\n\n` +
    `Follow the system instructions. No hashtags. No ALL CAPS. No emojis in first line.\n` +
    `Reply with ONLY the caption text.`;

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { systemInstruction: CAPTION_SYSTEM, temperature: 0.8, maxOutputTokens: 800 },
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
