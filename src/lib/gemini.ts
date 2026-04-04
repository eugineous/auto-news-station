import { GoogleGenAI } from "@google/genai";
import { Article } from "./types";

export interface AIContent {
  clickbaitTitle: string;
  caption: string;
  firstComment?: string; // hashtags go here — keeps caption clean, boosts reach
  engagementType?: "debate" | "tag" | "save" | "share" | "poll";
}

// ── Gemini 2.5 Flash — used for EVERYTHING (titles + captions) ─────────────────
let _geminiClient: GoogleGenAI | null = null;
function getGeminiClient(apiKey: string): GoogleGenAI {
  if (!_geminiClient) _geminiClient = new GoogleGenAI({ apiKey });
  return _geminiClient;
}

// ── COMPREHENSIVE KENYA & GLOBAL KNOWLEDGE BASE ───────────────────────────────
const KENYA_KNOWLEDGE_BASE = `
=== KENYA KNOWLEDGE BASE (2024-2026) ===

POLITICAL FACTS (for accuracy only — we avoid political content):
- William Ruto = CURRENT President of Kenya (since September 2022) — Kenya Kwanza coalition
- Uhuru Kenyatta = FORMER President (served 2013-2022, NOT current) — "former President Kenyatta"
- Raila Odinga = Opposition leader / former PM (NEVER been president) — "ODM leader Raila"
- Kithure Kindiki = CURRENT Deputy President (since October 2024, after Gachagua impeachment)
- Rigathi Gachagua = FORMER Deputy President (impeached October 2024)

KENYAN MUSIC SCENE — CURRENT ACTIVE ARTISTS:
Gengetone/Genge: Ethic Entertainment (Swat, Seska, Rekles, Morphspesh), Sailors Gang, Boondocks Gang, Mejja, Wakadinali
Afropop/Afrobeats: Sauti Sol (Bien, Chimano, Savara, Polycarp — as group & solo), Nadia Mukami, Jovial, Nikita Kering, Bensoul, H_art The Band
Hip-hop/Rap: Khaligraph Jones (OG Flow254), Nyashinski, Octopizzo, Trio Mio, Ssaru, Exray Taniua, Chris Kaiga, Breeder LW
Gospel: Guardian Angel, Size 8 Reborn (also secular), Bahati (also secular), Emmy Kosgei, Mercy Masika, Ringtone Apoko
RnB/Pop: Otile Brown (Wasafi signee), Tanasha Donna (ex-Diamond Platnumz), Arrow Bwoy, Rosa Ree, Timmy Tdat
Old school icons: Nameless & Wahu, Jua Cali, Bamboo, DNA, E-Sir (deceased 2003 — legend status)
Gospel-secular crossover: Size 8, Bahati David, Guardian Angel & wife Esther Chungu
Diaspora/International: Bien Baraza (solo), Crystal Asige (blind vocalist)

East Africa (Tanzania): Diamond Platnumz (WCB Wasafi — biggest artist), Harmonize (own label), Zuchu (WCB — Diamond's protégé), Nandy, Mbosso, Rayvanny, Ali Kiba, Rich Mavoko, Marioo
Uganda: Eddy Kenzo, Jose Chameleone, Bobi Wine (now politician), Bebe Cool, Cindy Sanyu
Rwanda: Bruce Melody, Meddy

Global Afrobeats: Burna Boy (Nigeria — Grammy winner), Wizkid (Nigeria — Made In Lagos), Davido (Nigeria — 30BG), Rema, Tems, Asake, Ayra Starr, Kizz Daniel (Bongo flavour), Fireboy DML

Global Pop/Hip-hop (popular in Kenya):
- Hip-hop: Drake, Kendrick Lamar, Travis Scott, J. Cole, 21 Savage, Lil Baby, Future, Gunna
- Pop: Taylor Swift, Billie Eilish, Dua Lipa, Olivia Rodrigo, Harry Styles, The Weeknd, Bad Bunny
- R&B: SZA, Beyoncé, Rihanna, Chris Brown, Usher, Cardi B, Nicki Minaj
- UK: Stormzy, Dave, Headie One, Little Simz, Skepta, Central Cee, Ice Spice

KENYAN SPORTS — KEY FACTS:
Athletics legends: Eliud Kipchoge (GOAT marathoner — 2:00:35 world record), Faith Kipyegon (1500m + 5000m world record holder), Timothy Cheruiyot, Hellen Obiri, Agnes Tirop (RIP), Peres Jepchirchir, Ruth Chepngetich
Football (Harambee Stars): Victor Wanyama (retired/coaching), Michael Olunga (Al-Duhail Qatar, top scorer), McDonald Mariga, Ayub Timbe Masika (Reading FC)
Kenyan Premier League: Gor Mahia FC (K'Ogalo), AFC Leopards (Ingwe), Tusker FC (Brewers), Nairobi City Stars, KCB FC, Bandari FC
Boxing: Nick Okoth, Rayton "Boom Boom" Okwiri (Commonwealth champion)
Rugby: Kenya Simbas (national 15s team), Kenya Sevens (Shujaa — Commonwealth medals)

Global Football teams Kenyans follow (in order of popularity):
Premier League: Arsenal (MASSIVE following), Manchester United (old school fans), Chelsea, Liverpool, Manchester City, Tottenham
Champions League: Real Madrid, Barcelona, Bayern Munich, PSG, Inter Milan
Africa: CAF Champions League, AFCON (Kenya competed in 2023)

KENYAN CELEBRITIES & INFLUENCERS:
Media personalities: Jalang'o (now Langata MP), Shaffie Weru (fired Kiss FM), Mwende Macharia, Willis Raburu, Amina Abdi Rabar, Ezra Chiloba
YouTubers/Content creators: Mungai Eve (2M+ subscribers, Stivo Simple Boy ex), Director Roy, Thee Pluto, Flaqo Raz (comedy), Abel Mutua (Scandalious), The Real Ndung'u
Instagram viral: Eric Omondi (comedian, famous exes — Chantal, Lynda Nyangweso, Carol Sonie), Akothee (Miss Pendo, always controversial), Vera Sidika (bleaching scandal then reversal, Baby Asia), Zari Hassan (Diamond's ex)
Reality/Drama: Size 8 & DJ Mo marital drama, Diamond Platnumz & Zari/Tanasha/WCB drama, Bahati & Diana Marua "Sweetheart" drama
Influencers: Azziad Nasenya (viral TikTok dancer 2020), Natalie Tewa (broke up with Rnaze), Maureen Waititu & Frankie JustGymIt drama

KENYAN ENTERTAINMENT MEDIA:
TV: Citizen TV (Royal Media), NTV Kenya, KTN (Standard Media), K24 TV, Switch TV, PBS Kenya
Radio: Radio Maisha, Radio Citizen, Ghetto Radio, Hot 96 FM, Capital FM, Kiss FM, NRJ Kenya
Digital/Online: Tuko, Mpasho, Ghafla Kenya, Pulse Live Kenya, SDE (Sema Daily Entertainment), Standard Entertainment, The Star, Kenyans.co.ke
OTT/Streaming: Netflix Kenya (very popular), ShowMax Africa, Maisha Magic East (Swahili shows)
YouTube: Churchill Show, Comedy Alumni, Tahidi High (nostalgia), Papa Shirandula (RIP Muggi Munene)

KENYAN CULTURE & SLANG (Gen Z/Millennial vocabulary):
Food: Nyama Choma (roast meat), Ugali (staple), Sukuma Wiki, Githeri, Mutura (blood sausage), Mandazi, Chai ya Debe
Nairobi: CBD (town), Westlands (entertainment hub), Kilimani, Kileleshwa, Karen, Eastlands (Umoja, Kayole, Mathare), Ngong Hills, Ruiru, Thika Road
Transport: Matatu (14-seater minibus), Boda Boda (motorcycle taxi), Tuk Tuk
Gen Z slang (2024-2025): "Cheza kama wewe" (play your game), "Kubeba" (endure silently), "Baze" (base/hood), "Fiti" (fine), "Morio" (my guy), "Nyef nyef" (nonsense), "Hustler" (self-made person), "Sawa tu" (all good), "Tuko pamoja" (we're together)
Millennial slang: "Poa" (cool), "Msee" (dude), "Fala" (fool), "Bonfire" (relationship problem), "GOAT", "Noma"
Social: Gen Zs hate politics, love football, Afrobeats, TikTok trends, fashion, side hustles

KENYA TECH & ECONOMY:
M-Pesa (Safaricom) — world's most advanced mobile money system
Silicon Savannah (iHub, Andela alumni, Cellulant)
Safaricom (NSE-listed, most profitable company), KCB Group, Equity Bank, Co-op Bank
NSE (Nairobi Securities Exchange) — NASI, NSE-20 indices
KPLC (Kenya Power), NHIF (National Health Insurance Fund)
Startups: Twiga Foods, Lori Systems, Sendy, Pezesha, Kwara

SCIENCE & TECH GLOBALLY (Gen Z loves this):
AI news: ChatGPT, Claude (Anthropic), Gemini (Google), Grok (xAI), Midjourney, Sora
Space: SpaceX (Falcon 9, Starship), NASA, ESA, ISRO
Climate: COP30, solar energy, EV revolution (Tesla, BYD), Kenya's geothermal (Olkaria)
Biotech: mRNA vaccines, CRISPR gene editing, longevity research
Gaming: GTA VI launch, console wars, esports in Kenya

LIFESTYLE (Gen Z priorities):
Fitness & wellness: gym culture, yoga, mental health awareness
Fashion: Nairobi fashion week, African prints (Ankara, Kitenge), streetwear
Food: Nairobi food scene, content creator food vlogs, health food trends
Travel: Maasai Mara (wildebeest migration August-October), Diani Beach, Nairobi National Park, Mount Kenya, Amboseli
Relationships: Gen Z dating culture, situationships, "situationships turned official"
`;

