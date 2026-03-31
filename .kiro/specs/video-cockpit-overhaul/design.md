# Design Document: Video Cockpit Overhaul

## Overview

This document describes the technical design for the Video Cockpit Overhaul — a comprehensive upgrade to the Auto News Station platform. The overhaul addresses three critical bugs, delivers a video-first cockpit UI, a dedicated `/composer` route, expanded autonomous video scraping from football and entertainment platforms, and 50+ new platform features.

The platform is a Kenyan entertainment/news social media automation system that scrapes video content from 50+ sources, generates AI captions and branded thumbnails, and posts Reels/videos to Instagram and Facebook via the Meta Graph API v19.0.

### Key Design Goals

1. Fix three critical bugs blocking reliable video posting (SSE parsing, dark IG thumbnails, no post-success navigation)
2. Separate the Composer into a dedicated `/composer` route with full auth protection
3. Build a video-first Cockpit UI with dedicated video feed, stats, and LIVE indicator
4. Expand autonomous scraping to football platforms and entertainment platforms
5. Implement robust thumbnail extraction from YouTube, TikTok, and direct MP4 sources
6. Deliver 40+ Composer UX improvements and 50+ platform-wide features

---

## Architecture

The system follows a three-tier architecture:

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 14 App (Vercel)                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ /composer    │  │ /dashboard   │  │ /api/* routes    │  │
│  │ (standalone) │  │ (main ops)   │  │ post-video       │  │
│  │              │  │              │  │ automate-video   │  │
│  └──────────────┘  └──────────────┘  │ scrape-videos    │  │
│                                      │ schedule-post    │  │
│  ┌──────────────────────────────┐    │ health           │  │
│  │ src/lib/                     │    └──────────────────┘  │
│  │  video-sources.ts (scraper)  │                          │
│  │  video-downloader.ts         │                          │
│  │  publisher.ts (Meta API)     │                          │
│  │  image-gen.ts (thumbnails)   │                          │
│  └──────────────────────────────┘                          │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────┐          ┌──────────────────────┐
│ Cloudflare      │          │ External APIs        │
│ Worker + KV +R2 │          │  Meta Graph API v19  │
│  /post-log      │          │  Gemini AI           │
│  /stage-image   │          │  NVIDIA AI           │
│  /stage-video   │          │  YouTube RSS         │
│  /seen/check    │          │  TikWM API           │
│  /schedule      │          │  RSS feeds (50+)     │
│  /blacklist     │          └──────────────────────┘
│  cron triggers  │
└─────────────────┘
```

### Data Flow: Manual Video Post (Fixed)

```
Composer UI
  → paste URL → 600ms debounce → doFetch()
    [parallel: /api/preview-url + /api/resolve-video]
  → operator edits headline/caption
  → POST /api/post-video
  → SSE stream via ReadableStream (NOT .json())
    → scrape metadata
    → extractThumbnail() [YouTube/TikTok/VideoItem.thumbnail]
    → generateImage(article, { imageUrl: thumbnailUrl })
    → stageVideo() → R2
    → stageImage() → R2 → cover_url
    → IG Reels API (media_type: REELS, cover_url: <staged>)
    → FB Videos API
    → { done: true, success: true }
  → 3s delay → reset form → navigate to Cockpit tab
```

### Data Flow: Autonomous Video Pipeline

```
Cloudflare cron (every 10 min)
  → POST /api/automate-video
  → fetchAllVideoSources() [50+ sources in parallel]
    → YouTube RSS (Kenyan channels + Citizen TV, KTN, NTV)
    → Football RSS (ESPN, Sky Sports, Goal.com, BBC Sport)
    → Entertainment RSS (TMZ, ET Online)
    → Dailymotion, Reddit, Vimeo, TikTok accounts
  → Bloom filter dedup + KV dedup
  → resolveVideoUrl() → stageVideoInR2()
  → extractThumbnail() → generateImage() → stageImage()
  → postReelToIG(cover_url) + postVideoToFB() [parallel]
  → /post-log
```

---

## Components and Interfaces

### Bug Fix 1: SSE Parser in Composer (`src/app/composer/page.tsx`)

The current bug: the Compose tab calls `response.json()` on a `text/event-stream` response, which throws a parse error. The fix replaces this with a proper SSE reader.

**Fixed SSE reading pattern:**

```typescript
const reader = resp.body.getReader();
const decoder = new TextDecoder();
let buf = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const lines = buf.split("\n");
  buf = lines.pop() ?? ""; // keep incomplete last line in buffer
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue; // skip comments, empty lines
    try {
      const evt = JSON.parse(line.slice(6));
      onProgress(evt.pct, evt.step);
      if (evt.done) {
        /* handle completion */
      }
    } catch {
      /* malformed JSON — skip */
    }
  }
}
```

Key invariants:

- Never call `.json()` on a streaming response
- Buffer across chunk boundaries — a `data:` line may be split across two `read()` calls
- Skip non-`data:` lines silently (SSE spec allows comment lines starting with `:`)

### Bug Fix 2: Cover Image for IG Reels (`src/app/api/post-video/route.ts`, `src/lib/publisher.ts`)

The current bug: `cover_url` is sometimes missing from the IG container payload because the staging step fails silently and the fallback is not always reached.

**Fixed cover image pipeline:**

```typescript
// 1. Generate branded thumbnail
const imageBuffer = await generateImage(article, { ratio: "4:5" });

