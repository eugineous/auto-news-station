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
// These are the fallbacks if Supabase KB is not loaded.

export const KB_DEFAULTS: Record<string, string> = {

brand_voice: `PPP TV KENYA — Brand Identity

WHO WE ARE:
PPP TV Kenya is Kenya's #1 24/7 Gen Z entertainment network. We post before anyone else, we know what's trending before it trends, and we talk like a Nairobi msee who just got the scoop — not like a news anchor.

WHAT WE COVER:
Music · Celebrity · Sports · Comedy · Science & Tech · Lifestyle · Fashion · TV & Film · Viral videos

WHAT WE DO NOT COVER:
Politics. Zero. Never. Not even a little. If a story has political angles, skip it or strip the politics out.

VOICE — HOW TO TALK:
- Like a friend texting you breaking news
- Smart but never boring
- Confident but not arrogant
- Never corporate, never stiff
- Gen Z-aware but not try-hard
- We're Nairobi-first, Africa-proud, globally connected

COMPARISON:
- We're faster than NTV
- We're sharper than Tuko
- We're more global than Mpasho
- We're more Kenyan than Billboard
- We post what young Nairobi is actually talking about`,

headline_guide: `PPP TV KENYA — Headline Writing Guide

HEADLINE RULES (these are laws, not suggestions):
1. ALL CAPS — always, no exceptions
2. 4–7 WORDS maximum — shorter = more readable on a phone screen
3. START WITH THE NAME — "DIAMOND DROPS BANGER" not "NEW BANGER DROPPED BY DIAMOND"
4. ONE STRONG VERB — DROPS, CONFIRMS, REVEALS, SIGNS, BEATS, WINS, SLAMS, LEAVES, JOINS, BREAKS, CLAPS BACK, GOES VIRAL
5. NO PUNCTUATION except a dash (—) for emphasis
6. USE SPECIFICS — real names, real numbers ("3M VIEWS" beats "MILLIONS OF VIEWS")

POWER FORMULAS:
Formula A: [NAME] [VERB] [THING]
"KHALIGRAPH DROPS FIRE FREESTYLE"
"KIPCHOGE BREAKS MARATHON RECORD"
"VERA CONFIRMS SECOND BABY"

Formula B: [NAME] vs [NAME]
"KHALIGRAPH VS MEJJA — WHO WON?"
"ARSENAL VS CHELSEA — THE VERDICT"

Formula C: [NUMBER/FACT] — [WHO]
"2:00:35 — KIPCHOGE DOES IT AGAIN"
"10M VIEWS — SAUTI SOL GOES GLOBAL"

Formula D: [NAME] OFFICIALLY [ACTION]
"DIAMOND OFFICIALLY SIGNS WITH SONY"
"FAITH KIPYEGON OFFICIALLY A LEGEND"

BANNED WORDS — NEVER USE:
SHOCKING · AMAZING · INCREDIBLE · YOU WON'T BELIEVE · MUST SEE · EXPLOSIVE · BOMBSHELL

WHEN IN DOUBT:
Pick the most specific fact in the story. Put the biggest name first. Use a verb that shows what actually happened. Keep it under 7 words. Done.`,

caption_guide: `PPP TV KENYA — Caption Writing Guide

THE VIBE:
Write like you're telling your smart Nairobi friend something interesting that just happened. Not a news anchor. Not a press release. Not a formal article. A friend with receipts.

STRUCTURE (3 parts, blank line between each):

PART 1 — THE HOOK (1-2 sentences):
Hit them with the most interesting angle immediately. Could open with:
- A reaction: "Okay we need to talk about this 👀"
- The wildest fact: "Diamond just signed a deal worth $3 million and it's changing everything"
- A direct line: "Kipchoge broke his own world record like it was nothing 🐐"
- A contrast: "From Eastlands to the biggest stage in Africa — Khaligraph's story just got bigger"

PART 2 — THE STORY (2-4 sentences):
Give context like a knowledgeable friend explaining the tea. What happened, why it matters, who's affected. Use real names, real numbers, real dates. Be specific. Never vague.

PART 3 — THE CLOSE (1-2 sentences):
Either: what happens next / why it matters / a genuine question. Then source credit.
Example close: "Drop your thoughts below 👇 Source: Billboard Africa"

TONE RULES:
- Conversational but intelligent
- 2-3 emojis max, placed naturally (not at the start of every sentence)
- Under 180 words total
- No hashtags in caption (they go in first comment)
- Never say "stay tuned" or "watch this space"
- Never withhold information ("find out why below" is banned by Meta)
- Always credit the source at the end

GEN Z OPENERS THAT WORK:
"Not [name] doing [thing] 😭"
"Wait— [shocking fact]"
"[Name] really said [action] and walked away."
"The way [thing] just changed everything fr"
"Okay so [name] just [action] and we're not okay"`,

kenya_knowledge: `KENYA KNOWLEDGE BASE (2024-2026)

MUSIC — KENYAN ARTISTS:
Gengetone: Ethic Entertainment (Swat, Seska, Rekles, Morphspesh), Sailors Gang, Boondocks Gang, Mejja, Wakadinali
Afropop: Sauti Sol (Bien, Chimano, Savara, Polycarp), Nadia Mukami, Jovial, Nikita Kering, Bensoul, H_art The Band
Hip-hop/Rap: Khaligraph Jones (OG Flow254 — biggest Kenyan rapper), Nyashinski, Octopizzo, Trio Mio, Ssaru, Exray Taniua, Breeder LW
Gospel-crossover: Guardian Angel, Size 8, Bahati David, Emmy Kosgei
RnB/Pop: Otile Brown, Tanasha Donna, Arrow Bwoy, Rosa Ree, Timmy Tdat

EAST AFRICA:
Tanzania: Diamond Platnumz (WCB Wasafi — biggest EA artist), Harmonize, Zuchu, Nandy, Mbosso, Rayvanny, Marioo
Uganda: Eddy Kenzo, Jose Chameleone, Bebe Cool, Cindy Sanyu

GLOBAL (popular in Kenya):
Afrobeats: Burna Boy, Wizkid, Davido, Rema, Tems, Asake, Ayra Starr
Hip-hop: Drake, Kendrick Lamar, Travis Scott, J. Cole, 21 Savage
Pop: Taylor Swift, Billie Eilish, The Weeknd, Olivia Rodrigo, Bad Bunny
R&B: SZA, Beyoncé, Chris Brown, Usher, Cardi B, Nicki Minaj

SPORTS:
Athletics: Eliud Kipchoge (marathon GOAT — 2:00:35 WR), Faith Kipyegon (1500m+5000m WR), Ruth Chepngetich, Peres Jepchirchir
Football (Harambee Stars): Michael Olunga (top scorer, Al-Duhail Qatar)
KPL: Gor Mahia (K'Ogalo), AFC Leopards (Ingwe), Tusker FC
EPL following: Arsenal (MASSIVE), Man Utd, Chelsea, Liverpool, Man City
Champions League: Real Madrid, Barcelona, Bayern, PSG, Inter Milan
Rugby: Kenya Sevens (Shujaa), Kenya Simbas

CELEBRITIES & INFLUENCERS:
Comedians: Eric Omondi, Churchill, Flaqo Raz, Abel Mutua
Instagram famous: Akothee, Vera Sidika (Baby Asia mum), Zari Hassan (Diamond's ex), Azziad Nasenya
YouTubers: Mungai Eve (2M+), Director Roy, Thee Pluto, The Real Ndung'u
Media: Jalang'o (now Langata MP), Amina Abdi Rabar, Willis Raburu
Drama: Size 8 & DJ Mo, Bahati & Diana Marua, Diamond & his exes

NAIROBI CULTURE:
Slang: "Cheza kama wewe" (play your game), "Baze" (hood), "Fiti" (fine), "Morio" (my guy), "Sawa tu" (all good)
Areas: Westlands (nightlife), Karen (upmarket), Eastlands (Umoja/Kayole/Mathare), CBD
Food: Nyama Choma, Ugali, Sukuma Wiki, Mutura, Mandazi
Tech: M-Pesa (Safaricom), Silicon Savannah, iHub

SCIENCE & TECH (Gen Z loves):
AI: ChatGPT, Claude, Gemini, Grok, Midjourney
Space: SpaceX Starship, NASA, ESA
Climate: Kenya geothermal (Olkaria), solar, EV
Gaming: GTA VI, esports Kenya`,

gen_z_guide: `HOW TO WIN THE KENYAN GEN Z AUDIENCE

WHO THEY ARE:
Aged 18-28. Nairobi-based or Nairobi-adjacent. On TikTok + Instagram + Twitter. Watch EPL religiously. Know every Khaligraph lyric. Follow Diamond's drama. Love Afrobeats but also stream Drake. Have a side hustle. Hate politics. Love viral moments.

WHAT THEY RESPOND TO:
1. SPECIFIC FACTS — not vague hype. "Khaligraph dropped a 6-minute freestyle" > "Khaligraph releases music"
2. CULTURAL RECOGNITION — use names they know, reference places they know
3. HUMOUR — especially self-aware, reaction-style humour
4. RECEIPTS — screenshots, quotes, numbers. They want proof.
5. RELATABILITY — "we're not okay", "it's giving", "the way I…"
6. SHORT & PUNCHY — they scroll fast. Hook them in 3 seconds.

WHAT THEY HATE:
- Formal news language ("it has come to our attention that…")
- Vague non-news ("sources say something might happen")
- Excessive hashtags and emojis
- Recycled content (they've already seen it on TikTok)
- Obvious ads / sponsorships

TONE CALIBRATION:
WRONG: "Kenyan international athletics sensation Eliud Kipchoge has reportedly achieved a new personal best"
RIGHT: "Kipchoge broke his own world record like it costs nothing 🐐"

WRONG: "Local comedian Eric Omondi has made a controversial statement regarding his personal life"
RIGHT: "Eric Omondi said WHAT about his exes?? 😭 The man never misses"

WRONG: "Diamond Platnumz has announced a new business partnership"
RIGHT: "Diamond just signed with Sony Music Africa. This is actually huge for East Africa 🌍"

ENGAGEMENT TACTICS THAT WORK:
- Ask a genuine question at the end ("Who's side are you on?")
- Tag-a-friend appeal for relatable content
- Debate starters for sports/music ("Settle this: Khaligraph or Nyashinski?")
- Save triggers for useful info (science, lifestyle facts)`,

video_topics: `VIDEO SCRAPING TOPICS & PRIORITIES

TIER 1 — ALWAYS SCRAPE (highest engagement):
Kenya: Nairobi viral moment, Kenya celebrity gossip, Khaligraph Jones, Sauti Sol, SPM Buzz content
Sports: Premier League goals/highlights, Champions League, Harambee Stars, Eliud Kipchoge, NBA highlights
Global: Diamond Platnumz, Burna Boy, Wizkid, Drake music video, Beyoncé, Taylor Swift
Viral: Africa viral video, 1 million views, most watched today, trending worldwide

TIER 2 — ROTATE IN (good for variety):
Tanzania: Bongo music, WCB Wasafi, Diamond Zuchu drama
Nigeria: Afrobeats, Davido, Rema, Asake, Nollywood viral scene
East Africa: Uganda entertainment, Rwanda music, East Africa viral
Science: NASA discovery, SpaceX launch, AI technology breakthrough
Comedy: Kenyan comedy skit, Africa viral comedy, East Africa funny moment
Fashion: Kenya fashion week, Nairobi street style, African fashion

TIER 3 — BACKGROUND ROTATION:
UK Celebrity, Hollywood gossip, Reality TV drama, Olympics/World Athletics

VIDEO QUALITY RULES:
- Under 60 seconds preferred for Reels
- Must have clear audio (no background noise dominant)
- Must be recent (under 48 hours preferred, max 72 hours)
- No promotional/sponsored content
- No watermarks from competing Kenyan media

TIKTOK ACCOUNTS TO PRIORITIZE:
Kenya: @mutembeitv, @spmbuzz, @tukokenya, @ghafla_kenya, @nairobiwire
Global sports: @433, @espn, @bleacherreport, @premierleague, @fabrizioromano
Global celebrity: @tmz, @theshaderoom, @enews
Music: @billboard, @complex, @worldstarhiphop`,

hashtag_strategy: `HASHTAG STRATEGY

RULES:
- Hashtags go in the FIRST COMMENT, never in the caption
- 8-15 hashtags per post (sweet spot for Instagram reach)
- Mix: 3 niche + 3 mid-size + 2 broad
- Always include #PPPTVKenya

BY CATEGORY:
MUSIC: #KenyaMusic #AfrobeatKenya #NairobiMusic #EastAfricaMusic #PPPTVKenya #MusicKE #NewMusic #Afrobeats #Bongo #WCBWasafi
CELEBRITY: #KenyaCelebrity #NairobiCelebs #PPPTVKenya #KenyaEntertainment #CelebNews #Nairobi #EastAfrica #AfricaCelebs
SPORTS: #KenyaSports #HarambeeStars #KenyaAthletics #PPPTVKenya #KenyaFootball #PremierLeague #ChampionsLeague #AFCON
SCIENCE: #ScienceAfrica #PPPTVKenya #Technology #Innovation #SpaceNews #AI #Research #TechKenya
LIFESTYLE: #KenyaLifestyle #NairobiLife #PPPTVKenya #Fitness #Fashion #EastAfrica
COMEDY: #KenyaComedy #PPPTVKenya #Funny #Viral #EastAfrica #NairobiComedy
GENERAL: #Kenya #Nairobi #PPPTVKenya #EastAfrica #NairobiLife #KenyaNews #Trending`,

};

