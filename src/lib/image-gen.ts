import satori from "satori";
import sharp from "sharp";
import { Article } from "./types";

const W = 1080;
const H = 1350;
const PINK  = "#FF007A";
const WHITE = "#FFFFFF";
const BLACK = "#000000";

const WHITE_WORDS = new Set([
  "A","AN","THE","AND","OR","BUT","IN","ON","AT","TO","FOR","OF","WITH",
  "BY","FROM","AS","IS","ARE","WAS","WERE","BE","BEEN","BEING","HAVE",
  "HAS","HAD","DO","DOES","DID","WILL","WOULD","COULD","SHOULD","MAY",
  "MIGHT","SHALL","CAN","NOW","NOT","NO","SO","IF","THEN","THAT","THIS",
  "THESE","THOSE","AFTER","BEFORE","DURING","OVER","UNDER","ABOUT","INTO",
  "THROUGH","BETWEEN","AMONG","AGAINST","ALONG","AROUND","REPORTEDLY",
  "ALLEGEDLY","SAYS","SAID","DIES","DEAD","PASSES","AWAY","JOINS","ADDS",
  "SETS","GETS","PUTS","TAKES","MAKES","GIVES","GOES","COMES","RETURNS",
  "RELEASES","DROPS","LAUNCHES","OPENS","CLOSES","WINS","LOSES","BEATS",
  "HITS","TOPS","LEADS","HEADS","SIGNS","LANDS","BOARDS","TALKS","CALLS",
  "TELLS","SHOWS","REVEALS","CONFIRMS","DENIES","ADDRESSES","REACTS",
  "RESPONDS","EXPLAINS","ANNOUNCES","YOU","HE","SHE","IT","WE","THEY",
  "HIS","HER","ITS","OUR","THEIR","YOUR","MY","WHO","WHAT","WHERE","WHEN",
  "HOW","WHY","WHICH","ALLOW","ALLOWS","ALLOWED","KEEP","KEEPS","KEPT",
  "WANT","WANTS","WANTED","NEED","NEEDS","NEEDED","ALSO","JUST","STILL",
  "EVEN","ONLY","BOTH","ALL","EACH","MORE","MOST","LESS","LEAST","VERY",
  "TOO","QUITE","NEW","OLD","FIRST","LAST","NEXT","SAME","OTHER","UP",
  "DOWN","OUT","OFF","BACK","AGAIN","WHILE","SINCE","UNTIL","THOUGH",
  "ALTHOUGH","BECAUSE","WHETHER",
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
      style: { color: isAccentWord(word) ? PINK : WHITE, marginRight: i < words.length - 1 ? 10 : 0 },
      children: word,
    },
  }));
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}

async function loadFont(): Promise<ArrayBuffer> {
  const sources = [
    "https://cdn.jsdelivr.net/npm/@fontsource/bebas-neue@5.0.8/files/bebas-neue-latin-400-normal.woff",
    "https://cdn.jsdelivr.net/npm/@fontsource/oswald@5.0.8/files/oswald-latin-700-normal.woff",
  ];
  for (const url of sources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (res.ok) return res.arrayBuffer();
    } catch { /* try next */ }
  }
  throw new Error("Could not load font");
}

// ── PPP TV Logo component ─────────────────────────────────────────────────────
// Top-left branded logo block: pink dot + "PPP" white + "TV" pink + "KENYA" tag
// Sits on a semi-transparent dark pill for legibility over any background
function buildLogo() {
  return {
    type: "div",
    props: {
      style: {
        position: "absolute" as const,
        top: 44,
        left: 44,
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "flex-start",
      },
      children: [
        // Main logo pill
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              alignItems: "center",
              background: "rgba(0,0,0,0.72)",
              borderRadius: 6,
              paddingLeft: 16,
              paddingRight: 20,
              paddingTop: 10,
              paddingBottom: 10,
              borderLeft: `5px solid ${PINK}`,
            },
            children: [
              // Pink accent dot
              {
                type: "span",
                props: {
                  style: {
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    backgroundColor: PINK,
                    marginRight: 12,
                    flexShrink: 0,
                  },
                  children: " ",
                },
              },
              // "PPP" in white
              {
                type: "span",
                props: {
                  style: {
                    color: WHITE,
                    fontSize: 52,
                    fontWeight: 700,
                    letterSpacing: 3,
                    lineHeight: 1,
                  },
                  children: "PPP",
                },
              },
              // "TV" in pink
              {
                type: "span",
                props: {
                  style: {
                    color: PINK,
                    fontSize: 52,
                    fontWeight: 700,
                    letterSpacing: 3,
                    lineHeight: 1,
                    marginLeft: 6,
                  },
                  children: "TV",
                },
              },
            ],
          },
        },
        // "KENYA" sub-label
        {
          type: "div",
          props: {
            style: {
              color: WHITE,
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: 8,
              marginTop: 5,
              marginLeft: 22,
              opacity: 0.85,
            },
            children: "KENYA",
          },
        },
      ],
    },
  };
}