// ── HEADLINE WRITING MASTERCLASS ──────────────────────────────────────────────
const HEADLINE_GUIDE = `
=== HEADLINE WRITING MASTERCLASS ===

WHAT MAKES A GREAT THUMBNAIL HEADLINE:
1. SPECIFIC > VAGUE: "KHALIGRAPH JONES DROPS DISS AT MEJJA" beats "KENYAN RAPPER RESPONDS"
2. ACTIVE VERBS: DROPS, CONFIRMS, REVEALS, BREAKS, SIGNS, BEATS, WINS, LEAVES, SLAMS
3. NAME + ACTION: Start with the person's name, then what they did
4. NUMBERS WORK: "SAUTI SOL SELLS OUT 3 CONTINENTS ON WORLD TOUR"
5. CONTRAST/TWIST: "FROM BROKE TO BILLIONAIRE: DIAMOND'S RISE"
6. FIRST-EVER/RECORD: "KIPCHOGE BREAKS OWN WORLD RECORD — AGAIN"
7. SHORT = POWERFUL: Under 8 words is ideal for image readability

HEADLINE FORMULAS:
Formula A: [NAME] [STRONG VERB] [OBJECT/OUTCOME]
"ELIUD KIPCHOGE SIGNS GLOBAL BRAND DEAL"

Formula B: [NAME] CONFIRMS/REVEALS [SECRET/NEWS]
"VERA SIDIKA CONFIRMS SECOND PREGNANCY"

Formula C: [NAME] vs [NAME]: [OUTCOME]
"KHALIGRAPH JONES vs MEJJA: WHO WON THE BEEF?"

Formula D: [RECORD/NUMBER] — [WHO DID IT]
"2:00:35 — KIPCHOGE BREAKS MARATHON RECORD AGAIN"

Formula E: [VERB]-ING: [NAME] [CONTEXT]
"BREAKING: DIAMOND PLATNUMZ OPENS NAIROBI CONCERT"

WORDS TO NEVER USE IN HEADLINES:
- "SHOCKING" — lazy and overused
- "YOU WON'T BELIEVE" — banned by Meta algorithm
- "MUST SEE" — clickbait penalty
- "AMAZING" or "INCREDIBLE" alone — too vague
- "BREAKING" unless it truly is breaking news

POWER WORDS TO USE:
DROPS (music/diss), CONFIRMS (relationships), REVEALS (exclusive), SIGNS (deals), BEATS (competition), WINS (awards/games), JOINS (teams), LEAVES (exits), SLAMS (criticism), GOES VIRAL, CLAPS BACK, TEASES (upcoming project), OFFICIALLY (confirmation), FIRST EVER, RECORD
`;

