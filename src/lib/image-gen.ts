import satori from "satori";
import sharp from "sharp";
import { Article } from "./types";

const SIZE = 1080;
const ACCENT = "#F47B20"; // Rap TV orange
const WHITE = "#FFFFFF";
const BLACK = "#000000";

// Words that stay white (connectors, articles, prepositions, verbs)
const WHITE_WORDS = new Set([
  "A", "AN", "THE", "AND", "OR", "BUT", "IN", "ON", "AT", "TO", "FOR",
  "OF", "WITH", "BY", "FROM", "AS", "IS", "ARE", "WAS", "WERE", "BE",
  "BEEN", "BEING", "HAVE", "HAS", "HAD", "DO", "DOES", "DID", "WILL",
  "WOULD", "COULD", "SHOULD", "MAY", "MIGHT", "SHALL", "CAN", "NOW",
  "NOT", "NO", "SO", "IF", "THEN", "THAT", "THIS", "THESE", "THOSE",
  "AFTER", "BEFORE", "DURING", "OVER", "UNDER", "ABOUT", "INTO",
  "THROUGH", "BETWEEN", "AMONG", "AGAINST", "ALONG", "AROUND",
  "REPORTEDLY", "ALLEGEDLY", "SAYS", "SAID", "DIES", "DEAD",
  "PASSES", "AWAY", "JOINS", "ADDS", "SETS", "GETS", "PUTS", "TAKES",
  "MAKES", "GIVES", "GOES", "COMES", "RETURNS", "RELEASES", "DROPS",
  "LAUNCHES", "OPENS", "CLOSES", "WINS", "LOSES", "BEATS", "HITS",
  "TOPS", "LEADS", "HEADS", "SIGNS", "LANDS", "BOARDS", "TALKS",
  "CALLS", "TELLS", "SHOWS", "REVEALS", "CONFIRMS", "DENIES",
  "ADDRESSES", "REACTS", "RESPONDS", "EXPLAINS", "ANNOUNCES",
  "YOU", "HE", "SHE", "IT", "WE", "THEY", "HIS", "HER", "ITS",
  "OUR", "THEIR", "YOUR", "MY", "WHO", "WHAT", "WHERE", "WHEN",
  "HOW", "WHY", "WHICH", "ALLOW", "ALLOWS", "ALLOWED",
  "KEEP", "KEEPS", "KEPT", "PREDICT", "PREDICTS", "PREDICTED",
  "WANT", "WANTS", "WANTED", "NEED", "NEEDS", "NEEDED",
  "ALSO", "JUST", "STILL", "EVEN", "ONLY", "BOTH", "ALL", "EACH",
  "MORE", "MOST", "LESS", "LEAST", "VERY", "TOO", "QUITE",
  "PAUSE", "PAUSES", "PAUSED", "DROP", "DROPS", "DROPPED",
  "NEW", "OLD", "FIRST", "LAST", "NEXT", "SAME", "OTHER",
  "UP", "DOWN", "OUT", "OFF", "BACK", "AWAY", "AGAIN",
]);