// 2. Try R2 staging first
let coverImageUrl: string | undefined;
const stageRes = await fetch(WORKER_URL + "/stage-image", { ... });
if (stageRes.ok) coverImageUrl = (await stageRes.json()).url;

// 3. Fallback: upload via FB /photos endpoint
if (!coverImageUrl && fbToken && fbPageId) {
  const form = new FormData();
  form.append("source", new Blob([imageBuffer], { type: "image/jpeg" }), "cover.jpg");
  form.append("published", "false");
  form.append("access_token", fbToken);
  const r = await fetch(`${GRAPH_API}/${fbPageId}/photos`, { method: "POST", body: form });
  const d = await r.json();
  if (r.ok && !d.error) {
    const pr = await fetch(`${GRAPH_API}/${d.id}?fields=images&access_token=${fbToken}`);
    coverImageUrl = (await pr.json()).images?.[0]?.source;
  }
}

// 4. Always include cover_url if available; proceed without it if both fail
const igPayload = {
  media_type: "REELS",
  video_url: stagedVideoUrl,
  caption,
  share_to_feed: true,
  access_token: igToken,
  ...(coverImageUrl ? { cover_url: coverImageUrl } : {}),
};
```

### Bug Fix 3: Post-Success Navigation (`src/app/composer/page.tsx`)

After `{ done: true, success: true }` is received from the SSE stream:

1. Show success state for 3 seconds
2. Reset all form fields: `url`, `headline`, `caption`, `thumbUrl`, `thumbSrc`, `resolvedVideoUrl`, `platform`
3. Navigate to Cockpit tab (call `onSuccess()` which sets `activeTab = "cockpit"`)
4. Disable Post button while `status === "posting"` to prevent duplicate submissions

### New Route: `/composer` (`src/app/composer/page.tsx`)

The existing `src/app/composer/page.tsx` becomes a standalone page at `/composer`. Changes:

- Remove the `Shell` wrapper dependency for tab navigation — the page manages its own tab state
- Add `<title>Video Ops</title>` via Next.js `metadata` export (or `document.title` in a `useEffect`)
- The middleware at `src/middleware.ts` already protects `/composer` — verify the matcher includes it
- The Dashboard adds a "Video Ops →" button that uses `next/link` to `/composer`

### New Component: Video-First Cockpit Tab

The `CockpitTab` component in `src/app/composer/page.tsx` gains a dedicated "Video Feed" section:

```typescript
interface VideoPost {
  articleId: string;
  title: string;
  url: string;
  category: string;
  sourceName?: string;
  sourceType?: string;
  postType?: "video" | "article";
  thumbnail?: string;
  instagram: { success: boolean; postId?: string; error?: string };
  facebook: { success: boolean; postId?: string; error?: string };
  postedAt: string;
}
```

The video feed filters `posts.filter(p => p.postType === "video")` and renders cards with:

- 16:9 thumbnail (80px wide, `object-fit: cover`)
- Platform badge (color from `PLATFORM_COLOR`)
- Category badge
- IG ✓/✗ and FB ✓/✗ indicators
- Relative timestamp
- "Re-post" button that calls `onCompose(p.url)`

Video Stats row computes from today's video posts:

```typescript
const videoToday = posts.filter(
  (p) =>
    p.postType === "video" &&
    new Date(p.postedAt).toDateString() === new Date().toDateString(),
);
const videoStats = {
  total: videoToday.length,
  igOk: videoToday.filter((p) => p.instagram.success).length,
  fbOk: videoToday.filter((p) => p.facebook.success).length,
  fails: videoToday.filter((p) => !p.instagram.success && !p.facebook.success)
    .length,
};
```

LIVE indicator: shown when `autoPosting === true` (the autonomous loop is running).

### Expanded Video Sources (`src/lib/video-sources.ts`)

#### Football Platform Sources (New)

Four new RSS feeds added to `NEWS_RSS_FEEDS` (already partially present) with explicit football handling:

```typescript
const FOOTBALL_RSS_FEEDS = [
  { url: "https://www.espn.com/espn/rss/news", name: "ESPN", cat: "SPORTS" },
  {
    url: "https://www.skysports.com/rss/12040",
    name: "Sky Sports",
    cat: "SPORTS",
  },
  {
    url: "https://www.goal.com/feeds/en/news",
    name: "Goal.com",
    cat: "SPORTS",
  },
  {
    url: "https://feeds.bbci.co.uk/sport/rss.xml",
    name: "BBC Sport",
    cat: "SPORTS",
  },
];
```

The existing `fetchNewsRSSWithVideo()` already handles YouTube embed extraction from RSS descriptions. Football feeds use the same function — the `category: "SPORTS"` assignment is enforced at the feed definition level.

#### Entertainment Platform Sources (New)

Three new YouTube channel RSS feeds for Kenyan TV:

```typescript
// Already in YOUTUBE_CHANNELS — verify these IDs are correct:
{ id: "UCwmZiChSZyQni_AIBiYCjaA", name: "Citizen TV Kenya", cat: "NEWS" },
{ id: "UCt3bgbxSBmNNkpVZTABm_Ow", name: "KTN News Kenya",   cat: "NEWS" },
{ id: "UCXyLMXgT-jg3wQHkMSMqmcA", name: "NTV Kenya",        cat: "NEWS" },
```

TMZ and ET Online are already in `NEWS_RSS_FEEDS`. The `isEntertainmentTitle()` filter is applied to these feeds. Max 5 items per feed enforced by `.slice(0, 5)`.

### Thumbnail Extraction (`src/lib/video-sources.ts`, `src/app/api/automate-video/route.ts`)

A new `extractThumbnailUrl(video: VideoItem, resolved?: VideoResolution): string` helper:

```typescript
function extractThumbnailUrl(
  video: VideoItem,
  resolved?: VideoResolution,
): string {
  // 1. YouTube: use maxresdefault
  if (video.sourceType === "youtube") {
    const ytId =
      video.url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)?.[1] ||
      video.url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)?.[1];
    if (ytId) return `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
  }
  // 2. TikTok: use cover from TikWM response (stored in VideoItem.thumbnail)
  if (video.sourceType === "direct-mp4" && video.thumbnail)
    return video.thumbnail;
  // 3. Resolved video thumbnail (from ytdl or TikWM)
  if (resolved?.thumbnail) return resolved.thumbnail;
  // 4. VideoItem.thumbnail fallback
  if (video.thumbnail) return video.thumbnail;
  // 5. No thumbnail — generateImage() will use solid black background
  return "";
}
```

