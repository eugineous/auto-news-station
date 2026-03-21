import { GoogleGenerativeAI } from "@google/generative-ai";
import { Article } from "./types";

const BASE_HASHTAGS = "#PPPTVKenya #Entertainment #Kenya #Nairobi";

const CAT_TAGS: Record<string, string> = {
  CELEBRITY:     "#Celebrity #KenyanCelebrity",
  MUSIC:         "#KenyanMusic #AfricanMusic",
  "TV & FILM":   "#KenyanTV #KenyanFilm",
  FASHION:       "#KenyanFashion",
  EVENTS:        "#NairobiEvents",
  "EAST AFRICA": "#EastAfrica #Kenya",
  INTERNATIONAL: "#Kenya #Africa",
  AWARDS:        "#KenyanAwards",
  COMEDY:        "#KenyanComedy",
  INFLUENCERS:   "#KenyanInfluencer",
  GENERAL:       "#Kenya #Nairobi",
};

// ── Hashtag rotation — 5 sets, cycle by day-of-week to avoid IG spam flag ────
const HASHTAG_SETS = [
  "#PPPTVKenya #KenyaNews #NairobiLife #KenyanEntertainment #AfricaNews",
  "#PPPTVKenya #KenyaTwitter #NairobiVibes #KenyanMedia #EastAfricaNews",
  "#PPPTVKenya #KenyaUpdates #NairobiNow #KenyanCulture #AfricanMedia",
  "#PPPTVKenya #KenyaTrending #NairobiDaily #KenyanStories #AfricaEntertainment",
  "#PPPTVKenya #KenyaToday #NairobiScene #KenyanVoices #AfricaMedia",
];

function getHashtags(category: string): string {
  const setIndex = new Date().getDay() % HASHTAG_SETS.length;
  return BASE_HASHTAGS + " " + (CAT_TAGS[category] ?? "") + " " + HASHTAG_SETS[setIndex];
}

export interface AIContent {
  clickbaitTitle: string;
  caption: string;
}

const SYSTEM_PROMPT = `You are the content editor for PPP TV Kenya — a viral Kenyan entertainment news brand on Instagram and Facebook.

Your job is to produce TWO things from a news article:
1. CLICKBAIT_TITLE — the image overlay headline (ALL CAPS, max 10 words)
2. CAPTION — the full social media post caption

━━━ CLICKBAIT_TITLE RULES ━━━
- ALL CAPS always. Max 10 words.
- Use ONE of these levers:
  • Curiosity Gap: "THE REAL REASON [X] HAPPENED (IT'S NOT WHAT YOU THINK)"
  • Named Conflict: "[NAME] VS [NAME]: HERE'S WHAT REALLY HAPPENED"
  • Reveal Cliff: "[PERSON] FINALLY BREAKS SILENCE ON [TOPIC]"
  • Numbers Bomb: "KSH [FIGURE] — HERE'S WHY THAT MATTERS"
  • Suppressed Story: "NOBODY IS TALKING ABOUT WHAT [X] JUST DID"
- POWER WORDS: FINALLY, EXPOSED, REVEALED, CONFIRMED, SHOCKING, TRUTH, SECRET
- Kenyan slang when natural: SASA, ENYEWE, KUMBE, WUEH
- Lead with Ksh figure if money is involved
- Dash (—) or ellipsis (...) only punctuation allowed. NEVER fabricate facts.

━━━ CAPTION RULES ━━━
CRITICAL: Caption MUST open with the EXACT clickbait title (ALL CAPS), then a blank line, then the hook.

Structure:
[CLICKBAIT_TITLE — ALL CAPS, exact copy]

[Hook — one punchy emotional line, NOT a summary]
[Second line — cuts off mid-thought to force "See more" click]

[2-3 sentences of real story context — use actual names, Ksh figures, locations]

[CTA: "Drop your thoughts below 👇" OR "Tag someone who needs to see this"]
[Closing question specific to this story]

[Hashtags on their own line]

TONE: Nairobi friend texting breaking news. Emojis: max 2. No "BREAKING". No all-caps in body. No generic filler.`;

