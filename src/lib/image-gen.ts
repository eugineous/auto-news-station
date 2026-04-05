import satori from "satori";
import sharp from "sharp";
import { Article } from "./types";
import { PPP_LOGO_B64 } from "./ppp-logo-b64";

const W = 1080, H = 1350;

// Supported output ratios — width × height at 1080px base
export const IMAGE_RATIOS: Record<string, { w: number; h: number; label: string }> = {
  "4:5":  { w: 1080, h: 1350, label: "4:5 (IG Feed)" },
  "1:1":  { w: 1080, h: 1080, label: "1:1 (Square)" },
  "9:16": { w: 1080, h: 1920, label: "9:16 (Story/Reel)" },
  "16:9": { w: 1920, h: 1080, label: "16:9 (Landscape)" },
  "4:3":  { w: 1080, h: 810,  label: "4:3 (Classic)" },
};

// ── PPP TV Brand Guidelines ───────────────────────────────────────────────────
// Primary: #E50914 (PPP Red) | Secondary: #FFFFFF | Accent: #FF007A
// Font: Bebas Neue (headlines) | Always show source credit | No emojis in headlines
const BRAND = {
  red: "#E50914",
  white: "#FFFFFF",
  black: "#000000",
  overlayStart: "rgba(0,0,0,0)",
  overlayEnd: "rgba(0,0,0,1)",
  followCta: "FOLLOW FOR MORE",
};

// ── Category colors — exact match to PPP TV site ─────────────────────────────
const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  CELEBRITY:     { bg: "#FF007A", text: "#FFFFFF" },
  FASHION:       { bg: "#ec4899", text: "#FFFFFF" },
  MUSIC:         { bg: "#a855f7", text: "#FFFFFF" },
  "TV & FILM":   { bg: "#f59e0b", text: "#000000" },
  MOVIES:        { bg: "#f59e0b", text: "#000000" },
  LIFESTYLE:     { bg: "#14b8a6", text: "#FFFFFF" },
  EVENTS:        { bg: "#10b981", text: "#FFFFFF" },
  "EAST AFRICA": { bg: "#06b6d4", text: "#000000" },
  COMEDY:        { bg: "#eab308", text: "#000000" },
  INFLUENCERS:   { bg: "#f97316", text: "#FFFFFF" },
  SPORTS:        { bg: "#3b82f6", text: "#FFFFFF" },
  BUSINESS:      { bg: "#FFD700", text: "#000000" },
  AWARDS:        { bg: "#FFD700", text: "#000000" },
  ENTERTAINMENT: { bg: "#a855f7", text: "#FFFFFF" },
  POLITICS:      { bg: "#FF007A", text: "#FFFFFF" },
  NEWS:          { bg: "#FF007A", text: "#FFFFFF" },
  TECHNOLOGY:    { bg: "#06b6d4", text: "#000000" },
  HEALTH:        { bg: "#10b981", text: "#FFFFFF" },
  SCIENCE:       { bg: "#3b82f6", text: "#FFFFFF" },
  GENERAL:       { bg: "#E50914", text: "#FFFFFF" },
};

function getCatColor(category: string): { bg: string; text: string } {
  return CAT_COLORS[category.toUpperCase()] ?? { bg: "#E50914", text: "#FFFFFF" };
}

let _fontCache: ArrayBuffer | null = null;
async function loadFont(): Promise<ArrayBuffer> {
  if (_fontCache) return _fontCache;
  // Only use woff (not woff2) — satori doesn't support woff2
  const sources = [
    "https://cdn.jsdelivr.net/npm/@fontsource/bebas-neue@5.0.8/files/bebas-neue-latin-400-normal.woff",
    "https://cdn.jsdelivr.net/npm/@fontsource/oswald@5.0.8/files/oswald-latin-700-normal.woff",
    "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-700-normal.woff",
  ];
  for (const url of sources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.ok) { _fontCache = await res.arrayBuffer(); return _fontCache; }
    } catch { /* try next */ }
  }
  throw new Error("Could not load font");
}

// ── Emoji support via Twemoji SVG ─────────────────────────────────────────────
// Satori's loadAdditionalAsset fetches emoji SVGs from Twemoji CDN on demand
const TWEMOJI_BASES = [
  "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg",
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg",
];

function emojiToCodepoint(emoji: string): string {
  return Array.from(emoji)
    .map(c => c.codePointAt(0)!.toString(16).padStart(4, "0"))
    .filter(cp => cp !== "fe0f") // strip variation selector
    .join("-");
}