### New API Routes

#### `POST /api/scrape-videos`

Returns the current `VideoItem[]` from `fetchAllVideoSources()` as JSON. Used by the Sources tab to avoid calling the internal lib directly from the client.

```typescript
// src/app/api/scrape-videos/route.ts
export async function POST(req: NextRequest) {
  const videos = await fetchAllVideoSources();
  return NextResponse.json({ videos, count: videos.length });
}
```

#### `POST /api/schedule-post`

Stores a scheduled post in Worker KV for deferred execution.

```typescript
interface SchedulePostBody {
  url: string;
  headline: string;
  caption: string;
  category: string;
  scheduledAt: string; // ISO 8601
}
// Stores to Worker KV: schedule:{timestamp}:{id}
```

#### `GET /api/health`

Returns status of all external dependencies with response times.

```typescript
interface HealthResponse {
  status: "ok" | "degraded" | "down";
  dependencies: {
    metaGraphApi: { ok: boolean; latencyMs: number };
    geminiApi: { ok: boolean; latencyMs: number };
    nvidiaApi: { ok: boolean; latencyMs: number };
    workerKv: { ok: boolean; latencyMs: number };
    r2: { ok: boolean; latencyMs: number };
  };
}
```

### Composer UX Improvements

Key implementation details for the 40+ Composer improvements:

**Debounce fetch (10.1):** Replace `onBlur` trigger with `useEffect` watching `url` state, debounced 600ms via `useRef<ReturnType<typeof setTimeout>>`.

**Character counters (10.2, 10.3):** Render `{caption.length}/2200` and `{headline.length}/120` below each field. Color turns red when approaching limit.

**localStorage persistence (10.9):** On category change, `localStorage.setItem("composer:category", category)`. On mount, `setCategory(localStorage.getItem("composer:category") ?? "GENERAL")`.

**Bulk Post mode (10.34):** A `bulkUrls: string[]` state holds up to 5 URLs. Sequential posting with 8s delay between each via `async` loop with `await sleep(8000)`.

**Caption Templates (10.36):**

```typescript
const CAPTION_TEMPLATES = {
  "Breaking News":
    "BREAKING: {headline}\n\nDetails emerging...\n\nFollow @ppptv for updates.",
  "Celebrity Gossip": "{headline}\n\nTag someone who needs to see this! 👀",
  "Sports Update":
    "⚽ {headline}\n\nWhat do you think? Drop your thoughts below!",
  "Music Release": "🎵 {headline}\n\nStream now! Link in bio.",
  "General Entertainment":
    "{headline}\n\nShare this with someone who'd love it!",
};
```

**Scheduling (10.18):** A datetime-local input stores `scheduledAt`. On post, if `scheduledAt` is set, call `POST /api/schedule-post` instead of `POST /api/post-video`.

### Platform-Wide Features