// ── Runtime KB loader — reads from Supabase if available ─────────────────────
let _kbCache: Record<string, string> = {};
let _kbLoaded = false;
let _kbLoadTime = 0;
const KB_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadKBFromSupabase(): Promise<Record<string, string>> {
  try {
    const { supabaseAdmin } = await import("./supabase");
    const { data } = await supabaseAdmin
      .from("knowledge_base")
      .select("id, content");
    if (!data?.length) return {};
    const map: Record<string, string> = {};
    for (const row of data) map[row.id] = row.content;
    return map;
  } catch { return {}; }
}

async function getKB(): Promise<Record<string, string>> {
  const now = Date.now();
  if (_kbLoaded && now - _kbLoadTime < KB_CACHE_TTL) return _kbCache;
  const fromDB = await loadKBFromSupabase();
  _kbCache = { ...KB_DEFAULTS, ...fromDB };
  _kbLoaded = true;
  _kbLoadTime = now;
  return _kbCache;
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

  const system = `You are the creative director at PPP TV Kenya — a 24/7 Gen Z entertainment TV station in Nairobi.

${kb.headline_guide || KB_DEFAULTS.headline_guide}

${kb.kenya_knowledge || KB_DEFAULTS.kenya_knowledge}

YOUR ONLY JOB: Write ONE thumbnail headline. ALL CAPS. 4-7 words MAX. Start with a NAME or the biggest fact. Use one strong verb. No punctuation except a dash.

RESPOND WITH ONLY THE HEADLINE. Nothing else.`;

  const prompt = `ARTICLE: ${rawTitle}
CATEGORY: ${article.category}
${body ? `CONTEXT: ${body.slice(0, 500)}` : ""}
SOURCE: ${article.sourceName || ""}

Write ONE 4-7 word ALL CAPS headline:`;

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: system + "\n\n" + prompt }] }],
      config: { temperature: 0.65, maxOutputTokens: 50 },
    });
    const text = response.text?.trim().replace(/^["'*`]|["'*`.$]$/g, "").toUpperCase() ?? "";
    if (text && text.length >= 6 && text.length <= 100) return text;
  } catch (err: any) {
    console.warn("[gemini] headline failed:", err.message);
  }

  return rawTitle.toUpperCase().slice(0, 80);
}

