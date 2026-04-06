import { GoogleGenAI } from "@google/genai";
import { Article } from "./types";

export interface AIContent {
  clickbaitTitle: string;
  caption: string;
  firstComment?: string;
  engagementType?: "debate" | "tag" | "save" | "share" | "poll";
}

let _geminiClient: GoogleGenAI | null = null;
function getGeminiClient(apiKey: string): GoogleGenAI {
  if (!_geminiClient) _geminiClient = new GoogleGenAI({ apiKey });
  return _geminiClient;
}

// ── Knowledge Base defaults — editable via /knowledge-base page ───────────────
export const KB_DEFAULTS: Record<string, string> = {
  brand_voice: `PPP TV KENYA — 24/7 Gen Z Entertainment Station for Nairobi and East Africa.
Voice: You are a knowledgeable Nairobi friend sharing news with your crew. Conversational, specific, culturally aware. NOT a formal news anchor.
Audience: 18-28 year old Nairobi Gen Z. They know Kenyan slang, follow local celebs, care about African music, sports, and global pop culture.
Tone: Excited but not fake. Real but not boring. Like texting your friend about something wild that just happened.`,

  headline_guide: `HEADLINE RULES — READ CAREFULLY:
- Exactly 4-7 words. Count them. If you write 8+ words you have FAILED.
- Start with the most prominent NAME or the BIGGEST FACT
- Use exactly ONE strong action verb: DROPS, CONFIRMS, REVEALS, SIGNS, BEATS, WINS, SLAMS, LEAVES, JOINS, BREAKS, CLAPS BACK, GOES VIRAL
- ALL CAPS. No punctuation except a dash (—)
- BANNED WORDS: SHOCKING, AMAZING, INCREDIBLE, YOU WON'T BELIEVE, MUST SEE, EXPLOSIVE, BOMBSHELL

GOOD EXAMPLES:
KIPCHOGE BREAKS MARATHON RECORD
DIAMOND SIGNS SONY MUSIC DEAL
KHALIGRAPH CLAPS BACK AT CRITICS
HARAMBEE STARS BEATS EGYPT 2-1

BAD EXAMPLES (too long, too vague):
KENYAN ATHLETICS SENSATION ACHIEVES PERSONAL BEST IN MARATHON (too long, vague)
SHOCKING NEWS FROM THE ENTERTAINMENT WORLD (banned word, vague)`,

  caption_guide: `CAPTION STRUCTURE — 3 parts, under 180 words total:

PART 1 — HOOK (1-2 sentences): Grab attention immediately
Approved openers:
- "Wait— [surprising fact]?? 😭"
- "Not [name] doing [thing] and we're not ready 🌍"  
- "[Name] really said [action] and walked away 🐐"
- "Bro [name] just [action] and the internet is losing it 💀"
- "So [name] woke up and chose [action] today 😤"

PART 2 — THE STORY (2-4 sentences): Specific facts only. No vague statements.
- Include names, numbers, dates, places
- What happened, who was involved, what it means

PART 3 — CLOSE (1 sentence): CTA + source credit
- End with: "Source: [source name]"
- CTA options: "Drop your thoughts 👇", "Tag someone who needs to see this", "Save this 📌"

RULES:
- Under 180 words. Count them.
- 2-3 emojis MAX. Place naturally, not at end of every sentence.
- NO hashtags in caption body (first comment only)
- NEVER say: "stay tuned", "watch this space", "find out why below"`,

  gen_z_guide: `GEN Z NAIROBI VOICE GUIDE:
- Write like you're texting your Nairobi friend, not filing a news report
- Use specific facts (names, numbers, places) — vague = boring
- Kenyan references land harder: mention Nairobi, specific areas, local context when relevant
- Global stories: connect to what Kenyans care about (African artists, diaspora, sports)
- Energy: excited but not cringe. Real but not dry.
- Short sentences hit harder than long ones
- Don't explain the joke. Trust your audience.`,

  kenya_knowledge: `KENYA CONTEXT:
Key artists: Khaligraph Jones, Sauti Sol, Bien, Nviiri, Bensoul, Jovial, Nikita Kering, Fena Gitu, Otile Brown, Bahati, Guardian Angel, Willy Paul, Harmonize, Diamond Platnumz, Burna Boy, Wizkid, Davido
Key sports: Harambee Stars (football), Eliud Kipchoge (marathon), Faith Kipyegon (athletics), Kenyan rugby sevens
Key media: NTV Kenya, Citizen TV, KTN, K24, Tuko, Mpasho, SPM Buzz, Ghafla
Nairobi areas: CBD, Westlands, Kilimani, Karen, Eastlands, Kasarani, Ngong Road
Kenyan slang (use sparingly): "sawa", "poa", "si unajua", "bana", "uko sure"`,

  video_topics: `VIDEO SEARCH KEYWORDS — TIERED:

TIER 1 (Always search — Kenya/Africa priority):
Kenya entertainment viral, Nairobi celebrity news, Khaligraph Jones, Sauti Sol, Diamond Platnumz, Eliud Kipchoge, Harambee Stars, SPM Buzz Kenya, Kenya music 2025, East Africa viral video, Kenyan celebrity drama, Nairobi trending

TIER 2 (Rotate — Global sports/music):
Premier League goals, Champions League highlights, Burna Boy, Wizkid, Davido, Rema Afrobeats, NBA highlights, LeBron James, viral celebrity 2025, Afrobeats new music

TIER 3 (Occasional — Background variety):
viral video today, trending worldwide, celebrity gossip, music video 2025`,

  hashtag_strategy: `HASHTAG STRATEGY (first comment only, never in caption body):

Entertainment posts: #KenyanEntertainment #NairobiLife #PPPTVKenya #KenyanCelebrity #EastAfrica
Sports posts: #HarambeeStars #KenyanSports #PremierLeague #AfricanFootball #PPPTVKenya  
Music posts: #AfroBeats #KenyanMusic #EastAfricanMusic #NewMusic #PPPTVKenya
Celebrity posts: #Celebrity #KenyanCelebrity #Nairobi #PPPTVKenya #Trending

Always include: #PPPTVKenya
Max 5 hashtags per post`,
};

