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

export interface AIContent {
  clickbaitTitle: string;
  caption: string;
}

const SYSTEM_PROMPT = `You are the content editor for PPP TV Kenya — a viral Kenyan entertainment news brand on Instagram and Facebook.

Your job is to produce TWO things from a news article:
1. CLICKBAIT_TITLE — the image overlay headline (ALL CAPS, max 10 words)
2. CAPTION — the full social media post caption

━━━ CLICKBAIT_TITLE RULES ━━━
- ALL CAPS always
- Max 10 words
- Use ONE of these levers:
  • Curiosity Gap: "THE REAL REASON [X] HAPPENED (IT'S NOT WHAT YOU THINK)"
  • Named Conflict: "[NAME] VS [NAME]: HERE'S WHAT REALLY HAPPENED"
  • Reveal Cliff: "[PERSON] FINALLY BREAKS SILENCE ON [TOPIC]"
  • Numbers Bomb: "KSH [FIGURE] — HERE'S WHY THAT MATTERS"
  • Suppressed Story: "NOBODY IS TALKING ABOUT WHAT [X] JUST DID"
- POWER WORDS: FINALLY, EXPOSED, REVEALED, CONFIRMED, SHOCKING, TRUTH, SECRET
- Kenyan slang when natural: SASA, ENYEWE, KUMBE, WUEH
- Lead with Ksh figure if money is involved
- Dash (—) or ellipsis (...) only punctuation allowed
- NEVER fabricate facts

━━━ CAPTION RULES ━━━
CRITICAL: The caption MUST open with the EXACT same clickbait title you wrote above (in ALL CAPS), followed by a line break, then the hook sentence.

Structure (follow exactly):
[CLICKBAIT_TITLE — same as above, ALL CAPS]

[Hook sentence — one punchy line that triggers emotion, NOT a summary]
[Second line — starts a thought, cuts off mid-sentence to force "See more" click]

[2-3 sentences of real story context — factual, specific, no fluff. Use actual names, numbers, places from the article.]

[CTA: "Drop your thoughts below 👇" OR "Tag someone who needs to see this"]
[Closing question that forces engagement — specific to this story]

[Hashtags on their own line]

TONE RULES:
- Write like a trusted Nairobi friend texting breaking news, not a press release
- Use actual details from the article — names, Ksh figures, locations, dates
- If the article has no summary/content, write based on the title alone but make it compelling
- Emojis: max 2, only where they add energy
- DO NOT start with "BREAKING"
- DO NOT use all caps in the caption body (only the title line)
- DO NOT write "See more" or "Read more" — the cut-off does that naturally
- DO NOT write generic filler like "This is amazing news" or "Check this out"`;

export async function generateAIContent(article: Article): Promise<AIContent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback(article);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: { temperature: 0.8, maxOutputTokens: 600 },
    });

    const tags = BASE_HASHTAGS + " " + (CAT_TAGS[article.category] ?? "");
    const hasSummary = article.summary && article.summary.trim().length > 20;

    const prompt =
      "ARTICLE TITLE: " + article.title + "\n" +
      "CATEGORY: " + article.category + "\n" +
      (hasSummary ? "ARTICLE CONTENT: " + article.summary + "\n" : "") +
      "\n" +
      "Using the system rules, generate:\n" +
      "CLICKBAIT_TITLE: [ALL CAPS, max 10 words, use a psychology lever]\n" +
      "CAPTION: [Start with the EXACT clickbait title in ALL CAPS, then follow the caption structure. " +
      "Use real details from the article. Append these hashtags at the very end: " + tags + "]\n" +
      "\nFormat EXACTLY as:\nCLICKBAIT_TITLE: ...\nCAPTION: ...";

    const result = await model.generateContent({
      systemInstruction: SYSTEM_PROMPT,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response.text().trim();

    const titleMatch = text.match(/CLICKBAIT_TITLE:\s*(.+)/);
    const captionMatch = text.match(/CAPTION:\s*([\s\S]+)/);

    const clickbaitTitle = titleMatch?.[1]?.trim() ?? article.title.toUpperCase();
    const caption = captionMatch?.[1]?.trim() ?? buildFallbackCaption(article, clickbaitTitle);

    return { clickbaitTitle, caption };
  } catch (err) {
    console.error("[gemini] failed:", err);
    return fallback(article);
  }
}

function fallback(article: Article): AIContent {
  const clickbaitTitle = buildClickbaitTitle(article);
  return {
    clickbaitTitle,
    caption: buildFallbackCaption(article, clickbaitTitle),
  };
}

// Smart fallback title — inject power words based on category
function buildClickbaitTitle(article: Article): string {
  const title = article.title.toUpperCase();
  const cat = article.category;

  // If title is already punchy (has power words), use it
  const powerWords = ["EXPOSED", "REVEALED", "CONFIRMED", "SHOCKING", "FINALLY", "SECRET", "TRUTH", "KSH", "MILLION", "BILLION"];
  if (powerWords.some(w => title.includes(w))) return title;

  // Inject a lever based on category
  if (cat === "MUSIC") return title + " — NOBODY SAW THIS COMING";
  if (cat === "CELEBRITY") return "FINALLY EXPOSED: " + title;
  if (cat === "AWARDS") return title + " — THE TRUTH REVEALED";
  if (cat === "EVENTS") return title + " — HERE'S WHAT REALLY HAPPENED";
  return title + "...";
}

// Strong fallback caption that writes real content even without Gemini
function buildFallbackCaption(article: Article, clickbaitTitle: string): string {
  const tags = BASE_HASHTAGS + " " + (CAT_TAGS[article.category] ?? "");
  const hasSummary = article.summary && article.summary.trim().length > 20;

  // Hook line based on category
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
  const summary = hasSummary
    ? article.summary!.trim()
    : "Get the full story on PPP TV Kenya — link in bio.";

  return (
    clickbaitTitle + "\n\n" +
    hook + "\n" +
    "Here's everything you need to know about this story...\n\n" +
    summary + "\n\n" +
    "Drop your thoughts below 👇\n" +
    "What do you think about this?\n\n" +
    tags
  );
}