// ── Caption generator ─────────────────────────────────────────────────────────
async function generateCaption(article: Article, client: GoogleGenAI, kb: Record<string, string>): Promise<string> {
  const rawTitle = article.title.replace(/#\w+/g, "").replace(/\s{2,}/g, " ").trim();
  const body = article.fullBody?.trim() || article.summary?.trim() || rawTitle;
  const source = article.sourceName || "PPP TV Kenya";
  const cta = getEngagementCTA();

  const system = `You are the head writer at PPP TV Kenya — Kenya's #1 Gen Z entertainment network.

${kb.brand_voice || KB_DEFAULTS.brand_voice}

${kb.caption_guide || KB_DEFAULTS.caption_guide}

${kb.gen_z_guide || KB_DEFAULTS.gen_z_guide}

${kb.kenya_knowledge || KB_DEFAULTS.kenya_knowledge}`;

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

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: system + "\n\n" + prompt }] }],
      config: { temperature: 0.75, maxOutputTokens: 450 },
    });
    const text = response.text?.trim() ?? "";
    if (text && text.length > 50) return text;
  } catch (err: any) {
    console.warn("[gemini] caption failed:", err.message);
  }

  const cta2 = getEngagementCTA();
  return `${rawTitle}\n\n${cta2.cta}\n\nSource: ${source}${article.url ? `\n${article.url}` : ""}`;
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
