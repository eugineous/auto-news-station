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
const CAPTION_SYSTEM = `You are the senior news writer at PPP TV Kenya — a verified Kenyan entertainment and news media brand on Instagram and Facebook.

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

// ── Credibility verification — cross-reference before posting ────────────────
export async function verifyStory(title: string, url: string): Promise<{ verified: boolean; reason: string; confidence: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { verified: true, reason: "no gemini key — skipping verification", confidence: 50 };

  const client = getGeminiClient(apiKey);
  try {
    const prompt =
      `You are a fact-checker for PPP TV Kenya. Verify this story before it gets posted.\n\n` +
      `STORY TITLE: "${title}"\n` +
      `SOURCE URL: ${url}\n\n` +
      `INSTRUCTIONS:\n` +
      `1. Use Google Search to find this story on at least 2 credible news sources\n` +
      `2. Check if the story is real, satire, misrepresented, or fabricated\n` +
      `3. Check if key facts (names, titles, events) are accurate\n` +
      `4. Check if this is a known fake news story or hoax\n\n` +
      `CREDIBLE SOURCES: BBC, Reuters, AP, CNN, Al Jazeera, Nation Africa, Standard Media, Citizen Digital, NTV Kenya, KTN, Tuko, The Star Kenya, Guardian, NYT, Washington Post\n\n` +
      `RESPOND IN THIS EXACT FORMAT (JSON only, no other text):\n` +
      `{"verified": true/false, "confidence": 0-100, "reason": "brief explanation", "sources": ["source1", "source2"]}\n\n` +
      `verified=true means the story checks out and is safe to post\n` +
      `verified=false means the story is fake, unverified, or potentially harmful\n` +
      `confidence=100 means you found it on multiple credible sources\n` +
      `confidence=0 means you found no credible sources or it's a known hoax`;

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.1,
        maxOutputTokens: 300,
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text?.trim() ?? "";
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { verified: true, reason: "could not parse verification response", confidence: 50 };

    const result = JSON.parse(jsonMatch[0]);
    return {
      verified: result.verified !== false,
      reason: result.reason || "verified",
      confidence: result.confidence ?? 50,
    };
  } catch (err: any) {
    console.warn("[verify] story verification failed:", err.message);
    return { verified: true, reason: "verification error — proceeding with caution", confidence: 40 };
  }
}