// ── CAPTION WRITING SYSTEM PROMPT ─────────────────────────────────────────────
const CAPTION_SYSTEM = `You are the head writer at PPP TV Kenya — Kenya's fastest-growing 24/7 Gen Z entertainment network.

${KENYA_KNOWLEDGE_BASE}

BRAND VOICE:
- Smart, confident, conversational — like a knowledgeable Nairobi friend explaining big news
- Gen Z aware but not trying too hard to be Gen Z — just real
- We cover: entertainment, music, sports, science, lifestyle, comedy, celebrity news
- We DO NOT cover: politics (zero political content — we're entertainment)
- We're faster than NTV, sharper than Tuko, more global than Mpasho

CAPTION STRUCTURE — 3 parts, blank line between each:

PART 1 — THE HOOK (1-2 sentences):
Lead with the most newsworthy fact. WHO did WHAT, WHERE, WHEN.
Use a strong opening — could be a direct quote, a surprising number, or the key outcome.
Example: "Diamond Platnumz has officially confirmed he's signing a global deal with Sony Music Africa — making him the first Tanzanian artist to join the label's international roster."

PART 2 — THE STORY (2-4 sentences):
Give the full context. What led to this? What does it mean? Who's affected?
Write like you're explaining it to a smart friend who missed the story.
Include specific details: names, numbers, dates, quotes from the source.
Example: "The deal, reportedly worth $3 million over three years, will see Diamond release his next album globally with Sony distribution in 54 African countries and the US. The announcement came at a Dar es Salaam press conference attended by Sony Africa CEO Graeme Gilfillan."

PART 3 — THE CLOSE + SOURCE (1-2 sentences):
Either: (a) what happens next, (b) why it matters to the reader, (c) a genuine question that invites comment.
Then the source credit.
Example: "Watch out for the album drop expected Q3 2025 — this is the biggest music business move out of East Africa this year. Source: Diamond Platnumz official Instagram / Billboard Africa"

RULES — CRITICAL:
- ONLY use facts from the article — never invent or assume
- NO clickbait phrases: "you won't believe", "stay tuned", "shocking", "breaking news" (unless verified breaking)
- NO withholding information — Meta algorithmically penalizes curiosity-gap posts
- NO ALL CAPS in body text
- NO hashtags (they go in first comment)
- 2-4 emojis max — use them naturally like a real person would
- Under 220 words total
- Always credit the source at the end
- Write like a journalist, sound like a friend`;