**Telegram Notifications (11.29):** After each post (success or failure), fire a POST to `https://api.telegram.org/bot{TOKEN}/sendMessage` with the post title, platform results, and post URL. Token and chat ID stored in env vars `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.

**Pause Pipeline (11.31, 11.32):** Worker KV key `pipeline:paused`. The `triggerAutomateWithLock()` function checks this key before proceeding. Dashboard toggle calls `PUT /api/admin/social` to set/clear the flag.

**Blacklist (11.22, 11.23):** Worker KV stores blacklist as `blacklist:domain:{domain}` and `blacklist:keyword:{keyword}`. The `filterUnseen()` step in `/api/automate/route.ts` checks each article's URL domain and title against the blacklist.

**Auto-Retry (11.10):** After a failed post, the Worker schedules a retry by storing `retry:{timestamp+5min}:{articleId}` in KV. The cron tick checks for pending retries before running the main pipeline.

**Rate Limit Detection (11.13):** In `publisher.ts`, when the Meta Graph API returns error code 4 or 32, store `ratelimit:pause:{platform}` in Worker KV with a 15-minute TTL. The pipeline checks this key before attempting to post.

**Caption Length Optimizer (11.18):** In `gemini.ts`, after generating a caption, if `caption.length > 2200`, truncate at the last sentence boundary before the limit:

```typescript
function truncateCaption(caption: string, maxLen = 2200): string {
  if (caption.length <= maxLen) return caption;
  const truncated = caption.slice(0, maxLen);
  const lastPeriod = Math.max(
    truncated.lastIndexOf(". "),
    truncated.lastIndexOf(".\n"),
  );
  return lastPeriod > maxLen * 0.7
    ? truncated.slice(0, lastPeriod + 1)
    : truncated;
}
```

**Duplicate Title Detector (11.19):** Levenshtein distance check against titles posted in the last 24 hours. Stored in Worker KV as `title:fp:{fingerprint}` (already implemented). The distance threshold is 10 characters.

**Video Quality Filter (11.17):** In `stageVideoInR2()`, after downloading, check `buf.length < 500_000` (500KB). If too small, return `null` to signal the pipeline to skip this video.

**Post Frequency Control (11.47):** Worker KV key `config:min-interval-minutes` (default: 10). The `triggerAutomateWithLock()` checks the last post timestamp against this interval before proceeding.

---

## Data Models

### Extended `VideoItem` (no breaking changes)

The existing `VideoItem` interface in `src/lib/video-sources.ts` is sufficient. The `postType: "video"` field is added to the post log entry (already present in `automate-video/route.ts`).

### Post Log Entry (Worker KV)

```typescript
interface PostLogEntry {
  articleId: string;
  title: string;
  url: string;
  category: string;
  sourceName?: string;
  sourceType?: string;
  postType?: "video" | "article"; // NEW: distinguishes video vs article posts
  thumbnail?: string; // NEW: thumbnail URL for cockpit display
  instagram: { success: boolean; postId?: string; error?: string };
  facebook: { success: boolean; postId?: string; error?: string };
  postedAt: string; // ISO 8601
  manualPost?: boolean;
  isBreaking?: boolean;
}
```

### Scheduled Post (Worker KV)

```typescript
interface ScheduledPost {
  id: string;
  url: string;
  headline: string;
  caption: string;
  category: string;
  scheduledAt: string; // ISO 8601
  createdAt: string;
  status: "pending" | "executing" | "done" | "failed";
}
// KV key: schedule:{scheduledAt_timestamp}:{id}
```

### Blacklist Entry (Worker KV)

```typescript
// KV key: blacklist:domain:{domain}  → value: "1"
// KV key: blacklist:keyword:{keyword} → value: "1"
// Listed via: env.SEEN_ARTICLES.list({ prefix: "blacklist:" })
```

### Analytics Entry (Worker KV)

```typescript
interface AnalyticsEntry {
  postId: string;
  platform: "instagram" | "facebook";
  category: string;
  sourceName: string;
  postedAt: string;
  hashtags?: string[];
}
// KV key: analytics:{date}:{postId}:{platform}
```

### Feed Health Entry (Worker KV)

```typescript
interface FeedHealthEntry {
  url: string;
  name: string;
  ok: boolean;
  itemCount: number;
  latencyMs: number;
  lastItemAt?: string;
  checkedAt: string;
  error?: string;
}
// KV key: feedhealth:{url_hash}
```

---

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees._

### Property 1: SSE chunk-boundary buffering

_For any_ valid SSE payload split into arbitrary-sized byte chunks, parsing the chunks sequentially with the buffered reader should produce the same set of parsed events as parsing the complete payload at once.

**Validates: Requirements 1.1, 1.6**

### Property 2: SSE line filtering

_For any_ sequence of SSE lines where some start with `data: ` and others do not, the parser should return exactly the JSON payloads from lines starting with `data: ` and silently skip all other lines without throwing.

**Validates: Requirements 1.2, 1.3**

### Property 3: SSE error resilience

_For any_ HTTP response with a non-2xx status code or a null body, the Composer's post handler should set `status` to `"error"` and populate an error message, without throwing an uncaught exception.

**Validates: Requirements 1.5**

### Property 4: Cover image dimensions

_For any_ article passed to `generateImage()` with `ratio: "4:5"`, the returned JPEG buffer should decode to exactly 1080×1350 pixels.

**Validates: Requirements 2.5, 8.7**

### Property 5: Cover URL in IG payload

_For any_ successful R2 image staging, the IG media container creation payload should contain a `cover_url` field whose value matches the R2 public bucket URL pattern (`https://pub-*.r2.dev/*`).

**Validates: Requirements 2.1, 2.6, 8.6**

### Property 6: Cover image staging resilience

_For any_ video post where both the R2 `/stage-image` endpoint and the FB `/photos` fallback fail, the IG Reels API call should still be attempted (without `cover_url`) rather than aborting the entire post.

**Validates: Requirements 2.4**

### Property 7: Post-success form reset

_For any_ successful post completion event (`{ done: true, success: true }`), all Composer form fields (url, headline, caption, thumbUrl, resolvedVideoUrl) should be empty strings after the navigation delay.

**Validates: Requirements 3.2**

### Property 8: Post button disabled during posting

_For any_ Composer state where `status === "posting"`, the Post button should be disabled (not clickable), preventing duplicate submissions.

**Validates: Requirements 3.4**

### Property 9: Video feed filtering

_For any_ set of post log entries containing a mix of `postType: "video"` and `postType: "article"` entries, the Cockpit Video Feed section should display only entries where `postType === "video"`.

**Validates: Requirements 5.1**

### Property 10: Video stats computation

_For any_ set of video post log entries for today, the Video Stats row should correctly compute: total count, IG success count, FB success count, and failure count (where failure = both IG and FB failed).

