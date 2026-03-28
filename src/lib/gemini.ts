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
    `Write an ALL CAPS thumbnail headline for this article. It will appear on a news image card on Instagram and Facebook.\n\n` +
    `TITLE: ${article.title}\n` +
    `CATEGORY: ${article.category}\n` +
    `SUMMARY: ${(article.summary || "").slice(0, 300)}\n\n` +
    `Rules:\n` +
    `- ALL CAPS only — this is a visual headline on an image\n` +
    `- Max 10 words — shorter is better\n` +
    `- Must be grounded in a real fact from the article (name, number, place, or event)\n` +
    `- Write it like a front-page newspaper headline — specific, factual, direct\n` +
    `- NO clickbait, NO "SHOCKING", NO "UNBELIEVABLE", NO "YOU WON'T BELIEVE"\n` +
    `- NO emojis, no hashtags, no quotes\n` +
    `- Think AP wire headline style — who did what\n` +
    `- Reply with ONLY the headline, nothing else`;

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { temperature: 0.7, maxOutputTokens: 80 },
  });

  return response.text?.trim().replace(/^["']|["']$/g, "").toUpperCase() ?? "";
}

// ── Caption system prompt (for NVIDIA) ───────────────────────────────────────
const CAPTION_SYSTEM = `You are the senior news writer at PPP TV Kenya — a verified Kenyan entertainment and news media brand on Instagram and Facebook.

Your captions are written in the style of a professional journalist. They are factual, specific, and compelling without being sensational. Meta's algorithm rewards news pages that write like real journalists and penalizes clickbait.

STRUCTURE (3 parts, blank line between each):

1. LEDE — One sentence stating the most important fact: WHO did WHAT, WHERE, WHEN. Use a real name. Lead with the most newsworthy element. No emojis. No ALL CAPS.

2. BODY — 2-4 sentences of verified detail. Include names, exact figures, locations, dates, direct quotes where available. Give the reader enough context to understand the story fully. Write like AP or Reuters style — factual, tight, no filler.

3. CLOSE — One sentence that either: (a) states what happens next, (b) gives the reader's stake in the story, or (c) asks a genuine question about the story's implications. End with the source link.

RULES — CRITICAL FOR ACCOUNT SAFETY:
- NEVER use: "you won't believe", "shocking", "breaking", "must see", "find out more", "stay tuned", "the internet is buzzing", "here's everything"
- NEVER withhold information to create artificial curiosity — Meta penalizes this
- NEVER use ALL CAPS anywhere in the caption body
- No hashtags in caption (post them as first comment instead)
- Emojis are allowed and encouraged — use 2-4 relevant emojis to make the post feel human and engaging
- Every sentence must contain at least one verifiable fact
- Always credit the source: "Source: [publication name]"
- Write like a journalist, not a marketer
- Under 200 words total`;

// ── Curiosity hook patterns (injected into prompt for variety) ────────────────
const HOOK_PATTERNS = [
  "Lead with the most surprising verifiable fact in the story — a specific number, name, or outcome that makes the reader want to know more.",
  "Lead with the consequence or outcome first, then explain the cause — this creates narrative tension without withholding facts.",
  "Lead with a direct quote from a key person in the story if one is available.",
  "Lead with the most specific detail — an exact time, place, or figure that makes the story feel immediate and real.",
  "Lead with what changed — what is different today compared to yesterday because of this story.",
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

// ── Engagement CTAs — journalist style, no clickbait ─────────────────────────
// Meta penalizes "curiosity gap" CTAs. These are factual and conversational.
const ENGAGEMENT_CTAS = [
  { cta: "What are your thoughts on this?", type: "debate" as const },
  { cta: "Share this with someone following this story.", type: "share" as const },
  { cta: "Tag someone who should know about this.", type: "tag" as const },
  { cta: "Save this for later.", type: "save" as const },
  { cta: "Do you agree with this decision?", type: "debate" as const },
  { cta: "What do you think happens next?", type: "debate" as const },
  { cta: "Pass this on to someone who needs to see it.", type: "share" as const },
  { cta: "Let us know your take in the comments.", type: "debate" as const },
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
  _options?: { isVideo?: boolean; videoType?: string }
): Promise<AIContent> {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasNvidia = !!process.env.NVIDIA_API_KEY;

  const content = (article.fullBody?.trim().length ?? 0) > 50
    ? article.fullBody.trim().slice(0, 2000)
    : (article.summary?.trim() ?? "");

  const hookPattern = HOOK_PATTERNS[Math.floor(Math.random() * HOOK_PATTERNS.length)];

  const captionPrompt =
    `Write a PPP TV Kenya news caption for this article. Write like a professional journalist — factual, specific, no clickbait.\n\n` +
    `TITLE: ${article.title}\n` +
    `CATEGORY: ${article.category}\n` +
    `SOURCE: ${article.sourceName || "PPP TV Kenya"}\n` +
    (content ? `ARTICLE:\n${content}\n\n` : "\n") +
    `LEDE APPROACH: ${hookPattern}\n\n` +
    `Follow the system instructions exactly. No clickbait. No curiosity gaps. No withholding facts.\n` +
    `End with: "Source: ${article.sourceName || "PPP TV Kenya"}"\n` +
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

  // Strip hashtags from title — they look terrible on thumbnails
  clickbaitTitle = clickbaitTitle.replace(/#\w+/g, "").replace(/\s{2,}/g, " ").trim();

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