export async function generateAIContent(article: Article): Promise<AIContent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback(article);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: { temperature: 0.85, maxOutputTokens: 700 },
    });

    const tags = getHashtags(article.category);
    const hasSummary = article.summary && article.summary.trim().length > 20;

    const prompt =
      "ARTICLE TITLE: " + article.title + "\n" +
      "CATEGORY: " + article.category + "\n" +
      (hasSummary ? "ARTICLE CONTENT: " + article.summary + "\n" : "") +
      "\nGenerate:\n" +
      "CLICKBAIT_TITLE: [ALL CAPS, max 10 words, psychology lever]\n" +
      "CAPTION: [Opens with EXACT clickbait title ALL CAPS, then caption structure. Real details. Hashtags at end: " + tags + "]\n" +
      "\nFormat EXACTLY as:\nCLICKBAIT_TITLE: ...\nCAPTION: ...";

    const result = await model.generateContent({
      systemInstruction: SYSTEM_PROMPT,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response.text().trim();
    const titleMatch = text.match(/CLICKBAIT_TITLE:\s*(.+)/);
    const captionMatch = text.match(/CAPTION:\s*([\s\S]+)/);

    const clickbaitTitle = titleMatch?.[1]?.trim() ?? buildClickbaitTitle(article);
    const caption = captionMatch?.[1]?.trim() ?? buildFallbackCaption(article, clickbaitTitle);

    return { clickbaitTitle, caption };
  } catch (err) {
    console.error("[gemini] failed:", err);
    return fallback(article);
  }
}

function fallback(article: Article): AIContent {
  const clickbaitTitle = buildClickbaitTitle(article);
  return { clickbaitTitle, caption: buildFallbackCaption(article, clickbaitTitle) };
}

function buildClickbaitTitle(article: Article): string {
  const title = article.title.toUpperCase();
  const powerWords = ["EXPOSED","REVEALED","CONFIRMED","SHOCKING","FINALLY","SECRET","TRUTH","KSH","MILLION","BILLION"];
  if (powerWords.some(w => title.includes(w))) return title;
  const cat = article.category;
  if (cat === "MUSIC") return title + " — NOBODY SAW THIS COMING";
  if (cat === "CELEBRITY") return "FINALLY EXPOSED: " + title;
  if (cat === "AWARDS") return title + " — THE TRUTH REVEALED";
  if (cat === "EVENTS") return title + " — HERE'S WHAT REALLY HAPPENED";
  return title + "...";
}

function buildFallbackCaption(article: Article, clickbaitTitle: string): string {
  const tags = getHashtags(article.category);
  const hasSummary = article.summary && article.summary.trim().length > 20;
  const hooks: Record<string, string> = {
    MUSIC: "The Kenyan music scene just shifted — and you need to know why.",
    CELEBRITY: "This story is making rounds in Nairobi right now.",
    "TV & FILM": "Kenyan entertainment just made a major move.",
    AWARDS: "Recognition that was a long time coming — here's the full story.",
    EVENTS: "Something big just happened in Nairobi. Here's what went down.",
    "EAST AFRICA": "East Africa is talking about this right now.",
    FASHION: "Kenyan fashion just set a new standard.",
    GENERAL: "This story out of Kenya is getting a lot of attention.",
  };
  const hook = hooks[article.category] || hooks.GENERAL;
  const summary = hasSummary ? article.summary!.trim() : "Get the full story on PPP TV Kenya — link in bio.";
  return clickbaitTitle + "\n\n" + hook + "\n" + "Here's everything you need to know...\n\n" + summary + "\n\n" + "Drop your thoughts below 👇\nWhat do you think about this?\n\n" + tags;
}
