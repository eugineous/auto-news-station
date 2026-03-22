import { GoogleGenAI } from "@google/genai";
import { Article } from "./types";

export interface AIContent {
  clickbaitTitle: string;
  caption: string;
}

const SYSTEM_PROMPT = `You are the head of content at PPP TV Kenya — a popular Kenyan entertainment and news brand on Instagram and Facebook. You write like a seasoned Nairobi journalist who knows how to hook readers while delivering real news.

Your job: turn articles into social media captions that are informative, engaging, and feel like they were written by a real Kenyan news editor — not a robot.

## TITLE RULES
- ALL CAPS, max 10 words
- Must include a real name, place, or number from the article
- Be specific: "RUTO SIGNS KSH 4.2B HOUSING DEAL" not "GOVERNMENT MAKES BIG MOVE"
- Use Kenyan slang only when natural: KUMBE, WUEH, ENYEWE, SASA
- Never fabricate — only use facts from the article

## CAPTION STRUCTURE
Your caption has 4 parts, separated by blank lines:

1. HEADLINE — the title in ALL CAPS (same as CLICKBAIT_TITLE)
2. LEDE — one punchy sentence: WHO did WHAT, WHERE. Real name required.
3. BODY — 2-4 sentences of real detail. Include: names, locations, Ksh figures, dates, quotes, context. The reader should understand the full story without clicking.
4. CTA — one engaging question specific to this story + optional 👇

## WHAT MAKES A GOOD CAPTION
- Every sentence has a SPECIFIC FACT (name, number, place, date, quote)
- Reads like a journalist wrote it, not a content mill
- Flows naturally — no forced transitions
- Feels like insider knowledge being shared

## WHAT MAKES A BAD CAPTION (never do these)
- Vague filler: "The internet is buzzing", "Here's everything you need to know", "This is huge"
- Generic CTAs: "Stay tuned", "Watch this space", "Link in bio"
- Repeating the title as the lede with no new info
- Writing "BREAKING" anywhere
- ALL CAPS in the body (only the headline)
- Any hashtags whatsoever
- More than 2 emojis total

## EXAMPLES

GOOD:
CLICKBAIT_TITLE: BIEN AIME EXITS SOL GENERATION AFTER 12 YEARS
CAPTION: BIEN AIME EXITS SOL GENERATION AFTER 12 YEARS

Bien-Aimé Baraza has officially left Sol Generation, the label he co-founded with Sauti Sol in 2018.

The announcement came via a statement on his socials, citing "creative differences and a need to explore solo ventures." Bien's departure leaves Savara as the only active member still releasing music under the Sol Generation umbrella. His debut solo album is reportedly in the works, with features from Nyashinski and Karun. The split has been described as amicable, with both sides wishing each other well.

What do you think Bien's solo music will sound like? 👇

GOOD (shorter article with less detail):
CLICKBAIT_TITLE: KENYA RUGBY 7S SQUAD NAMED FOR HONG KONG
CAPTION: KENYA RUGBY 7S SQUAD NAMED FOR HONG KONG

Head coach Damian McGrath has announced Kenya's 13-man squad for the Hong Kong Sevens this weekend.

The team includes returning captain Nelson Oyoo and in-form winger Daniel Taabu, who scored 5 tries in the last leg. Youngster Johnstone Olindi earns his first tournament call-up after impressing in training camp.

Who's your pick for player of the tournament? 👇

BAD (do NOT write like this):
"Exciting news from the Kenyan entertainment scene! Something big just happened and everyone is talking about it. Here's everything you need to know about this developing story. Stay tuned for more updates from PPP TV Kenya!"`;

const VIDEO_EXTRA = `
## VIDEO CAPTION RULES (this is a video post)
- Keep the caption SHORT — max 80 words total. The video speaks for itself.
- Structure: HEADLINE → 1-2 sentences about what the video shows → question
- Credit the original creator if their name is known
- Don't describe the video frame by frame — just the key moment or topic`;

// Singleton client — reused across calls
let _client: GoogleGenAI | null = null;
function getClient(apiKey: string): GoogleGenAI {
  if (!_client) _client = new GoogleGenAI({ apiKey });
  return _client;
}

