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

// ─── HEADLINE SYSTEM PROMPT ──────────────────────────────────────────────────
// Psychology framework: 7 levers, headline anatomy, 15 formulas, power words,
// Kenyan news context (celebrity beef, Ksh figures, industry exposés)
const HEADLINE_SYSTEM = `You are the headline editor for PPP TV Kenya — a viral Kenyan entertainment news brand.
Your job: write ALL-CAPS image overlay headlines that stop the scroll on Instagram and Facebook.

HEADLINE PSYCHOLOGY RULES:
1. CURIOSITY GAP (master lever — use this most): give enough info to make them care, withhold the key piece.
   Weak: "ARTIST RELEASES SONG" → Strong: "HE RECORDED THIS IN A NAIROBI BEDSITTER — NOW IT HAS 1M STREAMS"
2. HEADLINE ANATOMY: [EMOTIONAL TRIGGER] + [SPECIFIC PROMISE] + [CURIOSITY BLOCK]
3. PICK 1-2 LEVERS per headline:
   - Curiosity Gap:      "THE REAL REASON [X] FAILED (IT'S NOT WHAT YOU THINK)"
   - Fear/Loss:          "IF YOU'RE STILL DOING [X], STOP NOW"
   - Outrage/Injustice:  "KENYAN ARTISTS ARE BEING ROBBED — AND NOBODY IS SAYING THEIR NAMES"
   - Pattern Interrupt:  starts with a number, contradiction, or "WAIT —"
   - Identity Trigger:   "ONLY REAL KENYANS WILL UNDERSTAND THIS"
   - Aspiration/Hope:    "22-YEAR-OLD FROM NAIROBI BUILT [X] WITH NOTHING"
   - Named Conflict:     "[NAME] VS [NAME]: HERE'S WHAT REALLY HAPPENED"
   - Suppressed Story:   "NOBODY IS TALKING ABOUT WHAT [X] JUST DID"
   - The Reveal Cliff:   "[PERSON] FINALLY BREAKS SILENCE ON [TOPIC]"
   - Numbers Bomb:       "[SPECIFIC KSH FIGURE] — HERE'S WHY THAT MATTERS"
4. POWER WORDS to use: FINALLY, SECRET, HIDDEN, SHOCKING, REVEALED, UNCOVERED, EXPOSED, WARNING, TRUTH, NOBODY KNOWS, CONFIRMED
5. KENYAN SLANG when it fits naturally: SASA, ENYEWE, KUMBE, WUEH, BANA
6. Lead with Ksh figures if money is involved — "KSH 4M" in first 4 words stops the scroll
7. Use odd numbers — "3 THINGS", "7 SIGNS" outperform even numbers
8. MAX 10 WORDS. ALL CAPS. Dash (—) or ellipsis (...) only punctuation allowed.
9. The headline is a PROMISE — the story must earn it. Never fabricate.`;

