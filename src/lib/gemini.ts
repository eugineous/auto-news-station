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

// ── Entertainment caption system prompt (non-news categories) ────────────────
const ENTERTAINMENT_CAPTION_SYSTEM = `You are the senior content writer at PPP TV Kenya — Kenya's #1 entertainment and sports media brand on Instagram and Facebook.

PAGE IDENTITY: PPP TV Kenya is the go-to source for entertainment, sports, music, celebrity news, and lifestyle content in Kenya and East Africa. Every caption must sound like a premium Kenyan media brand with personality, voice, and editorial flair.

STRUCTURE (3 parts, blank line between each):

1. HOOK — The FIRST sentence MUST be a strong curiosity or emotional hook. Create tension, conflict, emotional pull, or a surprising reveal. Do NOT copy the headline. Do NOT start with the person's name followed by a boring fact. Make the reader feel something or want to know more.

2. NARRATIVE — 2–3 sentences of context using verified facts from the article. Tell the story: what happened, who is involved, what it means. Write like a storyteller, not a press release. Use specific names, places, and details.

3. CTA — End with a content-matched call to action that fits the story's intent. A CTA will be injected separately — leave a natural closing sentence that invites engagement.

RULES — CRITICAL:
- NO "Source:" lines anywhere in the caption body
- NO URLs anywhere in the caption body
- NO "PPP TV Verdict" or any generic branding slogans
- NO ALL CAPS anywhere in the caption body
- NO copying the article headline verbatim as the first sentence
- No hashtags in caption (they go in the first comment)
- Emojis are encouraged — use 2–4 relevant emojis to make the post feel human
- Max 150 words total
- Sound like a premium Kenyan media brand with personality and voice
- Write in casual, engaging Kenyan English unless instructed otherwise`;

// ── Caption system prompt (for news categories) ───────────────────────────────────────
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
  CELEBRITY:     ["#KenyaCelebrity", "#KenyaCeleb", "#NairobiCelebs", "#KenyanCelebs", "#PPPTVKenya", "#NairobiGossip", "#KenyaEntertainment", "#CelebNews"],
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

// Drama/conflict keywords for CELEBRITY intent detection
const CELEBRITY_DRAMA_KEYWORDS = ["split", "breakup", "break up", "fight", "beef", "drama", "cheating", "divorce", "exposed"];

// Opportunity keywords for ENTERTAINMENT intent detection
const ENTERTAINMENT_OPPORTUNITY_KEYWORDS = ["job", "hiring", "opportunity", "apply", "vacancy"];

export function getMatchedCTA(
  category: string,
  title: string
): { cta: string; type: "debate" | "tag" | "save" | "share" | "poll" } {
  const cat = category.toUpperCase();
  const titleLower = title.toLowerCase();

  if (cat === "SPORTS") {
    const sportsCTAs = [
      { cta: "Who are you backing? 👇", type: "poll" as const },
      { cta: "Drop your prediction below 🔥", type: "poll" as const },
    ];
    return sportsCTAs[Math.floor(Math.random() * sportsCTAs.length)];
  }

  if (cat === "CELEBRITY") {
    const hasDrama = CELEBRITY_DRAMA_KEYWORDS.some(kw => titleLower.includes(kw));
    if (hasDrama) {
      const dramaCTAs = [
        { cta: "Pick a side 👇", type: "debate" as const },
        { cta: "Whose side are you on? 💬", type: "debate" as const },
      ];
      return dramaCTAs[Math.floor(Math.random() * dramaCTAs.length)];
    }
    return { cta: "What do you think? Drop it below 👇", type: "debate" as const };
  }

  if (cat === "MUSIC") {
    const musicCTAs = [
      { cta: "Stream it now — link in bio 🎵", type: "share" as const },
      { cta: "Who's your favourite Kenyan artist? 👇", type: "debate" as const },
    ];
    return musicCTAs[Math.floor(Math.random() * musicCTAs.length)];
  }

  if (cat === "ENTERTAINMENT") {
    const hasOpportunity = ENTERTAINMENT_OPPORTUNITY_KEYWORDS.some(kw => titleLower.includes(kw));
    if (hasOpportunity) {
      return { cta: "Send this to someone who needs to see it 👀", type: "share" as const };
    }
  }

  if (cat === "TV & FILM" || cat === "MOVIES") {
    const filmCTAs = [
      { cta: "Would you watch this? 👇", type: "poll" as const },
      { cta: "Tag someone to watch this with 🎬", type: "tag" as const },
    ];
    return filmCTAs[Math.floor(Math.random() * filmCTAs.length)];
  }

  return { cta: "What do you think? Drop it below 👇", type: "debate" as const };
}