// ── KB cache (module-level) ───────────────────────────────────────────────────
let _kbCache: Record<string, string> = {};
let _kbLoadTime = 0;
const KB_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function invalidateKBCache(): void {
  _kbLoadTime = 0;
}

async function getKB(): Promise<Record<string, string>> {
  const now = Date.now();
  if (_kbLoadTime > 0 && now - _kbLoadTime < KB_CACHE_TTL) return _kbCache;
  try {
    const { supabaseAdmin } = await import("./supabase");
    const { data, error } = await supabaseAdmin
      .from("knowledge_base")
      .select("id, content");
    if (error) throw error;
    const fromDB: Record<string, string> = {};
    for (const row of (data || [])) fromDB[row.id] = row.content;
    _kbCache = { ...KB_DEFAULTS, ...fromDB };
    _kbLoadTime = now;
    return _kbCache;
  } catch {
    console.warn("[kb] Supabase unreachable, using defaults");
    _kbCache = { ...KB_DEFAULTS };
    _kbLoadTime = now;
    return _kbCache;
  }
}

// ── Retry wrapper ─────────────────────────────────────────────────────────────
async function generateWithRetry(
  fn: () => Promise<string>,
  validate: (s: string) => boolean,
  fallback: string,
  maxRetries = 2
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await fn();
      if (validate(result)) return result;
    } catch (err: any) {
      console.warn(`[gemini] attempt ${attempt + 1} failed:`, err.message);
    }
  }
  console.warn(`[gemini] AI fallback used: all ${maxRetries} attempts failed`);
  return fallback;
}

// ── Headline post-processing ──────────────────────────────────────────────────
const BANNED_WORDS = [
  "SHOCKING", "AMAZING", "INCREDIBLE",
  "YOU WON'T BELIEVE", "MUST SEE", "EXPLOSIVE", "BOMBSHELL",
];