// ── HEADLINE SYSTEM PROMPT ─────────────────────────────────────────────────────
const HEADLINE_SYSTEM = `You are the creative director at PPP TV Kenya — a 24/7 Gen Z entertainment network in Kenya.

${KENYA_KNOWLEDGE_BASE}

${HEADLINE_GUIDE}

YOUR TASK: Write ONE thumbnail headline for a news image card on Instagram/Facebook.

RULES:
- ALL CAPS (mandatory — it's for a visual image)
- 5-9 words ideal (shorter = more readable at small size)
- Must be specific and factual — use the actual names and facts from the article
- Use active verbs: DROPS, CONFIRMS, REVEALS, SIGNS, BEATS, WINS, SLAMS
- NO: "SHOCKING", "YOU WON'T BELIEVE", "MUST SEE", "AMAZING" alone
- NO emojis, no hashtags, no quotes, no full stops
- Capture the single most important fact
- Think: front page of a newspaper — specific, factual, direct

RESPOND WITH ONLY THE HEADLINE. Nothing else. No explanation.`;

// ── Curiosity hook patterns — vary the opening style ──────────────────────────
const HOOK_PATTERNS = [
  "Lead with the most surprising verifiable fact — a specific number, name, or outcome.",
  "Lead with the consequence first, then explain the cause — creates tension without hiding facts.",
  "Lead with a direct quote from a key person if one is available.",
  "Lead with what changed today — what's different now because of this story.",
  "Lead with the most specific detail — an exact time, figure, or location that makes it feel immediate.",
];

