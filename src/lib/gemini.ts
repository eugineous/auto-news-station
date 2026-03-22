import { GoogleGenerativeAI } from "@google/generative-ai";
import { Article } from "./types";

export interface AIContent {
  clickbaitTitle: string;
  caption: string;
}

const SYSTEM_PROMPT = `You are the senior content editor for PPP TV Kenya — a Kenyan entertainment news brand on Instagram and Facebook.
You write like a professional Nairobi journalist. Every caption must deliver real information.

CLICKBAIT_TITLE RULES:
- ALL CAPS. Max 10 words.
- Must contain a real name, place, or detail from the article.
- Use curiosity or urgency naturally — do NOT force clickbait.
- Kenyan slang only when it fits naturally: KUMBE, WUEH, ENYEWE
- NEVER fabricate facts. Only use what is in the article.

CAPTION RULES:
Write a short news story. The reader must learn the actual story just from your caption.

STRUCTURE:
[TITLE IN ALL CAPS]

[One-sentence lede: WHO did WHAT, WHERE. Use the person's real name.]

[2-3 sentences with real details: names, locations, Ksh figures, dates, quotes, what happened, why it matters. Be specific — never be vague.]

[Engaging question about this specific story]

STRICT RULES:
- ZERO hashtags anywhere
- Max 2 emojis in the entire caption
- Never write "BREAKING", "Here's everything you need to know", "Get the full story", "link in bio", "stay tuned", or "watch this space"
- Never use all-caps in the body paragraphs — only the title line
- Every sentence must contain a specific fact, name, or detail
- The caption must be at least 200 characters long

EXAMPLE:
WAHU KAGWI HONOURED WITH ONERPM KENYA LEGACY AWARD

Wahu Kagwi has been recognised with the ONErpm Kenya Legacy Award for two decades of shaping Kenyan music.

The award was presented at a ceremony in Nairobi, celebrating her journey from her 2003 debut to becoming one of East Africa's most influential artists. ONErpm Kenya cited her consistent output and mentorship of younger artists as key reasons for the honour. Wahu dedicated the award to her fans and her family.

Drop your thoughts below 👇
Who else deserves a legacy award in Kenya?`;

export async function generateAIContent(article: Article): Promise<AIContent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback(article);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: { temperature: 0.6, maxOutputTokens: 1000 },
    });

    const hasSummary = article.summary && article.summary.trim().length > 20;
    const prompt =
      "Write a social media caption for PPP TV Kenya based on this article.\n\n" +
      "ARTICLE TITLE: " + article.title + "\n" +
      "CATEGORY: " + article.category + "\n" +
      "SOURCE: " + (article.sourceName || "unknown") + "\n" +
      (hasSummary ? "ARTICLE CONTENT:\n" + article.summary + "\n\n" : "\n") +
      "IMPORTANT: Use ONLY facts from the article above. Include real names, places, and details.\n" +
      "Do NOT include any hashtags.\n\n" +
      "Respond in EXACTLY this format:\n" +
      "CLICKBAIT_TITLE: [your title in ALL CAPS, max 10 words]\n" +
      "CAPTION: [your full caption starting with the title line]";

    const result = await model.generateContent({
      systemInstruction: SYSTEM_PROMPT,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response.text().trim();

    // More robust parsing — handle various Gemini output quirks
    let clickbaitTitle = "";
    let rawCaption = "";

    const titleMatch = text.match(/CLICKBAIT_TITLE:\s*(.+)/);
    if (titleMatch) {
      clickbaitTitle = titleMatch[1].trim().replace(/^["']|["']$/g, "");
    }

    const captionMatch = text.match(/CAPTION:\s*([\s\S]+)/);
    if (captionMatch) {
      rawCaption = captionMatch[1].trim().replace(/^["']|["']$/g, "");
    } else if (!titleMatch) {
      // Gemini didn't follow format — use the whole output as caption
      rawCaption = text;
      const firstLine = text.split("\n")[0].trim();
      if (firstLine === firstLine.toUpperCase() && firstLine.length > 10) {
        clickbaitTitle = firstLine;
      }
    }

    // Strip any hashtags Gemini sneaks in
    rawCaption = rawCaption.replace(/#\w+/g, "").replace(/[ \t]{2,}/g, " ").trim();
    // Clean up excessive newlines but keep paragraph breaks
    rawCaption = rawCaption.replace(/\n{3,}/g, "\n\n").trim();

    if (!clickbaitTitle) {
      clickbaitTitle = buildClickbaitTitle(article);
    }

    const caption = isVagueCaption(rawCaption)
      ? buildFallbackCaption(article, clickbaitTitle)
      : rawCaption;

    return { clickbaitTitle, caption };
  } catch (err) {
    console.error("[gemini] failed:", err);
    return fallback(article);
  }
}

function isVagueCaption(caption: string): boolean {
  if (caption.length < 80) return true;
  const vaguePatterns = [
    /here'?s everything you need to know/i,
    /get the full story/i,
    /link in bio/i,
    /stay tuned/i,
    /watch this space/i,
    /follow .+ for (?:more|the latest)/i,
  ];
  // Only reject if more than half the caption is vague filler
  const vagueCount = vaguePatterns.filter(p => p.test(caption)).length;
  return vagueCount >= 2;
}

function fallback(article: Article): AIContent {
  const clickbaitTitle = buildClickbaitTitle(article);
  return { clickbaitTitle, caption: buildFallbackCaption(article, clickbaitTitle) };
}

function buildClickbaitTitle(article: Article): string {
  // Just use the article title in caps — no cheesy suffixes
  return article.title.toUpperCase().slice(0, 80);
}

function buildFallbackCaption(article: Article, clickbaitTitle: string): string {
  const hasSummary = article.summary && article.summary.trim().length > 30;
  const summary = hasSummary ? article.summary!.trim() : "";
  const source = article.sourceName ? " — " + article.sourceName + " reports." : ".";
  const lede = article.title + source;
  const body = summary
    ? summary.slice(0, 500)
    : "Details on this story are still emerging.";
  return (
    clickbaitTitle + "\n\n" +
    lede + "\n\n" +
    body + "\n\n" +
    "Drop your thoughts below 👇\n" +
    "What do you make of this?"
  );
}