function enforceHeadlineRules(headline: string): string {
  let h = headline.toUpperCase();
  // Strip banned words
  for (const bw of BANNED_WORDS) {
    h = h.replace(new RegExp("\\b" + bw + "\\b", "g"), "").trim();
  }
  // Strip disallowed punctuation (keep letters, digits, spaces, dash)
  h = h.replace(/[^A-Z0-9 —\-]/g, "").replace(/\s{2,}/g, " ").trim();
  // Truncate to 7 words
  const words = h.split(" ").filter(Boolean);
  if (words.length > 7) h = words.slice(0, 7).join(" ");
  return h;
}

// ── Hashtag bank ──────────────────────────────────────────────────────────────
const HASHTAG_BANK: Record<string, string[]> = {
  MUSIC:         ["#KenyaMusic", "#AfrobeatKenya", "#NairobiMusic", "#EastAfricaMusic", "#PPPTVKenya", "#MusicKE", "#NewMusic", "#Afrobeats", "#Bongo", "#WCB"],
  CELEBRITY:     ["#KenyaCelebrity", "#NairobiCelebs", "#PPPTVKenya", "#KenyaEntertainment", "#CelebNews", "#Nairobi", "#EastAfrica", "#AfricaCelebs"],
  ENTERTAINMENT: ["#KenyaEntertainment", "#NairobiEntertainment", "#PPPTVKenya", "#EntertainmentKE", "#NairobiLife", "#EastAfrica", "#Kenya"],
  "TV & FILM":   ["#KenyaTV", "#AfricanFilm", "#KenyaMovies", "#PPPTVKenya", "#Netflix", "#NairobiCinema", "#AfroFilm"],
  MOVIES:        ["#KenyaMovies", "#NairobiCinema", "#AfricanFilm", "#PPPTVKenya", "#MovieNews", "#FilmKenya", "#Hollywood"],
  SPORTS:        ["#KenyaSports", "#HarambeeStars", "#KenyaAthletics", "#PPPTVKenya", "#KenyaFootball", "#PremierLeague", "#ChampionsLeague", "#AFCON"],
  COMEDY:        ["#KenyaComedy", "#PPPTVKenya", "#Funny", "#Viral", "#EastAfrica", "#NairobiComedy", "#ComedyKE"],
  TECHNOLOGY:    ["#KenyaTech", "#AfricaTech", "#PPPTVKenya", "#Innovation", "#AI", "#SiliconSavannah", "#Safaricom", "#MPesa"],
  SCIENCE:       ["#Science", "#PPPTVKenya", "#Technology", "#Innovation", "#SpaceNews", "#Climate", "#AI", "#Research"],
  LIFESTYLE:     ["#KenyaLifestyle", "#NairobiLife", "#PPPTVKenya", "#Fitness", "#Fashion", "#EastAfrica", "#LifestyleKenya"],
  FASHION:       ["#KenyaFashion", "#NairobiFashion", "#PPPTVKenya", "#AfricanFashion", "#Style", "#Nairobi", "#EastAfricaFashion"],
  AWARDS:        ["#KenyaAwards", "#PPPTVKenya", "#BET", "#Grammys", "#MtvAwards", "#AfricaMusic", "#Entertainment"],
  EVENTS:        ["#KenyaEvents", "#NairobiEvents", "#PPPTVKenya", "#EastAfrica", "#Nairobi", "#KenyaEntertainment"],
  HEALTH:        ["#HealthKE", "#WellnessKenya", "#PPPTVKenya", "#MentalHealth", "#FitnessKE", "#Kenya", "#EastAfrica"],
  BUSINESS:      ["#KenyaBusiness", "#PPPTVKenya", "#NSE", "#StartupKenya", "#Safaricom", "#MPesa", "#KCB", "#EquityBank"],
  "EAST AFRICA": ["#EastAfrica", "#Kenya", "#Tanzania", "#Uganda", "#PPPTVKenya", "#EAC", "#Nairobi", "#DaresSalaam"],
  INFLUENCERS:   ["#KenyaInfluencer", "#NairobiCreator", "#PPPTVKenya", "#ContentCreator", "#Instagram", "#TikTokKenya"],
  NEWS:          ["#KenyaNews", "#NairobiNews", "#PPPTVKenya", "#EastAfrica", "#Kenya", "#NairobiToday"],
  GENERAL:       ["#Kenya", "#Nairobi", "#PPPTVKenya", "#EastAfrica", "#NairobiLife", "#KenyaNews"],
};