// ── Hashtag bank — comprehensive, by category ──────────────────────────────────
const HASHTAG_BANK: Record<string, string[]> = {
  MUSIC:         ["#KenyaMusic", "#AfrobeatKenya", "#NairobiMusic", "#EastAfricaMusic", "#PPPTVKenya", "#MusicKE", "#NewMusic", "#Afrobeats", "#Bongo", "#WCB"],
  CELEBRITY:     ["#KenyaCelebrity", "#NairobiCelebs", "#PPPTVKenya", "#KenyaEntertainment", "#CelebNews", "#Nairobi", "#EastAfrica", "#AfricaCelebs"],
  ENTERTAINMENT: ["#KenyaEntertainment", "#NairobiEntertainment", "#PPPTVKenya", "#EntertainmentKE", "#NairobiLife", "#EastAfrica", "#Kenya"],
  "TV & FILM":   ["#KenyaTV", "#AfricanFilm", "#KenyaMovies", "#PPPTVKenya", "#Netflix", "#NairobiCinema", "#AfroFilm"],
  MOVIES:        ["#KenyaMovies", "#NairobiCinema", "#AfricanFilm", "#PPPTVKenya", "#MovieNews", "#FilmKenya", "#Hollywood"],
  SPORTS:        ["#KenyaSports", "#HarambeeStars", "#KenyaAthletics", "#PPPTVKenya", "#KenyaFootball", "#PremierLeague", "#ChampionsLeague", "#AFCON"],
  COMEDY:        ["#KenyaComedy", "#PPPTVKenya", "#Funny", "#Viral", "#EastAfrica", "#NairobiComedy", "#ComedyKE"],
  TECHNOLOGY:    ["#KenyaTech", "#AfricaTech", "#PPPTVKenya", "#Innovation", "#AI", "#SiliconSavannah", "#Safaricom", "#MPesa"],
  SCIENCE:       ["#Science", "#PPPTVKenya", "#Technology", "#Innovation", "#SpaceKenya", "#Climate", "#AI", "#Research"],
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

// ── Engagement CTAs — factual + follow hooks (Meta algorithm safe) ─────────────
const ENGAGEMENT_CTAS = [
  { cta: "Follow @ppptvke for daily entertainment & sports from East Africa. 🔥", type: "share" as const },
  { cta: "Follow for more content from Kenya & the world. 👇", type: "share" as const },
  { cta: "Follow @ppptvke — Kenya's #1 Gen Z entertainment page. ✅", type: "share" as const },
  { cta: "Tag someone who'd want to know this! 👀", type: "tag" as const },
  { cta: "What's your take on this? Drop it in the comments. 💬", type: "debate" as const },
  { cta: "Follow @ppptvke for the latest from Kenya & beyond. 🌍", type: "share" as const },
  { cta: "Share this with the squad! 🔁", type: "share" as const },
  { cta: "Save this for the tea later. 🔖", type: "save" as const },
  { cta: "Follow for daily sports & entertainment updates. ⚽🎵", type: "share" as const },
  { cta: "Are you surprised? Let us know below. 💭", type: "debate" as const },
  { cta: "Follow @ppptvke — breaking stories first, always. ⚡", type: "share" as const },
];

function getHashtags(category: string): string {
  const key = category?.toUpperCase();
  const tags = HASHTAG_BANK[key] ?? HASHTAG_BANK.GENERAL;
  return tags.join(" ");
}

function getEngagementCTA(): { cta: string; type: "debate" | "tag" | "save" | "share" | "poll" } {
  return ENGAGEMENT_CTAS[Math.floor(Math.random() * ENGAGEMENT_CTAS.length)];
}

// ── Story verification — lightweight check ─────────────────────────────────────
export async function verifyStory(title: string, _url: string): Promise<{ verified: boolean; reason: string; confidence: number }> {
  const lowerTitle = title.toLowerCase();
  const obviousHoax = ["satire", "parody", "fake news", "not real", "hoax"];
  if (obviousHoax.some(h => lowerTitle.includes(h))) {
    return { verified: false, reason: "title contains hoax indicator", confidence: 0 };
  }
  return { verified: true, reason: "trusted source pipeline", confidence: 80 };
}

// ── Generate AI thumbnail headline with Gemini 2.5 Flash ──────────────────────
async function generateHeadline(article: Article, client: GoogleGenAI): Promise<string> {
  const rawTitle = article.title.replace(/#\w+/g, "").replace(/\s{2,}/g, " ").trim();
  const body = article.fullBody?.trim() || article.summary?.trim() || "";

  const prompt =
    `ARTICLE TITLE: ${rawTitle}\n` +
    `CATEGORY: ${article.category}\n` +
    (body ? `ARTICLE BODY (first 400 chars): ${body.slice(0, 400)}\n` : "") +
    `SOURCE: ${article.sourceName || "Unknown"}\n\n` +
    `Write ONE thumbnail headline for this article. ALL CAPS. 5-9 words. Specific, factual, strong verb. No quotes.`;

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: HEADLINE_SYSTEM + "\n\n" + prompt }] }
      ],
      config: { temperature: 0.6, maxOutputTokens: 60 },
    });
    const text = response.text?.trim().replace(/^["'*`]|["'*`]$/g, "").toUpperCase() ?? "";
    // Safety: if empty or too short, fall back to raw title
    if (text && text.length >= 8) return text;
  } catch (err: any) {
    console.warn("[gemini] headline failed:", err.message);
  }

  return rawTitle.toUpperCase().slice(0, 120);
}