// ── Entertainment caption prompt builder ─────────────────────────────────────
function entertainmentCaptionPrompt(
  article: Article,
  hookPattern: string,
  toneInstruction: string
): string {
  const content = (article.fullBody?.trim().length ?? 0) > 50
    ? article.fullBody.trim().slice(0, 2000)
    : (article.summary?.trim() ?? "");

  // Detect Reddit source and extract upvote context for the prompt
  const isReddit = article.sourceName?.includes("upvotes") || article.url?.includes("reddit.com");
  const redditContext = isReddit
    ? `\nSOCIAL PROOF: This content already earned ${article.sourceName} on Reddit — it's proven viral. Reference this credibility in your caption (e.g. "This clip is breaking the internet..." or "The internet can't stop talking about this..."). Use the Reddit community's energy as your hook foundation.\n`
    : "";

  return (
    `Write a PPP TV Kenya caption for this ${article.category} story.\n\n` +
    `CATEGORY: ${article.category}\n` +
    `TITLE: ${article.title}\n` +
    (article.sourceName ? `SOURCE: ${article.sourceName}\n` : "") +
    (article.summary ? `SUMMARY: ${article.summary.slice(0, 300)}\n` : "") +
    (content ? `ARTICLE:\n${content}\n\n` : "\n") +
    redditContext +
    `HOOK APPROACH: ${hookPattern}\n\n` +
    `TONE: ${toneInstruction}\n\n` +
    `RULES:\n` +
    `- First sentence MUST be a strong hook — curiosity, tension, or emotional pull\n` +
    `- Follow with 2–3 sentences of narrative context using facts from the article\n` +
    `- End with a natural closing line that invites engagement (CTA will be appended separately)\n` +
    `- NO "Source:" lines — attribution goes in the first comment, not here\n` +
    `- NO URLs in the caption body\n` +
    `- NO "PPP TV Verdict" or generic branding slogans\n` +
    `- NO ALL CAPS\n` +
    `- Max 150 words\n` +
    `- Reply with ONLY the caption text — no labels, no preamble`
  );
}

// ── Credibility verification — cross-reference before posting ────────────────
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
  const tone = _options?.tone || "casual";
  const language = _options?.language || "en";
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasNvidia = !!process.env.NVIDIA_API_KEY;

  const isSheng = tone === "sheng";
  const isSwahili = language === "sw";

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

  const isNews = isNewsCategory(article.category);

  // News categories use the journalist-style prompt with Google Search grounding.
  // Non-news categories use the entertainment-specific prompt (hook + narrative + CTA).
  const activeCaptionPrompt = isNews
    ? (
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
      `- Reply with ONLY the caption text — no labels, no preamble.`
    )
    : entertainmentCaptionPrompt(article, hookPattern, toneInstruction);

  const activeSystemPrompt = isNews ? CAPTION_SYSTEM : ENTERTAINMENT_CAPTION_SYSTEM;

  // Run title (Gemini+Search) and caption (Gemini+Search) in parallel
  // NVIDIA is used as fallback for caption only (it has no search capability)
  const results = await Promise.allSettled([
    hasGemini ? generateTitleWithGemini(article) : Promise.reject("no gemini"),
    hasGemini ? (async () => {
      const client = getGeminiClient(process.env.GEMINI_API_KEY!);
      const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: activeCaptionPrompt,
        config: {
          systemInstruction: activeSystemPrompt,
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

  // Strip source/URL clutter from caption body (applies to all categories)
  // The news CAPTION_SYSTEM prompt instructs the model to end with "Source: [name]" —
  // that line is intentionally stripped here and moved to firstComment instead.
  caption = caption
    .replace(/^Source:\s*.+$/gim, "")
    .replace(/^Credit:\s*.+$/gim, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/PPP TV Verdict[:\s]*/gi, "")
    .replace(/The story is just getting started\.?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Build first comment: hashtags + source attribution (keeps caption body clean)
  // Non-news categories get a content-matched CTA; news categories keep the generic one
  const engagementCTA = isNews
    ? getEngagementCTA()
    : getMatchedCTA(article.category, article.title);
  const hashtags = getHashtags(article.category);
  const firstComment = `${hashtags}\n\nSource: ${article.sourceName || "PPP TV Kenya"} | ${article.url}`;

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
    .trim();

  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) ?? [];
  let excerpt = "";
  if (sentences.length > 1) {
    excerpt = sentences.slice(1).join(" ").trim().slice(0, 400);
  }
  if (!excerpt || excerpt.length < 30) {
    excerpt = cleaned.slice(0, 400);
  }

  const titleIntro = article.title
    ? `Here's what we know about "${article.title.slice(0, 80)}".\n\n`
    : "";

  return (titleIntro + (excerpt || article.title)).trim() + "\n\nWhat do you think? 👇";
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