export async function generateAIContent(
  article: Article,
  options?: { isVideo?: boolean; videoType?: string }
): Promise<AIContent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback(article);

  const isVideo = options?.isVideo || false;
  const videoType = options?.videoType || "";

  try {
    const client = getClient(apiKey);
    const systemPrompt = isVideo ? SYSTEM_PROMPT + VIDEO_EXTRA : SYSTEM_PROMPT;

    const hasBody = article.fullBody && article.fullBody.trim().length > 50;
    const hasSummary = article.summary && article.summary.trim().length > 20;
    const content = hasBody
      ? article.fullBody.trim().slice(0, 2000)
      : hasSummary
        ? article.summary.trim()
        : "";

    let prompt =
      "Write a PPP TV Kenya social media caption for this:\n\n" +
      "TITLE: " + article.title + "\n" +
      "CATEGORY: " + article.category + "\n" +
      "SOURCE: " + (article.sourceName || "unknown") + "\n";

    if (content) prompt += "FULL ARTICLE:\n" + content + "\n\n";
    else prompt += "\n";

    if (isVideo) {
      prompt += `This is a VIDEO post from ${videoType || "a video platform"}. Keep the caption under 80 words.\n\n`;
    }

    prompt +=
      "Use ONLY facts from the article. No hashtags. No fabrication.\n\n" +
      "Respond EXACTLY like this:\n" +
      "CLICKBAIT_TITLE: YOUR TITLE HERE IN ALL CAPS\n" +
      "CAPTION: Your full caption here";

    // Use the Interactions API
    const interaction = await (client.interactions as any).create({
      model: "gemini-3-flash-preview",
      system_instruction: systemPrompt,
      input: prompt,
      config: {
        temperature: 0.7,
        max_output_tokens: 1200,
        top_p: 0.9,
      },
      store: false,
    });

    const text = extractText(interaction);
    let { clickbaitTitle, caption } = parseResponse(text);

    // If vague, retry once with stricter prompt using stateful conversation
    if (isVagueCaption(caption) && content) {
      const retryPrompt =
        "Your previous caption was too vague. Try again.\n\n" +
        "TITLE: " + article.title + "\n" +
        "ARTICLE:\n" + content + "\n\n" +
        "RULES:\n" +
        "- Every sentence MUST contain a real name, place, date, or number\n" +
        "- No filler phrases like 'the internet is buzzing' or 'here's what happened'\n" +
        "- Write like you're texting a friend the actual news\n\n" +
        "CLICKBAIT_TITLE: ...\n" +
        "CAPTION: ...";

      try {
        const retry = await (client.interactions as any).create({
          model: "gemini-3-flash-preview",
          system_instruction: systemPrompt,
          // Continue the conversation statefully if we have an interaction ID
          ...(interaction?.id ? { previous_interaction_id: interaction.id } : {}),
          input: retryPrompt,
          config: { temperature: 0.5, max_output_tokens: 1200 },
          store: false,
        });
        const retryText = extractText(retry);
        const retryParsed = parseResponse(retryText);
        if (!isVagueCaption(retryParsed.caption)) {
          clickbaitTitle = retryParsed.clickbaitTitle || clickbaitTitle;
          caption = retryParsed.caption;
        }
      } catch {
        // Keep first attempt
      }
    }

    if (!clickbaitTitle) clickbaitTitle = buildClickbaitTitle(article);
    if (isVagueCaption(caption)) caption = buildFallbackCaption(article, clickbaitTitle);

    caption = caption.replace(/#\w+/g, "").replace(/\n{3,}/g, "\n\n").trim();

    return { clickbaitTitle, caption };
  } catch (err) {
    console.error("[gemini] failed:", err);
    return fallback(article);
  }
}

// Extract text from Interactions API response
function extractText(interaction: any): string {
  if (!interaction) return "";
  // outputs is an array of output turns
  if (Array.isArray(interaction.outputs) && interaction.outputs.length > 0) {
    const last = interaction.outputs[interaction.outputs.length - 1];
    if (last?.text) return last.text.trim();
    // parts-based output
    if (Array.isArray(last?.parts)) {
      return last.parts.map((p: any) => p.text || "").join("").trim();
    }
  }
  // Fallback: top-level text
  if (interaction.text) return interaction.text.trim();
  return "";
}

function parseResponse(text: string): { clickbaitTitle: string; caption: string } {
  let clickbaitTitle = "";
  let caption = "";

  const titleMatch = text.match(/CLICKBAIT_TITLE:\s*(.+)/);
  if (titleMatch) {
    clickbaitTitle = titleMatch[1].trim().replace(/^["']|["']$/g, "");
  }

  const captionMatch = text.match(/CAPTION:\s*([\s\S]+)/);
  if (captionMatch) {
    caption = captionMatch[1].trim().replace(/^["']|["']$/g, "");
  } else if (!titleMatch) {
    caption = text;
    const firstLine = text.split("\n")[0].trim();
    if (firstLine === firstLine.toUpperCase() && firstLine.length > 10) {
      clickbaitTitle = firstLine;
    }
  }

  return { clickbaitTitle, caption };
}

function isVagueCaption(caption: string): boolean {
  if (!caption || caption.length < 60) return true;
  const vaguePatterns = [
    /here'?s everything you need to know/i,
    /get the full story/i,
    /link in bio/i,
    /stay tuned/i,
    /watch this space/i,
    /follow .+ for (?:more|the latest)/i,
    /the internet is buzzing/i,
    /everyone is talking/i,
    /this is (?:huge|big|massive)/i,
    /you won'?t believe/i,
  ];
  return vaguePatterns.filter(p => p.test(caption)).length >= 2;
}

function fallback(article: Article): AIContent {
  const clickbaitTitle = buildClickbaitTitle(article);
  return { clickbaitTitle, caption: buildFallbackCaption(article, clickbaitTitle) };
}

function buildClickbaitTitle(article: Article): string {
  return article.title.toUpperCase().slice(0, 80);
}

function buildFallbackCaption(article: Article, clickbaitTitle: string): string {
  const source = article.sourceName ? " — " + article.sourceName + " reports." : ".";
  const lede = article.title + source;
  const body = article.fullBody && article.fullBody.trim().length > 50
    ? article.fullBody.trim().slice(0, 500)
    : article.summary && article.summary.trim().length > 30
      ? article.summary.trim().slice(0, 500)
      : "";
  return (
    clickbaitTitle + "\n\n" +
    lede +
    (body ? "\n\n" + body : "") +
    "\n\n" +
    "What do you think about this? 👇"
  );
}