export async function generateImage(article: Article): Promise<Buffer> {
  const [fontData, rawBg] = await Promise.all([
    loadFont(),
    article.imageUrl ? fetchImageBuffer(article.imageUrl) : Promise.resolve(null),
  ]);

  let bgBase64: string | null = null;
  if (rawBg) {
    try {
      const resized = await sharp(rawBg).resize(W, H, { fit: "cover", position: "top" }).jpeg({ quality: 90 }).toBuffer();
      bgBase64 = `data:image/jpeg;base64,${resized.toString("base64")}`;
    } catch { bgBase64 = null; }
  }

  const headlineSpans = buildHeadlineSpans(article.title);
  const category = article.category.toUpperCase();
  const charCount = article.title.length;
  let headlineFontSize = 118;
  if (charCount > 60) headlineFontSize = 96;
  if (charCount > 80) headlineFontSize = 82;
  if (charCount > 100) headlineFontSize = 70;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = await (satori as any)(
    {
      type: "div",
      props: {
        style: {
          width: W, height: H, display: "flex", flexDirection: "column",
          position: "relative", backgroundColor: BLACK, overflow: "hidden",
          fontFamily: "BebasNeue",
        },
        children: [
          // Background image
          bgBase64 ? {
            type: "img",
            props: {
              src: bgBase64,
              style: { position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover", objectPosition: "center top" },
            },
          } : null,

          // Gradient overlay — dark at bottom for text legibility
          {
            type: "div",
            props: {
              style: {
                position: "absolute", left: 0, right: 0, top: 0, height: H,
                background: "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.88) 65%, rgba(0,0,0,1) 78%)",
              },
            },
          },

          // ── PPP TV LOGO (top-left) ──────────────────────────────────────
          buildLogo(),

          // ── Bottom content block ────────────────────────────────────────
          {
            type: "div",
            props: {
              style: {
                position: "absolute", bottom: 0, left: 0, right: 0,
                display: "flex", flexDirection: "column", alignItems: "flex-start",
                padding: "0 44px 52px 44px",
              },
              children: [
                // Category badge — large, bold, prominent
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      alignSelf: "flex-start",
                      backgroundColor: PINK,
                      paddingLeft: 20,
                      paddingRight: 20,
                      paddingTop: 8,
                      paddingBottom: 8,
                      borderRadius: 4,
                      marginBottom: 20,
                    },
                    children: [{
                      type: "span",
                      props: {
                        style: {
                          color: WHITE,
                          fontSize: 34,       // was 20 — now 34, much more visible
                          fontWeight: 700,
                          letterSpacing: 4,
                          lineHeight: 1,
                        },
                        children: category,
                      },
                    }],
                  },
                },

                // Headline
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex", flexWrap: "wrap",
                      fontSize: headlineFontSize, fontWeight: 400,
                      lineHeight: 0.92, letterSpacing: 1, marginBottom: 22,
                    },
                    children: headlineSpans,
                  },
                },

                // Summary sub-line
                article.summary ? {
                  type: "div",
                  props: {
                    style: {
                      color: "rgba(255,255,255,0.72)", fontSize: 26, fontWeight: 400,
                      fontStyle: "italic", lineHeight: 1.35, letterSpacing: 0.3,
                    },
                    children: article.summary.slice(0, 90) + (article.summary.length > 90 ? "\u2026" : ""),
                  },
                } : null,
              ].filter(Boolean),
            },
          },
        ].filter(Boolean),
      },
    },
    {
      width: W,
      height: H,
      fonts: [{ name: "BebasNeue", data: fontData, weight: 400, style: "normal" }],
    }
  );

  return sharp(Buffer.from(svg)).resize(W, H).jpeg({ quality: 93 }).toBuffer();
}
