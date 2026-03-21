import { GoogleGenerativeAI } from "@google/generative-ai";
import { Article } from "./types";

const BASE_HASHTAGS = "#PPPTVKenya #Entertainment #Kenya #Nairobi";

const CAT_TAGS: Record<string, string> = {
  CELEBRITY: "#Celebrity #KenyanCelebrity",
  MUSIC: "#KenyanMusic #AfricanMusic",
  "TV & FILM": "#KenyanTV #KenyanFilm",
  FASHION: "#KenyanFashion",
  EVENTS: "#NairobiEvents",
  "EAST AFRICA": "#EastAfrica #Kenya",
  INTERNATIONAL: "#Kenya #Africa",
  AWARDS: "#KenyanAwards",
  COMEDY: "#KenyanComedy",
  INFLUENCERS: "#KenyanInfluencer",
  GENERAL: "#Kenya #Nairobi",
};

export interface AIContent {
  clickbaitTitle: string;
  caption: string;
}

export async function generateAIContent(article: Article): Promise<AIContent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback(article);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const tags = BASE_HASHTAGS + " " + (CAT_TAGS[article.category] ?? "");

    const prompt =
      "You are a viral Kenyan entertainment news editor for PPP TV Kenya.\n" +
      "Article: \"" + article.title + "\"\n" +
      "Summary: \"" + article.summary + "\"\n" +
      "Category: " + article.category + "\n\n" +
      "Generate:\n" +
      "CLICKBAIT_TITLE: ALL-CAPS max 10 words, dramatic, use Kenyan slang (SASA/ENYEWE/KUMBE/WUEH) if fitting\n" +
      "CAPTION: 150-200 word Instagram caption, hook emoji, Kenyan tone, CTA at end, end with: " + tags + "\n\n" +
      "Format exactly:\nCLICKBAIT_TITLE: ...\nCAPTION: ...";

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const titleMatch = text.match(/CLICKBAIT_TITLE:\s*(.+)/);
    const captionMatch = text.match(/CAPTION:\s*([\s\S]+)/);

    return {
      clickbaitTitle: titleMatch?.[1]?.trim() ?? article.title.toUpperCase(),
      caption: captionMatch?.[1]?.trim() ?? buildCaption(article),
    };
  } catch (err) {
    console.error("[gemini] failed:", err);
    return fallback(article);
  }
}

function fallback(article: Article): AIContent {
  return { clickbaitTitle: article.title.toUpperCase(), caption: buildCaption(article) };
}

function buildCaption(article: Article): string {
  const tags = BASE_HASHTAGS + " " + (CAT_TAGS[article.category] ?? "");
  return "\uD83D\uDD25 " + article.summary + "\n\n\uD83D\uDCF0 " + article.sourceName + "\n\uD83D\uDD17 " + article.url + "\n\n" + tags;
}