function isAccentWord(word: string): boolean {
  const clean = word.replace(/[^A-Z0-9']/g, "");
  if (clean.length === 0) return false;
  return !WHITE_WORDS.has(clean);
}

function buildHeadlineSpans(title: string) {
  const upper = title.toUpperCase();
  const words = upper.split(/\s+/);
  return words.map((word, i) => ({
    type: "span" as const,
    props: {
      style: {
        color: isAccentWord(word) ? ACCENT : WHITE,
        marginRight: i < words.length - 1 ? "0.18em" : "0",
        display: "inline",
      },
      children: word,
    },
  }));
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

async function loadFont(): Promise<ArrayBuffer> {
  // satori requires OTF/TTF/WOFF — NOT woff2
  // Use Oswald Bold from jsDelivr (serves the raw OTF)
  const sources = [
    // Oswald Bold OTF via jsDelivr
    "https://cdn.jsdelivr.net/npm/@fontsource/oswald@5.0.8/files/oswald-latin-700-normal.woff",
    // Fallback: Inter Bold woff
    "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-700-normal.woff",
  ];

  for (const url of sources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.ok) return res.arrayBuffer();
    } catch {
      // try next
    }
  }

  throw new Error("Could not load any font");
}

export async function generateImage(article: Article): Promise<Buffer> {
  const [fontData, rawBg] = await Promise.all([
    loadFont(),
    article.imageUrl ? fetchImageBuffer(article.imageUrl) : Promise.resolve(null),
  ]);

  let bgBase64: string | null = null;
  if (rawBg) {
    try {
      const resized = await sharp(rawBg)
        .resize(SIZE, SIZE, { fit: "cover", position: "centre" })
        .jpeg({ quality: 88 })
        .toBuffer();
      bgBase64 = `data:image/jpeg;base64,${resized.toString("base64")}`;
    } catch {
      bgBase64 = null;
    }
  }

  const headlineSpans = buildHeadlineSpans(article.title);
  const category = article.category.toUpperCase();

  const wordCount = article.title.split(/\s+/).length;
  const estimatedLines = Math.ceil(wordCount / 4);
  const bottomBandHeight = 80 + estimatedLines * 130 + 60 + 60;
  const clampedBand = Math.min(Math.max(bottomBandHeight, 320), 520);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = await (satori as any)(
    {
      type: "div",
      props: {
        style: {
          width: SIZE,
          height: SIZE,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          backgroundColor: BLACK,
          overflow: "hidden",
          fontFamily: "Oswald",
        },
        children: [
          bgBase64
            ? {
                type: "img",
                props: {
                  src: bgBase64,
                  style: {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: SIZE,
                    height: SIZE - clampedBand + 80,
                    objectFit: "cover",
                    objectPosition: "center top",
                  },
                },
              }
            : null,
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: clampedBand - 80,
                height: 220,
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,1) 100%)",
              },
            },
          },
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: clampedBand,
                backgroundColor: BLACK,
              },
            },
          },
          // PPP TV Logo
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                top: 36,
                left: 44,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: { display: "flex", alignItems: "center", gap: 6 },
                    children: [
                      { type: "span", props: { style: { fontSize: 20, color: WHITE, lineHeight: 1 }, children: "♛" } },
                      { type: "span", props: { style: { color: WHITE, fontSize: 36, fontWeight: 800, letterSpacing: "0.04em", lineHeight: 1 }, children: "PPP" } },
                      { type: "span", props: { style: { color: WHITE, fontSize: 28, fontWeight: 400, letterSpacing: "0.04em", lineHeight: 1 }, children: "TV" } },
                    ],
                  },
                },
                {
                  type: "div",
                  props: {
                    style: { color: ACCENT, fontSize: 13, fontWeight: 700, letterSpacing: "0.22em", marginTop: 2, marginLeft: 26 },
                    children: "KENYA",
                  },
                },
              ],
            },
          },
          // Bottom content
          {
            type: "div",
            props: {
              style: {
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: clampedBand,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start",
                padding: "28px 48px 44px 48px",
                gap: 0,
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: { display: "flex", alignSelf: "flex-start", backgroundColor: WHITE, paddingLeft: 18, paddingRight: 18, paddingTop: 6, paddingBottom: 6, marginBottom: 20 },
                    children: [{ type: "span", props: { style: { color: BLACK, fontSize: 22, fontWeight: 800, letterSpacing: "0.12em" }, children: category } }],
                  },
                },
                {
                  type: "div",
                  props: {
                    style: { display: "flex", flexWrap: "wrap", fontSize: 88, fontWeight: 800, lineHeight: 1.0, letterSpacing: "-0.01em", marginBottom: 20 },
                    children: headlineSpans,
                  },
                },
                {
                  type: "div",
                  props: {
                    style: { color: "rgba(255,255,255,0.75)", fontSize: 26, fontWeight: 400, fontStyle: "italic", lineHeight: 1.3 },
                    children: article.summary ? article.summary.slice(0, 80) + (article.summary.length > 80 ? "…" : "") : "",
                  },
                },
              ],
            },
          },
        ].filter(Boolean),
      },
    },
    {
      width: SIZE,
      height: SIZE,
      fonts: [{ name: "Oswald", data: fontData, weight: 800, style: "normal" }],
    }
  );

  return sharp(Buffer.from(svg)).resize(SIZE, SIZE).jpeg({ quality: 92 }).toBuffer();
}