export async function generateAIContent(
  article: Article,
  _options?: { isVideo?: boolean; videoType?: string; tone?: "formal" | "casual" | "hype" | "sheng"; language?: "en" | "sw" }
): Promise<AIContent> {
  const tone = _options?.tone || "casual";
  const language = _options?.language || "en";
  const isSheng = tone === "sheng";
  const isSwahili = language === "sw";
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasNvidia = !!process.env.NVIDIA_API_KEY;

  const content = (article.fullBody?.trim().length ?? 0) > 50
    ? article.fullBody.trim().slice(0, 2000)
    : (article.summary?.trim() ?? "");

  const hookPattern = HOOK_PATTERNS[Math.floor(Math.random() * HOOK_PATTERNS.length)];

  const toneInstruction = isSheng
    ? `Write in Kenyan Sheng — a mix of Swahili, English, and Nairobi street slang. Use words like: fam, bana, si, ama, maze, sawa, poa, mtu, watu, hii, hiyo, leo, jana, kesho, mambo, vipi, noma, moto, baridi, kali, msee, dame, dude, wadau, wenyewe, kweli, kabisa, sawa sawa, si ndio, ata, hata, lakini, but, though, tho, coz, cuz. Sound like a young Nairobi content creator.`
    : isSwahili
    ? `Write entirely in Swahili. Use proper Swahili grammar and vocabulary appropriate for Kenyan news media.`
    : tone === "hype"
    ? `Write with maximum energy and hype. Use caps for emphasis, fire emojis, exclamation points. Make it feel URGENT and EXCITING.`
    : tone === "formal"
    ? `Write in formal journalistic style. Professional, factual, no slang, no emojis.`
    : `Write in casual, conversational Kenyan English. Friendly, relatable, engaging.`;

  const captionPrompt =
    `You MUST use Google Search for context before writing. This is always required.\n\n` +
    `REQUIRED SEARCHES (do all before writing):\n` +
    `1. Search: "${article.title}" — get full context and latest developments\n` +
    `2. Search every person mentioned — verify their CURRENT title/role today\n` +
    `3. Search any statistics or claims — confirm accuracy\n` +
    `4. Search for any related recent news that adds context\n\n` +
    `KNOWN KENYA FACTS (verify still current via search):\n` +
    `- William Ruto = President of Kenya since September 2022\n` +
    `- Uhuru Kenyatta = FORMER President (left office Sept 2022) — NEVER call him "President"\n` +
    `- Raila Odinga = Opposition leader — has NEVER been president\n` +
    `- Kithure Kindiki = Deputy President since October 2024\n` +
    `- Rigathi Gachagua = FORMER Deputy President (impeached October 2024)\n\n` +
    `AFTER RESEARCHING, write the PPP TV Kenya caption:\n\n` +
    `TITLE: ${article.title}\n` +
    `CATEGORY: ${article.category}\n` +
    `SOURCE: ${article.sourceName || "PPP TV Kenya"}\n` +
    `SOURCE URL: ${article.url}\n` +
    (content ? `ARTICLE:\n${content}\n\n` : "\n") +
    `LEDE APPROACH: ${hookPattern}\n\n` +
    `TONE: ${toneInstruction}\n\n` +
    `RULES:\n` +
    `- Use your search results to add context and correct any outdated information\n` +
    `- Only write facts confirmed by your Google Search results or the article above\n` +
    `- No clickbait. No curiosity gaps. No invented details.\n` +
    `- End with: "Source: ${article.sourceName || "PPP TV Kenya"}"\n` +
    `- Reply with ONLY the caption text — no labels, no preamble.`;

  // Run title (Gemini+Search) and caption (Gemini+Search) in parallel
  // NVIDIA is used as fallback for caption only (it has no search capability)
  const results = await Promise.allSettled([
    hasGemini ? generateTitleWithGemini(article) : Promise.reject("no gemini"),
    hasGemini ? (async () => {
      const client = getGeminiClient(process.env.GEMINI_API_KEY!);
      const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: captionPrompt,
        config: {
          systemInstruction: CAPTION_SYSTEM,
          temperature: 0.6,
          maxOutputTokens: 800,
          tools: [{ googleSearch: {} }],
        },
      });
      const text = response.text?.trim() ?? "";
      if (!text || text.length < 40) throw new Error("empty gemini caption");
      return text;
    })() : Promise.reject("no gemini"),
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

  // Caption — prefer Gemini+Search, fall back to NVIDIA, then excerpt
  if (results[1].status === "fulfilled" && results[1].value) {
    caption = results[1].value;
  } else {
    if (results[1].status === "rejected") console.warn("[gemini] caption failed:", results[1].reason);
    // NVIDIA fallback — no search but apply known fact corrections
    if (hasNvidia) {
      try {
        const nvidiaCaptionPrompt =
          `Write a PPP TV Kenya news caption for this article.\n\n` +
          `CRITICAL FACT CORRECTIONS — apply these before writing:\n` +
          `- Uhuru Kenyatta = FORMER President of Kenya (NOT current president)\n` +
          `- William Ruto = CURRENT President of Kenya\n` +
          `- Raila Odinga = Opposition leader (never been president)\n` +
          `- Kithure Kindiki = CURRENT Deputy President\n` +
          `- Rigathi Gachagua = FORMER Deputy President (impeached 2024)\n\n` +
          `TITLE: ${article.title}\n` +
          `CATEGORY: ${article.category}\n` +
          `SOURCE: ${article.sourceName || "PPP TV Kenya"}\n` +
          (content ? `ARTICLE:\n${content}\n\n` : "\n") +
          `LEDE APPROACH: ${hookPattern}\n\n` +
          `RULES: Only use facts from the article. Apply the title corrections above. No clickbait.\n` +
          `End with: "Source: ${article.sourceName || "PPP TV Kenya"}"\n` +
          `Reply with ONLY the caption text.`;
        caption = await generateWithNvidia(nvidiaCaptionPrompt, CAPTION_SYSTEM);
      } catch (err) { console.warn("[nvidia] caption fallback failed:", err); }
    }
    if (!caption && hasGemini) {
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
    `You MUST use Google Search before writing. Search the article title and verify all facts.\n\n` +
    `REQUIRED: Search "${article.title}" and verify current titles of all people mentioned.\n` +
    `KENYA FACTS: Ruto=current president, Uhuru=FORMER president, Kindiki=current DP, Gachagua=FORMER DP.\n\n` +
    `TITLE: ${article.title}\n` +
    `CATEGORY: ${article.category}\n` +
    `SOURCE URL: ${article.url}\n` +
    (content ? `ARTICLE:\n${content}\n\n` : "\n") +
    `HOOK TECHNIQUE: ${hookPattern}\n\n` +
    `Write a PPP TV Kenya caption using only verified facts. No hashtags. No ALL CAPS. No clickbait.\n` +
    `End with: "Source: ${article.sourceName || "PPP TV Kenya"}"\n` +
    `Reply with ONLY the caption text.`;

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction: CAPTION_SYSTEM,
      temperature: 0.6,
      maxOutputTokens: 800,
      tools: [{ googleSearch: {} }],
    },
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