async function loadEmojiAsset(_code: string, segment: string): Promise<string | undefined> {
  const cp = emojiToCodepoint(segment);
  for (const base of TWEMOJI_BASES) {
    try {
      const url = `${base}/${cp}.svg`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const svg = await res.text();
      if (!svg.includes("<svg")) continue;
      return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    } catch { continue; }
  }
  return undefined;
}

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  if (!url?.trim()) return null;
  try {
    if (url.startsWith("data:")) {
      const base64 = url.split(",")[1];
      return Buffer.from(base64, "base64");
    }

    // Try direct fetch first
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)",
        "Referer": "https://ppp-tv-site-final.vercel.app",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const ct = res.headers.get("content-type") || "";
      if (ct.startsWith("image/") || ct.startsWith("application/octet")) {
        return Buffer.from(await res.arrayBuffer());
      }
    }

    // Fallback: proxy through Cloudflare worker (bypasses hotlink protection)
    const proxyRes = await fetch(`${WORKER_URL}/img?url=${encodeURIComponent(url)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
      signal: AbortSignal.timeout(12000),
    });
    if (proxyRes.ok) {
      const ct = proxyRes.headers.get("content-type") || "";
      if (ct.startsWith("image/") || ct.startsWith("application/octet")) {
        return Buffer.from(await proxyRes.arrayBuffer());
      }
    }

    return null;
  } catch { return null; }
}

// Auto-size headline based on character count — big and bold
function getHeadlineFontSize(title: string): number {
  const chars = title.length;
  if (chars <= 20) return 160;
  if (chars <= 30) return 140;
  if (chars <= 40) return 122;
  if (chars <= 55) return 108;
  if (chars <= 70) return 94;
  if (chars <= 90) return 80;
  if (chars <= 110) return 68;
  return 58;
}

export interface ImageOptions {
  isBreaking?: boolean;
  storyFormat?: boolean;
  ratio?: string; // e.g. "4:5", "1:1", "16:9", "9:16", "4:3"
}

export async function generateImage(article: Article, opts: ImageOptions = {}): Promise<Buffer> {
  const dims = (opts.ratio && IMAGE_RATIOS[opts.ratio]) ? IMAGE_RATIOS[opts.ratio] : { w: W, h: H };
  const iW = dims.w, iH = dims.h;
  const [fontData, rawBg] = await Promise.all([
    loadFont(),
    article.imageUrl?.trim() ? fetchImageBuffer(article.imageUrl) : Promise.resolve(null),
  ]);

  let bgBase64: string | null = null;
  if (rawBg) {
    try {
      const resized = await sharp(rawBg)
        .resize(iW, iH, { fit: "cover", position: "attention" })
        .jpeg({ quality: 88 })
        .toBuffer();
      bgBase64 = `data:image/jpeg;base64,${resized.toString("base64")}`;
    } catch { bgBase64 = null; }
  }

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
          width: iW,
          height: iH,
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
                    width: iW, height: iH,
                    objectFit: "cover", objectPosition: "center top",
                  },
                },
              }
            : {
                type: "div",
                props: {
                  style: {
                    position: "absolute", top: 0, left: 0, width: iW, height: iH,
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
                position: "absolute", left: 0, right: 0, top: 0, height: iH,
                background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.88) 65%, rgba(0,0,0,1) 78%)",
              },
              children: [],
            },
          },

          // ── Top bar: PPP TV KENYA branding strip ────────────────────────
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                position: "absolute", top: 0, left: 0, right: 0,
                height: 80,
                background: "rgba(0,0,0,0.75)",
                alignItems: "center",
                justifyContent: "space-between",
                paddingLeft: 36, paddingRight: 36,
              },
              children: [
                {
                  type: "span",
                  props: {
                    style: {
                      color: BRAND.red, fontSize: 36, fontWeight: 700,
                      letterSpacing: 5, lineHeight: 1,
                    },
                    children: "PPP TV KENYA",
                  },
                },
                {
                  type: "span",
                  props: {
                    style: {
                      color: "rgba(255,255,255,0.5)", fontSize: 28, fontWeight: 400,
                      letterSpacing: 2, lineHeight: 1,
                    },
                    children: "24/7 GEN Z ENTERTAINMENT",
                  },
                },
              ],
            },
          },

          // ── PPP TV Logo — top-left corner, below top bar ─────────────────
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                position: "absolute", top: 96, left: 40,
              },
              children: [{
                type: "img",
                props: {
                  src: PPP_LOGO_B64,
                  style: { width: 240, height: 96, objectFit: "contain" },
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
                      paddingLeft: 30, paddingRight: 30,
                      paddingTop: 14, paddingBottom: 14,
                      borderRadius: 50,
                      marginBottom: 24,
                    },
                    children: [{
                      type: "span",
                      props: {
                        style: {
                          color: catText,
                          fontSize: 38,
                          fontWeight: 700,
                          letterSpacing: 4,
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
                      lineHeight: 1.0,
                      letterSpacing: 2,
                      marginBottom: 32,
                    },
                    children: title,
                  },
                },

                // "FOLLOW FOR MORE" pill + source credit row
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                    },
                    children: [
                      // Follow pill
                      {
                        type: "div",
                        props: {
                          style: {
                            display: "flex",
                            backgroundColor: catBg,
                            paddingLeft: 34, paddingRight: 34,
                            paddingTop: 16, paddingBottom: 16,
                            borderRadius: 50,
                          },
                          children: [{
                            type: "span",
                            props: {
                              style: {
                                color: catText,
                                fontSize: 34,
                                fontWeight: 700,
                                letterSpacing: 5,
                                lineHeight: 1,
                              },
                              children: "FOLLOW FOR MORE",
                            },
                          }],
                        },
                      },
                      // Source credit — small, right-aligned
                      article.sourceName
                        ? {
                            type: "span",
                            props: {
                              style: {
                                color: "rgba(255,255,255,0.6)",
                                fontSize: 26,
                                fontWeight: 400,
                                letterSpacing: 1,
                                lineHeight: 1,
                              },
                              children: `via ${article.sourceName}`,
                            },
                          }
                        : { type: "span", props: { style: { display: "flex" }, children: "" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width: iW,
      height: iH,
      fonts: [{ name: "BebasNeue", data: fontData, weight: 700, style: "normal" }],
      loadAdditionalAsset: loadEmojiAsset,
    }
  );

  return sharp(Buffer.from(svg)).resize(iW, iH).jpeg({ quality: 93 }).toBuffer();
}
