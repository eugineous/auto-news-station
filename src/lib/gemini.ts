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
Your caption has 3 parts, separated by blank lines. DO NOT include the headline/title inside the caption at all:

1. LEDE — one punchy sentence: WHO did WHAT, WHERE. Real name required. NO ALL CAPS.
2. BODY — one paragraph (3-5 sentences) of real detail. Include: names, locations, Ksh figures, dates, quotes, context. The reader should understand the full story without clicking. Keep it to ONE paragraph only.
3. CTA — one engaging question specific to this story + optional 👇

## CRITICAL RULES
- NEVER start the caption with the headline or title — not even paraphrased
- NEVER use ALL CAPS anywhere in the caption body
- The caption starts directly with the lede sentence
- ONE paragraph for the body — not bullet points, not multiple paragraphs of detail
- Every sentence has a SPECIFIC FACT (name, number, place, date, quote)
- No hashtags whatsoever
- Max 2 emojis total

## WHAT MAKES A BAD CAPTION (never do these)
- Starting with the headline repeated: "REAL MADRID BEAT ATLETICO..." or "Real Madrid Beat Atletico..."
- Vague filler: "The internet is buzzing", "Here's everything you need to know", "This is huge"
- Generic CTAs: "Stay tuned", "Watch this space", "Link in bio"
- Writing "BREAKING" anywhere
- More than one body paragraph

## EXAMPLES

GOOD:
CLICKBAIT_TITLE: BIEN AIME EXITS SOL GENERATION AFTER 12 YEARS
CAPTION: Bien-Aimé Baraza has officially left Sol Generation, the label he co-founded with Sauti Sol in 2018.

The announcement came via a statement on his socials, citing "creative differences and a need to explore solo ventures." Bien's departure leaves Savara as the only active member still releasing music under the Sol Generation umbrella. His debut solo album is reportedly in the works, with features from Nyashinski and Karun. The split has been described as amicable, with both sides wishing each other well.

What do you think Bien's solo music will sound like? 👇

GOOD:
CLICKBAIT_TITLE: VINICIUS DOUBLE KEEPS REAL MADRID FOUR POINTS BEHIND BARCA
CAPTION: Vinicius Junior scored twice — including a clinical penalty and a stunning late winner — as Real Madrid edged Atletico 3-2 at the Bernabeu.

The victory keeps Carlo Ancelotti's side four points behind La Liga leaders Barcelona with eight games remaining. Atletico had levelled twice through Griezmann and Correa before Vinicius sealed it in the 87th minute. The result leaves the title race wide open heading into the final stretch.

Who takes La Liga this season? 👇

BAD (do NOT write like this):
"REAL MADRID BEAT ATLETICO 3-2 TO STAY FOUR POINTS BEHIND BARCELONA Real Madrid Beat Atletico 3-2 to Stay Four Points Behind Barcelona — PPP TV Kenya reports..."`;

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
      "Use ONLY facts from the article. No hashtags. No fabrication.\n" +
      "CRITICAL: Do NOT start the caption with the headline or title.\n\n" +
      "Respond EXACTLY like this:\n" +
      "CLICKBAIT_TITLE: YOUR TITLE HERE IN ALL CAPS\n" +
      "CAPTION: Your full caption here (starts with lede, NOT the headline)";

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
        maxOutputTokens: 1200,
        topP: 0.9,
      },
    });

    const text = response.text?.trim() ?? "";
    let { clickbaitTitle, caption } = parseResponse(text);

    // If vague, retry once with stricter prompt
    if (isVagueCaption(caption) && content) {
      const retryPrompt =
        "Your previous caption was too vague. Try again.\n\n" +
        "TITLE: " + article.title + "\n" +
        "ARTICLE:\n" + content + "\n\n" +
        "RULES:\n" +
        "- Every sentence MUST contain a real name, place, date, or number\n" +
        "- No filler phrases like 'the internet is buzzing' or 'here's what happened'\n" +
        "- Write like you're texting a friend the actual news\n" +
        "- Do NOT start with the headline\n\n" +
        "CLICKBAIT_TITLE: ...\n" +
        "CAPTION: ...";

      try {
        const retry = await client.models.generateContent({
          model: "gemini-2.5-flash",
          contents: retryPrompt,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.5,
            maxOutputTokens: 1200,
          },
        });
        const retryText = retry.text?.trim() ?? "";
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

    // Strip any headline that leaked into the top of the caption
    caption = stripLeadingHeadline(caption, clickbaitTitle, article.title);
    caption = caption.replace(/#\w+/g, "").replace(/\n{3,}/g, "\n\n").trim();

    return { clickbaitTitle, caption };
  } catch (err) {
    console.error("[gemini] failed:", err);
    return fallback(article);
  }
}

// Strip a headline that leaked into the top of the caption
function stripLeadingHeadline(caption: string, clickbaitTitle: string, originalTitle: string): string {
  const lines = caption.split("\n");
  const first = lines[0].trim();
  // If the first line is all-caps and matches the headline pattern, drop it
  if (first === first.toUpperCase() && first.length > 10 && first.replace(/[^A-Z]/g, "").length > 5) {
    lines.shift();
    // Also drop the blank line after it
    while (lines.length && lines[0].trim() === "") lines.shift();
    return lines.join("\n");
  }
  // If the first line starts with the title (title-cased version), drop it
  const titleNorm = originalTitle.toLowerCase().slice(0, 40);
  if (first.toLowerCase().startsWith(titleNorm.slice(0, 30))) {
    lines.shift();
    while (lines.length && lines[0].trim() === "") lines.shift();
    return lines.join("\n");
  }
  return caption;
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
  // Use the best available body text — never repeat the headline in the caption
  const rawBody = article.fullBody && article.fullBody.trim().length > 50
    ? article.fullBody.trim()
    : article.summary && article.summary.trim().length > 30
      ? article.summary.trim()
      : "";

  // Build a single clean paragraph — strip any ALL CAPS lines that look like headlines
  const cleaned = rawBody
    .split(/\n+/)
    .filter(line => {
      const t = line.trim();
      if (!t) return false;
      // Drop lines that are mostly uppercase (headline artifacts)
      const upperRatio = (t.match(/[A-Z]/g) || []).length / t.replace(/\s/g, "").length;
      return upperRatio < 0.7;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  const body = cleaned || article.title;

  return (
    body +
    "\n\n" +
    "What do you think about this? 👇"
  );
}