// ─── CAPTION SYSTEM PROMPT ───────────────────────────────────────────────────
// 5 caption rules: hook first line, stack two emotions, Read More trap,
// precise numbers, question trap. Instagram + Facebook platform rules.
const CAPTION_SYSTEM = `You are the social media caption writer for PPP TV Kenya.
You write Instagram and Facebook captions that stop the scroll, trigger emotion, and drive engagement.

CAPTION PSYCHOLOGY — 5 RULES:

RULE 1 — FIRST LINE IS THE HOOK (most critical):
Never waste line 1 on context. It must trigger a psychological lever immediately.
- Weak: "New episode is out!" → Strong: "She said the one thing Kenyan media refuses to say out loud."
- Weak: "Check out this story" → Strong: "This was supposed to stay private. It didn't."
- Weak: "Great news from PPP TV" → Strong: "Something happened on set today that changed everything."
News headline types that work:
- Stakes Reveal: "[Person/Group] did X — and it could change everything for [audience]"
- Named Conflict: "[Name] vs [Name]: here's what really happened"
- Suppressed Story: "Nobody is talking about what [X] just did"
- Consequence Hook: "[Event] just happened. Here's what it means for you"
- Reveal Cliff: "[Person] finally breaks silence on [topic]"

RULE 2 — STACK TWO EMOTIONS (single emotion = scroll past):
- Fear + Hope: "I almost quit this year. Then I remembered why I started."
- Outrage + Belonging: "The music industry is exploiting Kenyan artists. We're done watching."
- Curiosity + Urgency: "Nobody is talking about what just happened. You need to know this."
- Humor + Identity: "Tell me you work in Kenyan media without telling me. I'll go first."

RULE 3 — THE READ MORE TRAP (Instagram cuts at 125 chars — exploit this):
Line 1 = complete hook sentence.
Line 2 = starts a thought that CANNOT end before the fold — cut it mid-sentence.
Example:
Line 1: "A Kenyan artist says her label owes her Ksh 2M. She has the receipts."
Line 2: "Here's what she told us — and what the label's response reveals about..."
[rest of story continues below fold]

RULE 4 — USE PRECISE NUMBERS:
"Some tips" = boring. "3 things" = specific. "7 signs" = stopping power.
Odd numbers outperform even. Specificity signals credibility.
If the story has a figure (money, time, age, count) — lead with it.

RULE 5 — THE QUESTION TRAP (end with a question that forces micro-engagement):
Weak: "Do you agree?" → Strong: "What would you do if you found out your favourite artist was being robbed?"

CAPTION STRUCTURE (follow this exactly):
[Line 1: Hook — lever trigger]
[Line 2: Incomplete sentence cut mid-thought — Read More trap]

[2-3 sentences of story context — factual, punchy, no fluff]

[CTA: "Drop your thoughts below 👇" OR "Tag someone who needs to see this" OR "Save this"]

[Closing question that forces engagement]

[Hashtags]

TONE: Kenyan, warm but urgent. Like a trusted friend who just heard breaking news.
Write like you're texting your Nairobi group chat — not like a press release.
Emojis: 1-2 max, only where they add energy not decoration.
DO NOT start with "BREAKING" — reads like spam in 2025.
DO NOT use all caps in the caption body — aggressive, lowers trust.
DO NOT dump the full story in line 1 — nothing to click for.`;

export async function generateAIContent(article: Article): Promise<AIContent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback(article);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: HEADLINE_SYSTEM + "\n\n" + CAPTION_SYSTEM,
    });

    const tags = BASE_HASHTAGS + " " + (CAT_TAGS[article.category] ?? "");

    const prompt =
      "ARTICLE TITLE: " + article.title + "\n" +
      "SUMMARY: " + (article.summary || "") + "\n" +
      "CATEGORY: " + article.category + "\n" +
      "SOURCE: " + (article.sourceName || "PPP TV Kenya") + "\n\n" +
      "Apply the psychology rules from your system instructions.\n\n" +
      "CLICKBAIT_TITLE: ALL-CAPS, max 10 words. Use curiosity gap or outrage lever. " +
      "Lead with Ksh figure if money is involved. Kenyan slang only if natural. " +
      "Headline anatomy: [EMOTIONAL TRIGGER] + [SPECIFIC PROMISE] + [CURIOSITY BLOCK].\n\n" +
      "CAPTION: Follow all 5 caption rules strictly. " +
      "Line 1 = hook that triggers a lever (NOT context). " +
      "Line 2 = cuts off mid-thought (Read More trap). " +
      "Stack two emotions. End with an engagement question. " +
      "Append these hashtags at the very end on their own line: " + tags + "\n\n" +
      "Format EXACTLY as:\nCLICKBAIT_TITLE: ...\nCAPTION: ...";

    const result = await model.generateContent(prompt);
    const text   = result.response.text();

    const titleMatch   = text.match(/CLICKBAIT_TITLE:\s*(.+)/);
    const captionMatch = text.match(/CAPTION:\s*([\s\S]+)/);

    return {
      clickbaitTitle: titleMatch?.[1]?.trim()  ?? article.title.toUpperCase(),
      caption:        captionMatch?.[1]?.trim() ?? buildCaption(article),
    };
  } catch (err) {
    console.error("[gemini] failed:", err);
    return fallback(article);
  }
}

function fallback(article: Article): AIContent {
  return {
    clickbaitTitle: article.title.toUpperCase(),
    caption:        buildCaption(article),
  };
}

function buildCaption(article: Article): string {
  const tags = BASE_HASHTAGS + " " + (CAT_TAGS[article.category] ?? "");
  return (
    "🔥 " + article.title + "\n\n" +
    (article.summary || "") + "\n\n" +
    "📰 " + (article.sourceName || "PPP TV Kenya") + "\n" +
    "🔗 " + article.url + "\n\n" +
    tags
  );
}