**Validates: Requirements 5.3**

### Property 11: Source category assignment

_For any_ video item scraped from a football RSS source (ESPN, Sky Sports, Goal.com, BBC Sport), the resulting `VideoItem.category` should be `"SPORTS"`. For any item from TMZ or ET Online, the category should be `"CELEBRITY"`. For any item from Citizen TV, KTN, or NTV YouTube channels, the category should be `"NEWS"`.

**Validates: Requirements 6.4, 7.4**

### Property 12: Football RSS resilience

_For any_ set of football RSS feeds where one or more return non-2xx status or time out, `fetchAllVideoSources()` should still return items from the remaining healthy feeds without throwing.

**Validates: Requirements 6.7**

### Property 13: YouTube thumbnail URL construction

_For any_ `VideoItem` with `sourceType: "youtube"` and a valid YouTube video ID in its `url`, `extractThumbnailUrl()` should return `https://img.youtube.com/vi/{videoId}/maxresdefault.jpg`.

**Validates: Requirements 7.5, 8.1**

### Property 14: Entertainment feed item cap

_For any_ entertainment RSS feed (TMZ, ET Online), the number of `VideoItem`s returned per scrape run should be at most 5.

**Validates: Requirements 7.7**

### Property 15: Bloom filter dedup

_For any_ `VideoItem` whose `id` has already been added to the Bloom filter, `fetchAllVideoSources()` should not include that item in its output.

**Validates: Requirements 6.6**

### Property 16: Debounce timing

_For any_ URL input change, `doFetch()` should not be called until at least 600ms have elapsed since the last change, and should be called exactly once after the debounce period expires.

**Validates: Requirements 10.1**

### Property 17: Character counter accuracy

_For any_ string value in the caption or headline field, the displayed character counter should equal `string.length`.

**Validates: Requirements 10.2, 10.3**

### Property 18: Category localStorage round trip

_For any_ category selection, storing it to `localStorage` and then reading it back on a fresh page load should restore the same category value.

**Validates: Requirements 10.9**

### Property 19: Caption length truncation

_For any_ AI-generated caption longer than 2200 characters, `truncateCaption()` should return a string of length ≤ 2200 that ends at a sentence boundary (period followed by space or newline).

**Validates: Requirements 11.18**

### Property 20: Duplicate title detection

_For any_ two video titles with a Levenshtein distance less than 10, where one was posted within the last 24 hours, the pipeline should skip the second video rather than posting it.

**Validates: Requirements 11.19**

### Property 21: Video size filter

_For any_ downloaded video buffer smaller than 500,000 bytes, `stageVideoInR2()` should return `null`, causing the pipeline to skip that video.

**Validates: Requirements 11.17**

### Property 22: Blacklist filtering

_For any_ article or video whose source domain or title keyword matches an entry in the blacklist, the pipeline's filter step should exclude it from the posting queue.

**Validates: Requirements 11.23**

---

## Error Handling

### SSE Stream Errors

- If `response.body` is null: set `status = "error"`, display "Connection failed — no response body"
- If `response.status >= 400`: set `status = "error"`, display `"Server error: HTTP ${response.status}"`
- If JSON parse fails on a `data:` line: log warning, skip the line, continue reading
- If the stream ends without a `{ done: true }` event: set `status = "error"`, display "Stream ended unexpectedly"

### Video Pipeline Errors

- **Video resolve failure**: log warning, try next candidate from `allVideos`
- **Video download failure**: retry once with fresh URL resolution; if still fails, skip and log
- **R2 staging failure**: return `null` from `stageVideoInR2()`, pipeline skips this video
- **Cover image staging failure**: proceed without `cover_url` (graceful degradation)
- **IG API error**: log full error JSON, emit SSE event with error message, continue to FB
- **FB API error**: log full error JSON, emit SSE event with error message
- **Rate limit (error code 4 or 32)**: store `ratelimit:pause:{platform}` in KV for 15 minutes, skip platform for that duration
- **RSS feed timeout (>10s)**: log warning, return empty array for that feed, continue with others

### Authentication Errors

- Unauthenticated requests to `/composer` or `/dashboard`: middleware redirects to `/login`
- Missing social credentials (IG/FB tokens): return `{ success: false, error: "credentials not configured" }` without crashing

### Worker KV Errors

