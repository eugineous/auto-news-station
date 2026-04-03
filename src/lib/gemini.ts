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
    `CRITICAL FACT-CHECKING — verify these before writing:\n` +
    `- William Ruto = CURRENT President of Kenya (since Sept 2022)\n` +
    `- Uhuru Kenyatta = FORMER President (NOT current — served 2013-2022)\n` +
    `- Raila Odinga = Opposition leader (NEVER been president)\n` +
    `- Rigathi Gachagua = FORMER Deputy President (impeached Oct 2024)\n` +
    `- Kithure Kindiki = CURRENT Deputy President (since Oct 2024)\n` +
    `- Use Google Search to verify any other names, titles, or facts\n\n` +
    `Rules:\n` +
    `- ALL CAPS only — this is a visual headline on an image\n` +
    `- Max 10 words — shorter is better\n` +
    `- Must be grounded in verified facts only — do NOT invent any detail\n` +
    `- Write it like a front-page newspaper headline — specific, factual, direct\n` +
    `- NO clickbait, NO "SHOCKING", NO "UNBELIEVABLE", NO "YOU WON'T BELIEVE"\n` +
    `- NO emojis, no hashtags, no quotes\n` +
    `- Think AP wire headline style — who did what\n` +
    `- If you cannot verify a fact, use only the exact words from the title above\n` +
    `- Reply with ONLY the headline, nothing else`;

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      temperature: 0.5,
      maxOutputTokens: 80,
      tools: [{ googleSearch: {} }],
    },
  });

  return response.text?.trim().replace(/^["']|["']$/g, "").toUpperCase() ?? "";
}

// ── Caption system prompt (for NVIDIA) ───────────────────────────────────────
const CAPTION_SYSTEM = `You are the senior content writer at PPP TV Kenya — Kenya's #1 entertainment and sports media brand on Instagram and Facebook.

PAGE IDENTITY: PPP TV Kenya is the go-to source for entertainment, sports, music, celebrity news, and lifestyle content in Kenya and East Africa. Every caption should reinforce this identity.

Your captions are written in the style of a professional journalist. They are factual, specific, and compelling without being sensational. Meta's algorithm rewards news pages that write like real journalists and penalizes clickbait.

CRITICAL FACT-CHECKING RULES — READ BEFORE WRITING:
- Use Google Search to verify EVERY name, title, and claim before writing
- CURRENT KENYA FACTS (as of 2024-2026):
  * William Ruto = CURRENT President of Kenya (since September 2022)
  * Uhuru Kenyatta = FORMER President of Kenya (served 2013-2022, NOT current president)
  * Raila Odinga = Opposition leader / former Prime Minister (NOT president)
  * Rigathi Gachagua = FORMER Deputy President (impeached October 2024)
  * Kithure Kindiki = CURRENT Deputy President (since October 2024)
  * Kenya Kwanza = ruling coalition
  * Azimio = opposition coalition
- NEVER call Uhuru Kenyatta "President" — he is "former President"
- NEVER call Raila Odinga "President" — he has never been president
- If you are unsure of someone's current title, use Google Search to verify
- If you cannot verify a fact, omit it entirely — do not guess

STRUCTURE (3 parts, blank line between each):

1. LEDE — One sentence stating the most important fact: WHO did WHAT, WHERE, WHEN. Use a real name with their CORRECT current title. Lead with the most newsworthy element. No emojis. No ALL CAPS.

2. BODY — 2-4 sentences of verified detail. Include names, exact figures, locations, dates, direct quotes where available. Give the reader enough context to understand the story fully. Write like AP or Reuters style — factual, tight, no filler.

3. CLOSE — One sentence that either: (a) states what happens next, (b) gives the reader's stake in the story, or (c) asks a genuine question about the story's implications. End with the source link.

RULES — CRITICAL FOR ACCOUNT SAFETY:
- ONLY use facts that are explicitly stated in the article provided OR verified via Google Search
- NEVER invent, assume, or infer any fact not directly in the article text or confirmed by search
- NEVER use: "you won't believe", "shocking", "breaking", "must see", "find out more", "stay tuned", "the internet is buzzing", "here's everything"
- NEVER withhold information to create artificial curiosity — Meta penalizes this
- NEVER use ALL CAPS anywhere in the caption body
- No hashtags in caption (post them as first comment instead)
- Emojis are allowed and encouraged — use 2-4 relevant emojis to make the post feel human and engaging
- Every sentence must contain at least one verifiable fact from the article
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

// ── Engagement CTAs — journalist style + follow hooks ────────────────────────
// Meta penalizes "curiosity gap" CTAs. These are factual and conversational.
const ENGAGEMENT_CTAS = [
  { cta: "Follow @ppptvke for daily entertainment & sports. 🔥", type: "share" as const },
  { cta: "Follow for more content like this. 👇", type: "share" as const },
  { cta: "Follow @ppptvke — Kenya's #1 entertainment page. ✅", type: "share" as const },
  { cta: "Follow for part 2 and more updates. 🎬", type: "share" as const },
  { cta: "Tag someone who needs to see this! 👀", type: "tag" as const },
  { cta: "What are your thoughts? Drop them below. 💬", type: "debate" as const },
  { cta: "Follow @ppptvke for the latest from Kenya & beyond. 🌍", type: "share" as const },
  { cta: "Share this with someone who'd love it! 🔁", type: "share" as const },
  { cta: "Follow for daily sports & entertainment updates. ⚽🎵", type: "share" as const },
  { cta: "Save this for later. 🔖", type: "save" as const },
];

function getHashtags(category: string): string {
  const tags = HASHTAG_BANK[category.toUpperCase()] ?? HASHTAG_BANK.GENERAL;
  return tags.join(" ");
}

function getEngagementCTA(): { cta: string; type: "debate" | "tag" | "save" | "share" | "poll" } {
  return ENGAGEMENT_CTAS[Math.floor(Math.random() * ENGAGEMENT_CTAS.length)];
}

// ── Story verification — lightweight check, don't block on uncertainty ────────
export async function verifyStory(title: string, url: string): Promise<{ verified: boolean; reason: string; confidence: number }> {
  // Only block obvious hoaxes/satire — don't block on uncertainty
  const lowerTitle = title.toLowerCase();
  const obviousHoax = [
    "satire", "parody", "fake news", "not real", "hoax",
  ];
  if (obviousHoax.some(h => lowerTitle.includes(h))) {
    return { verified: false, reason: "title contains hoax indicator", confidence: 0 };
  }
  // Pass everything else — we trust our sources (Tuko, Mpasho, Pulse, etc.)
  return { verified: true, reason: "trusted source pipeline", confidence: 80 };
}


// ── Determine if content is news (requires research + rewrite) ───────────────
const NEWS_CATEGORIES = new Set(["NEWS", "POLITICS", "BUSINESS", "TECHNOLOGY", "HEALTH", "SCIENCE"]);
function isNewsCategory(cat: string): boolean { return NEWS_CATEGORIES.has(cat?.toUpperCase()); }

export async function generateAIContent(
  article: Article,
  _options?: { isVideo?: boolean; videoType?: string; tone?: "formal" | "casual" | "hype" | "sheng"; language?: "en" | "sw" }
): Promise<AIContent> {
  const hasGemini = !!process.env.GEMINI_API_KEY;

  const rawTitle = article.title.replace(/#\w+/g, "").replace(/\s{2,}/g, " ").trim();
  const body = article.fullBody?.trim() || article.summary?.trim() || article.title;
  const source = article.sourceName || "PPP TV Kenya";
  const hashtags = getHashtags(article.category);
  const cta = getEngagementCTA();

  // ── Fast path: no Gemini key — build caption directly from article content ──
  if (!hasGemini) {
    const caption = buildParaphraseCaption(rawTitle, body, source, cta.cta, article.url);
    return {
      clickbaitTitle: rawTitle.toUpperCase().slice(0, 120),
      caption,
      firstComment: hashtags,
      engagementType: cta.type,
    };
  }

  // ── Gemini: paraphrase only — no Google Search, no fact-checking, no rewrite ──
  const client = getGeminiClient(process.env.GEMINI_API_KEY!);

  const paraphrasePrompt =
    `You are a social media writer for PPP TV Kenya.\n\n` +
    `TASK: Paraphrase the article below into a short Instagram/Facebook caption.\n` +
    `- Keep ALL facts exactly as stated in the article — do NOT add, invent, or change any detail\n` +
    `- Paraphrase the wording so it reads naturally as a social media post\n` +
    `- Write a punchy headline (ALL CAPS, max 10 words) then 2-3 sentences of body\n` +
    `- End with: "Source: ${source}"\n` +
    `- No hashtags, no emojis in headline, 2-3 emojis in body max\n` +
    `- Under 150 words total\n\n` +
    `ARTICLE TITLE: ${rawTitle}\n` +
    `ARTICLE BODY: ${body.slice(0, 800)}\n` +
    `SOURCE URL: ${article.url}\n\n` +
    `Reply with ONLY the caption. No labels, no preamble.`;

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: paraphrasePrompt,
      config: { temperature: 0.4, maxOutputTokens: 400 },
      // NO googleSearch tool — fast, no verification, just paraphrase
    });

    let caption = response.text?.trim() ?? "";
    if (!caption || caption.length < 20) throw new Error("empty response");

    // Extract headline from first line if it's ALL CAPS
    const lines = caption.split("\n").filter(l => l.trim());
    let clickbaitTitle = rawTitle.toUpperCase().slice(0, 120);
    if (lines[0] && lines[0] === lines[0].toUpperCase() && lines[0].length > 5) {
      clickbaitTitle = lines[0].replace(/#\w+/g, "").trim().slice(0, 120);
    }

    // Append CTA and URL if not already present
    if (!caption.includes(article.url || "")) {
      caption += `\n\n${cta.cta}`;
    }

    return { clickbaitTitle, caption, firstComment: hashtags, engagementType: cta.type };
  } catch (err: any) {
    console.warn("[gemini] paraphrase failed, using fallback:", err.message);
    const caption = buildParaphraseCaption(rawTitle, body, source, cta.cta, article.url);
    return {
      clickbaitTitle: rawTitle.toUpperCase().slice(0, 120),
      caption,
      firstComment: hashtags,
      engagementType: cta.type,
    };
  }
}

function buildParaphraseCaption(title: string, body: string, source: string, cta: string, url?: string): string {
  const cleaned = body
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
  const text = cleaned.length > 30 ? cleaned : title;
  return `${text}\n\n${cta}\n\nSource: ${source}${url ? `\n${url}` : ""}`;
}