const ENGAGEMENT_CTAS = [
  { cta: "Follow @ppptvke — we drop this stuff first 🔥", type: "share" as const },
  { cta: "Follow @ppptvke for daily entertainment & sports from Kenya 👇", type: "share" as const },
  { cta: "Tag someone who needs to see this 👀", type: "tag" as const },
  { cta: "What's your take? Drop it below 💬", type: "debate" as const },
  { cta: "Follow @ppptvke — Kenya's Gen Z entertainment page ✅", type: "share" as const },
  { cta: "Are you surprised? Let us know 👇", type: "debate" as const },
  { cta: "Share this with the squad 🔁", type: "share" as const },
  { cta: "Save this for later 🔖", type: "save" as const },
  { cta: "Follow for more 🌍", type: "share" as const },
  { cta: "Who else saw this coming? 💭", type: "debate" as const },
];

function getHashtags(category: string): string {
  const key = category?.toUpperCase();
  return (HASHTAG_BANK[key] ?? HASHTAG_BANK.GENERAL).join(" ");
}

function getEngagementCTA() {
  return ENGAGEMENT_CTAS[Math.floor(Math.random() * ENGAGEMENT_CTAS.length)];
}

export async function verifyStory(title: string, _url: string): Promise<{ verified: boolean; reason: string; confidence: number }> {
  const lowerTitle = title.toLowerCase();
  if (["satire", "parody", "fake news", "hoax"].some(h => lowerTitle.includes(h))) {
    return { verified: false, reason: "hoax indicator in title", confidence: 0 };
  }
  return { verified: true, reason: "trusted source pipeline", confidence: 80 };
}

// ── Headline generator ────────────────────────────────────────────────────────
async function generateHeadline(article: Article, client: GoogleGenAI, kb: Record<string, string>): Promise<string> {
  const rawTitle = article.title.replace(/#\w+/g, "").replace(/\s{2,}/g, " ").trim();
  const body = article.fullBody?.trim() || article.summary?.trim() || "";

  const systemInstruction = kb.headline_guide || KB_DEFAULTS.headline_guide;

  const prompt = `ARTICLE: ${rawTitle}
CATEGORY: ${article.category}
${body ? `CONTEXT: ${body.slice(0, 500)}` : ""}
SOURCE: ${article.sourceName || ""}

Write ONE 4-7 word ALL CAPS headline:`;

  const fallback = enforceHeadlineRules(rawTitle.slice(0, 80));

  return generateWithRetry(
    async () => {
      const response = await client.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { systemInstruction, temperature: 0.65, maxOutputTokens: 80 },
      });
      const text = response.text?.trim().replace(/^["'*`]|["'*`.$]$/g, "").toUpperCase() ?? "";
      return enforceHeadlineRules(text);
    },
    (s) => s.length >= 6 && s.length <= 100,
    fallback,
  );
}

// ── Caption post-processing ───────────────────────────────────────────────────
function truncateCaptionToWordLimit(caption: string, limit = 180): string {
  const words = caption.split(/\s+/);
  if (words.length <= limit) return caption;
  // Find last complete sentence before word limit
  const truncated = words.slice(0, limit).join(" ");
  const lastPeriod = Math.max(truncated.lastIndexOf("."), truncated.lastIndexOf("!"), truncated.lastIndexOf("?"));
  return lastPeriod > 0 ? truncated.slice(0, lastPeriod + 1) : truncated;
}

// ── Caption generator ─────────────────────────────────────────────────────────
async function generateCaption(article: Article, client: GoogleGenAI, kb: Record<string, string>): Promise<string> {
  const rawTitle = article.title.replace(/#\w+/g, "").replace(/\s{2,}/g, " ").trim();
  const body = article.fullBody?.trim() || article.summary?.trim() || rawTitle;
  const source = article.sourceName || "PPP TV Kenya";
  const cta = getEngagementCTA();

  const systemInstruction = [
    kb.brand_voice || KB_DEFAULTS.brand_voice,
    kb.caption_guide || KB_DEFAULTS.caption_guide,
    kb.gen_z_guide || KB_DEFAULTS.gen_z_guide,
    kb.kenya_knowledge || KB_DEFAULTS.kenya_knowledge,
  ].join("\n\n---\n\n");

  const prompt = `Write a Gen Z caption for this story. Be conversational, specific, and engaging. Talk like a knowledgeable Nairobi friend, not a news anchor.

HEADLINE: ${rawTitle}
CATEGORY: ${article.category}
FULL STORY: ${body.slice(0, 1000)}
SOURCE: ${source}
URL: ${article.url || ""}

Structure:
- HOOK: 1-2 punchy opening sentences (use the Gen Z opener style from the guide)
- STORY: 2-3 sentences with the actual facts, names, numbers
- CLOSE: 1 sentence that invites engagement OR explains why this matters
- End with exactly: "${cta.cta}"
- Final line: "Source: ${source}"

RULES: Under 180 words. 2-3 emojis max. No hashtags. No "stay tuned". No withholding info. Only use verified facts from the article.

Reply with ONLY the caption:`;

  const fallback = `${body.slice(0, 400)}\n\n${cta.cta}\n\nSource: ${source}${article.url ? `\n${article.url}` : ""}`;

  const generateOnce = async (extraConstraint = "") => {
    const finalPrompt = extraConstraint ? `${prompt}\n\n${extraConstraint}` : prompt;
    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      config: { systemInstruction, temperature: 0.75, maxOutputTokens: 600 },
    });
    return response.text?.trim() ?? "";
  };

  let caption = await generateWithRetry(
    () => generateOnce(),
    (s) => s.length >= 50,
    fallback,
  );

  // Word count enforcement (Requirement 8.8)
  if (caption.split(/\s+/).length > 180) {
    caption = await generateOnce("IMPORTANT: Your response must be under 180 words. Count carefully.").catch(() => caption);
    if (caption.split(/\s+/).length > 180) {
      caption = truncateCaptionToWordLimit(caption);
    }
  }

  return caption;
}