- KV read failures: treat as "not found" (safe default — may cause duplicate posts in rare cases)
- KV write failures: log warning, continue (post log entry may be lost but post still succeeds)

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required. Unit tests verify specific examples and integration points; property tests verify universal correctness across all inputs.

### Property-Based Testing

**Library:** `fast-check` (TypeScript-native, works with Jest/Vitest)

**Configuration:** Minimum 100 runs per property test (`{ numRuns: 100 }`).

**Tag format:** Each property test must include a comment:
`// Feature: video-cockpit-overhaul, Property {N}: {property_text}`

**Property test file:** `src/lib/__tests__/video-cockpit-overhaul.property.test.ts`

Each correctness property maps to exactly one property-based test:

| Property | Test description                    | Arbitraries                                                                          |
| -------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| P1       | SSE chunk-boundary buffering        | `fc.array(fc.uint8Array())` — split valid SSE payload at random positions            |
| P2       | SSE line filtering                  | `fc.array(fc.string())` — mix of `data:` and non-`data:` lines                       |
| P3       | SSE error resilience                | `fc.integer({ min: 400, max: 599 })` — HTTP error codes                              |
| P4       | Cover image dimensions              | `fc.record({ title: fc.string(), category: fc.constantFrom(...CATS) })`              |
| P5       | Cover URL in IG payload             | `fc.string()` — staged image URLs                                                    |
| P6       | Cover image staging resilience      | `fc.boolean()` — both staging methods fail                                           |
| P7       | Post-success form reset             | `fc.record({ url, headline, caption, ... })` — any form state                        |
| P8       | Post button disabled during posting | `fc.constantFrom("posting", "resolving")` — active statuses                          |
| P9       | Video feed filtering                | `fc.array(fc.record({ postType: fc.constantFrom("video", "article") }))`             |
| P10      | Video stats computation             | `fc.array(videoPostArb)` — random video post arrays                                  |
| P11      | Source category assignment          | `fc.constantFrom(...FOOTBALL_FEEDS, ...ENTERTAINMENT_FEEDS)`                         |
| P12      | Football RSS resilience             | `fc.subarray(FOOTBALL_FEEDS)` — random subset fails                                  |
| P13      | YouTube thumbnail URL               | `fc.string({ minLength: 11, maxLength: 11 })` — YouTube video IDs                    |
| P14      | Entertainment feed item cap         | `fc.array(rssItemArb, { minLength: 6, maxLength: 20 })`                              |
| P15      | Bloom filter dedup                  | `fc.array(fc.string())` — video IDs, some repeated                                   |
| P16      | Debounce timing                     | `fc.integer({ min: 0, max: 1200 })` — milliseconds since last change                 |
| P17      | Character counter accuracy          | `fc.string()` — any string                                                           |
| P18      | Category localStorage round trip    | `fc.constantFrom(...CATS)` — any category                                            |
| P19      | Caption length truncation           | `fc.string({ minLength: 2201, maxLength: 5000 })` — long captions                    |
| P20      | Duplicate title detection           | `fc.tuple(fc.string(), fc.integer({ min: 0, max: 15 }))` — title pairs with distance |
| P21      | Video size filter                   | `fc.integer({ min: 0, max: 499999 })` — small buffer sizes                           |
| P22      | Blacklist filtering                 | `fc.array(fc.string())` — domains/keywords, some blacklisted                         |

### Unit Tests

**File:** `src/lib/__tests__/video-cockpit-overhaul.unit.test.ts`

Focus areas:

- SSE parser: specific examples (empty stream, single event, multi-event, split across chunks)
- `extractThumbnailUrl()`: YouTube ID extraction, TikTok cover, fallback chain
- `truncateCaption()`: exactly 2200 chars, 2201 chars, no sentence boundary
- Cover image fallback: R2 fails → FB photos → no cover
- Post-success navigation: success event triggers tab change after 3s
- Auth protection: unauthenticated request to `/composer` redirects to `/login`
- Feed health: one feed fails, others succeed
- Blacklist: domain match, keyword match, no match

### Integration Tests

Manual verification checklist (not automated):

- End-to-end video post from Composer to IG + FB with real credentials
- Autonomous pipeline run with football RSS feeds
- Scheduled post execution via Worker cron
- Telegram notification delivery
- Dark mode toggle persistence across page reloads