// ── Generate AI caption with Gemini 2.5 Flash ─────────────────────────────────
async function generateCaption(article: Article, client: GoogleGenAI, hookPattern: string): Promise<string> {
  const rawTitle = article.title.replace(/#\w+/g, "").replace(/\s{2,}/g, " ").trim();
  const body = article.fullBody?.trim() || article.summary?.trim() || rawTitle;
  const source = article.sourceName || "PPP TV Kenya";
  const cta = getEngagementCTA();

  const prompt =
    `Write a caption for this news story. Use the hook pattern: "${hookPattern}"\n\n` +
    `HEADLINE: ${rawTitle}\n` +
    `CATEGORY: ${article.category}\n` +
    `ARTICLE BODY: ${body.slice(0, 1200)}\n` +
    `SOURCE: ${source}\n` +
    `SOURCE URL: ${article.url || ""}\n\n` +
    `End with exactly this CTA on a new line: "${cta.cta}"\n` +
    `Then end with: "Source: ${source}"\n\n` +
    `Reply with ONLY the caption. No preamble, no labels, no hashtags.`;

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: CAPTION_SYSTEM + "\n\n" + prompt }] }
      ],
      config: { temperature: 0.7, maxOutputTokens: 500 },
    });
    const text = response.text?.trim() ?? "";
    if (text && text.length > 40) return text;
  } catch (err: any) {
    console.warn("[gemini] caption failed:", err.message);
  }

  // Fallback: build a decent caption from raw content
  return buildFallbackCaption(rawTitle, body, source, cta.cta, article.url);
}

function buildFallbackCaption(title: string, body: string, source: string, cta: string, url?: string): string {
  const cleaned = body
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  const text = cleaned.length > 40 ? cleaned : title;
  return `${text}\n\n${cta}\n\nSource: ${source}${url ? `\n${url}` : ""}`;
}

// ── Main export — generates title + caption ────────────────────────────────────
export async function generateAIContent(
  article: Article,
  _options?: { isVideo?: boolean; videoType?: string; tone?: "formal" | "casual" | "hype" | "sheng"; language?: "en" | "sw" }
): Promise<AIContent> {
  const apiKey = process.env.GEMINI_API_KEY;
  const hashtags = getHashtags(article.category);
  const cta = getEngagementCTA();
  const rawTitle = article.title.replace(/#\w+/g, "").replace(/\s{2,}/g, " ").trim();
  const body = article.fullBody?.trim() || article.summary?.trim() || rawTitle;

  // ── No Gemini key — fast fallback ─────────────────────────────────────────
  if (!apiKey) {
    return {
      clickbaitTitle: rawTitle.toUpperCase().slice(0, 120),
      caption: buildFallbackCaption(rawTitle, body, article.sourceName || "PPP TV Kenya", cta.cta, article.url),
      firstComment: hashtags,
      engagementType: cta.type,
    };
  }

  const client = getGeminiClient(apiKey);
  const hookPattern = HOOK_PATTERNS[Math.floor(Math.random() * HOOK_PATTERNS.length)];

  // Run headline + caption in parallel for speed
  const [headline, caption] = await Promise.all([
    generateHeadline(article, client),
    generateCaption(article, client, hookPattern),
  ]);

  return {
    clickbaitTitle: headline,
    caption,
    firstComment: hashtags,
    engagementType: cta.type,
  };
}

// ── NVIDIA fallback (kept for legacy compatibility) ────────────────────────────
const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL = "meta/llama-3.1-8b-instruct";

export async function generateWithNvidiaLegacy(prompt: string, systemPrompt: string): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY not set");

  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
      temperature: 0.6,
      max_tokens: 800,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`NVIDIA API error ${res.status}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}
