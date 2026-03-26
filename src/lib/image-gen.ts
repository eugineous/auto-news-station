import satori from "satori";
import sharp from "sharp";
import { Article } from "./types";
import { PPP_LOGO_B64 } from "./ppp-logo-b64";

const W = 1080, H = 1350;

// ── Category colors — exactly matching reference images ───────────────────────
// BUSINESS/AWARDS → yellow pill, black text (like the Tom Brady card)
// ENTERTAINMENT/MUSIC → purple pill, white text (like the Mark Wahlberg card)
// SPORTS → cyan/sky blue pill, black text (like the Turkey vs Romania card)
// CELEBRITY/FASHION → hot pink pill, white text
// TV & FILM → blue pill, white text
// EVENTS → green pill, white text
const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  BUSINESS:      { bg: "#FFD700", text: "#000000" },
  AWARDS:        { bg: "#FFD700", text: "#000000" },
  ENTERTAINMENT: { bg: "#9B30FF", text: "#FFFFFF" },
  MUSIC:         { bg: "#9B30FF", text: "#FFFFFF" },
  SPORTS:        { bg: "#00BFFF", text: "#000000" },
  CELEBRITY:     { bg: "#FF007A", text: "#FFFFFF" },
  FASHION:       { bg: "#FF007A", text: "#FFFFFF" },
  "TV & FILM":   { bg: "#3B82F6", text: "#FFFFFF" },
  EVENTS:        { bg: "#22C55E", text: "#FFFFFF" },
  "EAST AFRICA": { bg: "#F97316", text: "#FFFFFF" },
  GENERAL:       { bg: "#E50914", text: "#FFFFFF" },
  NEWS:          { bg: "#E50914", text: "#FFFFFF" },
};

function getCatColor(category: string): { bg: string; text: string } {
  return CAT_COLORS[category.toUpperCase()] ?? { bg: "#E50914", text: "#FFFFFF" };
}

let _fontCache: ArrayBuffer | null = null;
async function loadFont(): Promise<ArrayBuffer> {
  if (_fontCache) return _fontCache;
  const sources = [
    "https://cdn.jsdelivr.net/npm/@fontsource/bebas-neue@5.0.8/files/bebas-neue-latin-400-normal.woff",
    "https://cdn.jsdelivr.net/npm/@fontsource/oswald@5.0.8/files/oswald-latin-700-normal.woff",
  ];
  for (const url of sources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (res.ok) { _fontCache = await res.arrayBuffer(); return _fontCache; }
    } catch { /* try next */ }
  }
  throw new Error("Could not load font");
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith("data:")) {
      const base64 = url.split(",")[1];
      return Buffer.from(base64, "base64");
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}

// Auto-size headline based on character count
function getHeadlineFontSize(title: string): number {
  const chars = title.length;
  if (chars <= 30) return 110;
  if (chars <= 45) return 92;
  if (chars <= 60) return 78;
  if (chars <= 80) return 66;
  if (chars <= 100) return 56;
  if (chars <= 120) return 48;
  return 42;
}

export interface ImageOptions {
  isBreaking?: boolean;
  storyFormat?: boolean;
}

export async function generateImage(article: Article, opts: ImageOptions = {}): Promise<Buffer> {
  if (!article.imageUrl || article.imageUrl.trim() === "") {
    throw new Error("NO_IMAGE: article has no imageUrl — skipping");
  }

  const [fontData, rawBg] = await Promise.all([
    loadFont(),
    fetchImageBuffer(article.imageUrl),
  ]);

  if (!rawBg) throw new Error("NO_IMAGE: could not fetch imageUrl — skipping");

  // Resize background to full canvas
  let bgBase64: string | null = null;
  try {
    const resized = await sharp(rawBg)
      .resize(W, H, { fit: "cover", position: "attention" })
      .jpeg({ quality: 88 })
      .toBuffer();
    bgBase64 = `data:image/jpeg;base64,${resized.toString("base64")}`;
  } catch { bgBase64 = null; }

  const category = article.category.toUpperCase();
  const { bg: catBg, text: catText } = getCatColor(category);
  const title = article.title.toUpperCase();
  const fontSize = getHeadlineFontSize(title);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = await (satori as any)(
    {
      type: "div",
      props: {
        style: {
          display: "flex",
          width: W,
          height: H,
          position: "relative",
          backgroundColor: "#000",
          overflow: "hidden",
          fontFamily: "BebasNeue",
        },
        children: [
          // ── Full-bleed background image ──────────────────────────────────
          bgBase64
            ? {
                type: "img",
                props: {
                  src: bgBase64,
                  style: {
                    position: "absolute", top: 0, left: 0,
                    width: W, height: H,
                    objectFit: "cover", objectPosition: "center top",
                  },
                },
              }
            : {
                type: "div",
                props: {
                  style: {
                    position: "absolute", top: 0, left: 0, width: W, height: H,
                    background: "#111", display: "flex",
                  },
                  children: [],
                },
              },

          // ── Gradient overlay: transparent top → solid black bottom ───────
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                position: "absolute", left: 0, right: 0, top: 0, height: H,
                background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.88) 65%, rgba(0,0,0,1) 78%)",
              },
              children: [],
            },
          },

          // ── PPP TV Logo — top-left corner, on top of image ───────────────
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                position: "absolute", top: 36, left: 36,
              },
              children: [{
                type: "img",
                props: {
                  src: PPP_LOGO_B64,
                  style: { width: 180, height: 72, objectFit: "contain" },
                },
              }],
            },
          },

          // ── Bottom content area ──────────────────────────────────────────
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                position: "absolute",
                bottom: 0, left: 0, right: 0,
                padding: "0 44px 48px 44px",
              },
              children: [
                // Category pill — rounded, category color
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      alignSelf: "flex-start",
                      backgroundColor: catBg,
                      paddingLeft: 24, paddingRight: 24,
                      paddingTop: 10, paddingBottom: 10,
                      borderRadius: 50,
                      marginBottom: 20,
                    },
                    children: [{
                      type: "span",
                      props: {
                        style: {
                          color: catText,
                          fontSize: 30,
                          fontWeight: 700,
                          letterSpacing: 3,
                          lineHeight: 1,
                        },
                        children: category,
                      },
                    }],
                  },
                },

                // Headline — ALL CAPS, bold white, auto-sized
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      flexWrap: "wrap",
                      fontSize: fontSize,
                      fontWeight: 700,
                      color: "#FFFFFF",
                      lineHeight: 1.05,
                      letterSpacing: 1,
                      marginBottom: 28,
                    },
                    children: title,
                  },
                },

                // "FOLLOW FOR MORE" pill — same category color
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      alignSelf: "flex-start",
                      backgroundColor: catBg,
                      paddingLeft: 28, paddingRight: 28,
                      paddingTop: 12, paddingBottom: 12,
                      borderRadius: 50,
                    },
                    children: [{
                      type: "span",
                      props: {
                        style: {
                          color: catText,
                          fontSize: 26,
                          fontWeight: 700,
                          letterSpacing: 4,
                          lineHeight: 1,
                        },
                        children: "FOLLOW FOR MORE",
                      },
                    }],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width: W,
      height: H,
      fonts: [{ name: "BebasNeue", data: fontData, weight: 700, style: "normal" }],
    }
  );

  return sharp(Buffer.from(svg)).resize(W, H).jpeg({ quality: 93 }).toBuffer();
}