// ── Excerpt + caption for preview (Link Studio) ────────────────────────────────
export async function buildExcerptCaption(article: Article): Promise<{ headline: string; caption: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  const rawTitle = article.title || "PPP TV Kenya";

  if (!apiKey) {
    return {
      headline: rawTitle.toUpperCase().slice(0, 80),
      caption: `${rawTitle}\n\nFollow @ppptvke 🔥\n\nSource: ${article.sourceName || "PPP TV Kenya"}`,
    };
  }

  const client = getGeminiClient(apiKey);
  const kb = await getKB();

  const [headline, caption] = await Promise.all([
    generateHeadline(article, client, kb),
    generateCaption(article, client, kb),
  ]);

  return { headline, caption };
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateAIContent(
  article: Article,
  _options?: { isVideo?: boolean; videoType?: string; tone?: "formal" | "casual" | "hype" | "sheng"; language?: "en" | "sw" }
): Promise<AIContent> {
  const apiKey = process.env.GEMINI_API_KEY;
  const hashtags = getHashtags(article.category);
  const cta = getEngagementCTA();
  const rawTitle = article.title.replace(/#\w+/g, "").replace(/\s{2,}/g, " ").trim();
  const body = article.fullBody?.trim() || article.summary?.trim() || rawTitle;

  if (!apiKey) {
    return {
      clickbaitTitle: rawTitle.toUpperCase().slice(0, 80),
      caption: `${body.slice(0, 300)}\n\n${cta.cta}\n\nSource: ${article.sourceName || "PPP TV Kenya"}`,
      firstComment: hashtags,
      engagementType: cta.type,
    };
  }

  const client = getGeminiClient(apiKey);
  const kb = await getKB();

  const [headline, caption] = await Promise.all([
    generateHeadline(article, client, kb),
    generateCaption(article, client, kb),
  ]);

  return { clickbaitTitle: headline, caption, firstComment: hashtags, engagementType: cta.type };
}

// ── Legacy NVIDIA fallback ────────────────────────────────────────────────────
export async function generateWithNvidiaLegacy(prompt: string, systemPrompt: string): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY not set");
  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "meta/llama-3.1-8b-instruct",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
      temperature: 0.6, max_tokens: 800,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`NVIDIA API error ${res.status}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}
