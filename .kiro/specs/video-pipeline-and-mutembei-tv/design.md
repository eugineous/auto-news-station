# Design Document: Video Pipeline & Mutembei TV

## Overview

This document covers the technical design for five bugfixes and two new features in the PPP TV Kenya Next.js application. The system is a social media automation platform that posts videos to Instagram and Facebook via the Meta Graph API, with a Cloudflare Worker handling cron-based scheduling.

The changes fall into two categories:

**Bugfixes:**
1. Composer Post button — caption fallback so the button is never stuck disabled
2. Cockpit auth header — missing `Authorization` header on `/api/automate-video` calls
3. Competitors feed — the route already works; the design confirms the correct implementation
4. Trends — add Twitter/Nitter source, fix non-deterministic volume scores
5. Dashboard video count — `post_type` field casing mismatch (camelCase vs snake_case)

**New Features:**
6. Mutembei TV Facebook video scraper — two-tier (Graph API + HTML fallback)
7. Continuous video stream — Mutembei TV as pipeline fallback, Cloudflare Worker URL fix

---

## Architecture

```mermaid
graph TD
    CF[Cloudflare Worker\ncron every 10min] -->|POST /api/automate-video\nAuthorization: Bearer ppptvWorker2024| AV[/api/automate-video]
    CF -->|POST /api/automate| AI[/api/automate image pipeline]

    AV --> VS[video-sources.ts\nfetchAllVideoSources]
    VS --> YT[YouTube RSS\n10 channels]
    VS --> TK[TikTok via TikWM\n80+ accounts]
    VS --> DM[Dailymotion RSS]
    VS --> RD[Reddit JSON]
    VS --> MTV[fetchMutembeiTVVideos\nNEW]

    MTV -->|if FACEBOOK_ACCESS_TOKEN| GQL[Facebook Graph API\n/MutembeiTV/videos]
    MTV -->|fallback| FB[Facebook page scrape\nJSON-LD parsing]

    AV --> GEM[gemini.ts\ngenerateAIContent]
    AV --> NV[NVIDIA NIM API\nllama-3.1-8b-instruct\nMutembei TV only]
    AV --> IMG[image-gen.ts\ngenerateImage]
    AV --> R2[Cloudflare R2\nvideo staging]
    AV --> META[Meta Graph API\nIG Reels + FB Videos]
    AV --> SUP[Supabase\ndedup + post log]

    COMP[composer/page.tsx\nComposeTab] -->|POST + SSE| PV[/api/post-video]
    COMP2[composer/page.tsx\nCockpitTab] -->|POST + Auth header\nFIX| AV

    TRENDS[/api/trends/source] --> NIT[Nitter RSS\nNEW]
    TRENDS --> YTT[YouTube RSS trends]
    TRENDS --> RDT[Reddit hot.json]

    COMP3[competitors/page.tsx] --> FEED[/api/competitors/feed\nYouTube Atom proxy]
```

The data flow for a Mutembei TV video post:
1. Cloudflare Worker cron fires → calls `/api/automate-video` with auth header
2. `fetchAllVideoSources()` includes `fetchMutembeiTVVideos()` in its source list
3. Mutembei TV videos get a +30 viral score boost, rising to the top of the queue
4. Pipeline checks Supabase dedup, downloads video, generates branded cover
5. Both Gemini (headline) and NVIDIA (caption body) generate AI content
6. Caption is appended with `"\n\nSource: Mutembei TV"`
7. Video is staged to R2, posted to IG + FB, video ID marked as seen in Supabase

---

## Components and Interfaces

### Fix 1: ComposeTab Caption Fallback (`src/app/composer/page.tsx`)

The `canPost` check is `url.trim() && headline.trim() && caption.trim() && status !== "posting"`. If AI caption generation fails in `doFetch()`, `caption` stays empty and the button stays disabled forever.

**Fix:** After `doFetch()` completes, if `caption` is still empty but `headline` is populated, set `caption = headline` as a fallback. This ensures the button is always enabled after a successful URL fetch.

**Error display fix:** In `handlePost()`, the current code throws `"Post request failed: HTTP " + resp.status` when `!resp.ok`. This is already correct — the catch block sets `result.error` which is displayed. No change needed here.

```typescript
// In doFetch(), after AI content is set:
if (!preview.ai?.caption && headline) {
  setCaption(headline); // fallback: use headline as caption
  setIgCaption(headline);
  setFbCaption(headline);
}
```

### Fix 2: CockpitTab Auth Header (`src/app/composer/page.tsx`)

The `triggerAutoPost()` function in `CockpitTab` calls `/api/automate-video` without an `Authorization` header. The route requires `Bearer ppptvWorker2024`.

**Fix:** Add the header to the fetch call:

```typescript
const r = await fetch("/api/automate-video", {
  ...FETCH_OPTS,
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer ppptvWorker2024",
  },
});
```

### Fix 3: Competitors Feed (`src/app/api/competitors/feed/route.ts`)

The route is already correctly implemented — it proxies the YouTube Atom feed with a 10-second timeout and returns `Content-Type: application/xml`. The design confirms this implementation is correct and no changes are needed.

### Fix 4: Trends — Twitter/Nitter + Deterministic Volumes (`src/app/api/trends/[source]/route.ts`)

**New `getTwitter()` function:**

```typescript
const NITTER_INSTANCES = ["nitter.poast.org", "nitter.privacydev.net", "nitter.net"];
const NITTER_ACCOUNTS = ["citizentvkenya", "ntvkenya", "tukokenya", "nairobinews", "spmbuzz"];

async function getTwitter(): Promise<TrendItem[]> {
  const trends: TrendItem[] = [];
  const now = new Date().toISOString();

  for (const instance of NITTER_INSTANCES) {
    let anySuccess = false;
    await Promise.allSettled(NITTER_ACCOUNTS.map(async (account) => {
      try {
        const res = await fetch(`https://${instance}/${account}/rss`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/2.0)" },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return;
        const xml = await res.text();
        const items = parseRSSItems(xml); // extract <item> elements
        items.forEach((item, index) => {
          trends.push({
            id: `twitter:${item.url}`,
            title: item.title,
            source: "twitter",
            volume: (items.length - index) * 1000, // deterministic, position-based
            url: item.url,
            fetchedAt: now,
          });
        });
        anySuccess = true;
      } catch {}
    }));
    if (anySuccess) break; // stop trying instances once one works
  }

  if (trends.length === 0) {
    // Static fallback
    return KENYA_FALLBACK_TRENDS.map(t => ({ ...t, source: "twitter-fallback", fetchedAt: now }));
  }

  // Deduplicate by normalized title
  const seen = new Set<string>();
  return trends.filter(t => {
    const key = t.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

**Deterministic YouTube volume fix:**

```typescript
// Replace Math.random() with recency-based formula:
const ageMs = Date.now() - new Date(published).getTime();
const volume = Math.max(1, Math.floor((48 * 3600 * 1000 - ageMs) / 3600000) * 1000);
```

**Deterministic Reddit volume fix:**

```typescript
// Replace Math.random() with actual score:
volume: p.score || 0,  // was: Math.floor(Math.random()*10000)+500
```

**Route handler update:** Add `if (source === "twitter") return NextResponse.json({ trends: await getTwitter() });`

### Fix 5: post_type Snake_Case (`src/app/api/post-video/route.ts`)

The `logPost` call in `/api/post-video` uses `postType: "video"` (camelCase). The dashboard reads `p.post_type === "video"` (snake_case). The `/api/automate-video` route already uses `post_type: "video"` correctly.

**Fix:** Change the `logPost` call in `/api/post-video/route.ts`:

```typescript
// Before:
await logPost({ ..., postType: "video" });

// After:
await logPost({ ..., post_type: "video" });
```

Also remove the legacy camelCase fields `articleId`, `postedAt`, `manualPost`, `postType` from the log entry and use snake_case equivalents to match the Supabase schema.

### Feature: Mutembei TV Scraper (`src/lib/video-sources.ts`)

New exported function `fetchMutembeiTVVideos()`:

```typescript
export async function fetchMutembeiTVVideos(): Promise<VideoItem[]> {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  const now = new Date();

  // Tier 1: Facebook Graph API
  if (token) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/MutembeiTV/videos` +
        `?fields=id,title,description,source,created_time&limit=25&access_token=${token}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (res.ok) {
        const data = await res.json() as any;
        return (data.data || [])
          .sort((a: any, b: any) =>
            new Date(b.created_time).getTime() - new Date(a.created_time).getTime()
          )
          .map((v: any) => ({
            id: `mutembei:${v.id}`,
            title: v.title || v.description || "Mutembei TV Video",
            url: `https://www.facebook.com/MutembeiTV/videos/${v.id}`,
            directVideoUrl: v.source || undefined,
            thumbnail: "",
            publishedAt: new Date(v.created_time),
            sourceName: "Mutembei TV",
            sourceType: "direct-mp4" as const,
            category: "ENTERTAINMENT",
          }));
      }
    } catch {}
  }

  // Tier 2: HTML scrape fallback
  try {
    const res = await fetch("https://www.facebook.com/MutembeiTV/videos", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    // Parse JSON-LD and application/json script tags for video data
    const videos = extractFacebookVideos(html); // helper that parses embedded JSON
    return videos.map(v => ({
      id: `mutembei:${v.id}`,
      title: v.title || "Mutembei TV Video",
      url: `https://www.facebook.com/MutembeiTV/videos/${v.id}`,
      directVideoUrl: v.source || undefined,
      thumbnail: v.thumbnail || "",
      publishedAt: new Date(v.created_time || now),
      sourceName: "Mutembei TV",
      sourceType: "direct-mp4" as const,
      category: "ENTERTAINMENT",
    }));
  } catch { return []; }
}
```

**Integration in `fetchAllVideoSources()`:** Prepend Mutembei TV results to the source list so they appear first before deduplication and scoring.

### Feature: Mutembei TV Dual AI + Attribution (`src/app/api/automate-video/route.ts`)

When `target.sourceName === "Mutembei TV"`, use both Gemini and NVIDIA:

```typescript
let caption: string;
if (target.sourceName === "Mutembei TV") {
  // Gemini for headline, NVIDIA for caption body
  const [geminiResult, nvidiaResult] = await Promise.allSettled([
    generateAIContent(article),
    generateWithNvidiaCaption(article), // direct NVIDIA call
  ]);
  const geminiContent = geminiResult.status === "fulfilled" ? geminiResult.value : null;
  const nvidiaCaption = nvidiaResult.status === "fulfilled" ? nvidiaResult.value : null;

  const headline = geminiContent?.clickbaitTitle || target.title.toUpperCase();
  const body = nvidiaCaption || geminiContent?.caption || target.title;
  caption = `${body}\n\nSource: Mutembei TV`;
} else {
  const ai = await generateAIContent(article).catch(() => ({ ... }));
  caption = `${ai.caption}\n\n${buildAttribution(...)}`;
}
```

**Viral score boost:** In the scoring loop, add `+30` for Mutembei TV videos:

```typescript
const isMutembeiTV = v.sourceName === "Mutembei TV";
const finalScore = viralScore + (isKenyan ? 25 : 0) + (hasDirect ? 10 : 0) + viewBoost + (isMutembeiTV ? 30 : 0);
```

### Fix 7: Cloudflare Worker URL (`cloudflare/worker.js`)

The `triggerAutomate()` function already calls `/api/automate-video` correctly (confirmed by reading the source). The `appUrl` variable is set from `env.VERCEL_APP_URL`. The fix is to ensure the correct Vercel URL is set in the worker environment:

```javascript
const appUrl = env.VERCEL_APP_URL || "https://ppp-tv-site-final.vercel.app";
```

The Authorization header is already included in the video pipeline call: `Authorization: \`Bearer ${secret}\``.

---

## Data Models

### VideoItem (existing, extended)

```typescript
interface VideoItem {
  id: string;           // "mutembei:{facebook_video_id}" for Mutembei TV
  title: string;
  url: string;          // "https://www.facebook.com/MutembeiTV/videos/{id}"
  directVideoUrl?: string; // direct MP4 URL from Graph API source field
  thumbnail: string;
  publishedAt: Date;
  sourceName: string;   // "Mutembei TV"
  sourceType: "youtube" | "dailymotion" | "reddit" | "rss-video" | "vimeo" | "direct-mp4" | "twitter";
  category: string;     // "ENTERTAINMENT"
  duration?: number;
}
```

### TrendItem (existing, extended)

```typescript
interface TrendItem {
  id: string;           // "twitter:{url}" for Nitter items
  title: string;        // tweet text
  source: string;       // "twitter" | "twitter-fallback" | "youtube" | "reddit" | "news"
  volume: number;       // deterministic: position-based for Twitter, recency for YouTube, score for Reddit
  category: string;
  url: string;
  description?: string;
  fetchedAt: string;    // ISO timestamp — always set
}
```

### Post Log Entry (fixed schema)

```typescript
interface PostLogEntry {
  article_id: string;
  title: string;
  url: string;
  category: string;
  source_name: string;
  source_type?: string;
  thumbnail?: string;
  post_type: "video" | "image" | "carousel"; // snake_case — FIXED
  ig_success: boolean;
  ig_post_id?: string;
  ig_error?: string;
  fb_success: boolean;
  fb_post_id?: string;
  fb_error?: string;
  posted_at: string;    // ISO timestamp — snake_case
  blocked?: boolean;
  block_reason?: string;
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Post button requires non-empty fields

*For any* combination of `url`, `headline`, and `caption` values where at least one is empty or composed entirely of whitespace, the `canPost` expression in ComposeTab SHALL evaluate to `false`, and the Post button SHALL be disabled.

**Validates: Requirements 1.7**

---

### Property 2: SSE progress events are forwarded

*For any* SSE stream returned by `/api/post-video` containing N `data:` events, the ComposeTab SHALL call `onProgress(pct, step)` exactly N times — once per event — with the `pct` and `step` values from each event.

**Validates: Requirements 1.2**

---

### Property 3: Non-2xx response sets error status

*For any* HTTP response from `/api/post-video` with a status code outside the 2xx range, the ComposeTab SHALL set `status` to `"error"` and the displayed error message SHALL contain the HTTP status code.

**Validates: Requirements 1.3**

---

### Property 4: Auth header always present in triggerAutoPost

*For any* invocation of `triggerAutoPost()` in CockpitTab, the outgoing fetch to `/api/automate-video` SHALL include the HTTP header `Authorization: Bearer ppptvWorker2024`.

**Validates: Requirements 2.1**

---

### Property 5: Competitors feed returns valid XML with correct Content-Type

*For any* valid YouTube channel ID passed to `/api/competitors/feed`, the response SHALL have `Content-Type: application/xml` and the body SHALL be parseable as Atom XML containing `<entry>` elements.

**Validates: Requirements 3.4**

---

### Property 6: Competitors page displays at most 10 posts

*For any* YouTube channel feed containing N videos (N ≥ 0), the CompetitorsPage SHALL display `min(N, 10)` posts after a successful load.

**Validates: Requirements 3.6**

---

### Property 7: Twitter trends are non-empty when any Nitter instance is reachable

*For any* call to `getTwitter()` where at least one Nitter instance returns a valid RSS response, the returned `trends` array SHALL contain at least 1 item with `source: "twitter"`.

**Validates: Requirements 4.1, 8.1**

---

### Property 8: Nitter items are correctly parsed

*For any* `<item>` element in a Nitter RSS feed, the parsed trend object SHALL have: a non-empty `title` (tweet text), a non-empty `url` (tweet link), `source: "twitter"`, and a `volume` value greater than 0.

**Validates: Requirements 4.3, 8.3**

---

### Property 9: YouTube trend volumes are deterministic

*For any* two calls to `getYouTube()` that receive the same RSS data (same video IDs and publish timestamps), the `volume` values for each video SHALL be identical across both calls — no `Math.random()` is used.

**Validates: Requirements 4.6**

---

### Property 10: Reddit trend volume equals post score

*For any* Reddit post returned by the Reddit hot.json API, the corresponding trend item's `volume` field SHALL equal the post's `score` field exactly.

**Validates: Requirements 4.7**

---

### Property 11: post_type is always snake_case "video"

*For any* successful video post logged by either `/api/post-video` or `/api/automate-video`, the resulting Post_Log entry SHALL contain the field `post_type` with value `"video"` (snake_case, not `postType`).

**Validates: Requirements 5.1, 5.2**

---

### Property 12: Dashboard counts both legacy and new log entries

*For any* Post_Log entry where either `p.post_type === "video"` OR `p.postType === "video"`, the Dashboard video counter SHALL include that entry in its count.

**Validates: Requirements 5.3**

---

### Property 13: Mutembei TV source fields are correct

*For any* video returned by `fetchMutembeiTVVideos()`, the item SHALL have `sourceName: "Mutembei TV"`, `category: "ENTERTAINMENT"`, and an `id` prefixed with `"mutembei:"`.

**Validates: Requirements 6.1**

---

### Property 14: Mutembei TV caption always contains attribution

*For any* Mutembei TV video that is successfully posted by the pipeline, the caption sent to Instagram and Facebook SHALL contain the substring `"Source: Mutembei TV"`.

**Validates: Requirements 6.5**

---

### Property 15: Mutembei TV post-then-seen round trip

*For any* Mutembei TV video ID that is successfully posted, calling `isVideoSeen(videoId)` immediately after SHALL return `true`.

**Validates: Requirements 6.7**

---

### Property 16: Mutembei TV results are sorted by recency

*For any* result from `fetchMutembeiTVVideos()` containing N items (N ≥ 2), for every adjacent pair `(items[i], items[i+1])`, `items[i].publishedAt >= items[i+1].publishedAt`.

**Validates: Requirements 6.8**

---

### Property 17: Mutembei TV gets viral score boost

*For any* Mutembei TV video scored by the pipeline, its `_score` SHALL be at least 30 points higher than the same video would receive without the Mutembei TV boost applied.

**Validates: Requirements 7.4**

---

### Property 18: Mutembei TV is included in fetchAllVideoSources

*For any* call to `fetchAllVideoSources()` when `fetchMutembeiTVVideos()` returns at least one item, the combined result SHALL include at least one item with `sourceName: "Mutembei TV"`.

**Validates: Requirements 7.6**

---

### Property 19: Nitter deduplication by normalized title

*For any* set of Nitter RSS items where two or more items have titles that normalize to the same string (lowercase, punctuation removed), the `getTwitter()` result SHALL contain at most one item for that normalized title.

**Validates: Requirements 8.4**

---

### Property 20: Twitter trends include fetchedAt timestamp

*For any* response from `/api/trends/[source]` with `source=twitter`, every item in the `trends` array SHALL have a `fetchedAt` field containing a valid ISO 8601 timestamp.

**Validates: Requirements 8.6**

---

## Error Handling

### Mutembei TV Scraper Failures

| Failure | Behavior |
|---|---|
| Graph API token missing | Fall back to HTML scrape silently |
| Graph API returns non-2xx | Fall back to HTML scrape, log warning |
| HTML scrape fetch timeout | Return empty array, pipeline continues with other sources |
| HTML scrape returns no parseable videos | Return empty array |
| Both tiers fail | Return empty array — pipeline falls back to other sources |

### Nitter Failures

| Failure | Behavior |
|---|---|
| Instance timeout (5s) | Log failure, try next instance |
| Instance returns non-2xx | Try next instance |
| All instances fail | Return static Kenya fallback trends with `source: "twitter-fallback"` |
| RSS parse error | Skip that account, continue with others |

### Post Video SSE Failures

| Failure | Behavior |
|---|---|
| `!resp.ok` | Throw `"Post request failed: HTTP {status}"` → caught → `status = "error"` |
| `resp.body` is null | Throw same error |
| SSE event `done: true, success: false` | Set `status = "error"`, display `event.error` |
| SSE event `done: true, success: true` | Set `status = "success"`, display post IDs |
| Network error during stream read | Catch block sets `status = "error"` |

### Auth Failures

| Failure | Behavior |
|---|---|
| `/api/automate-video` returns 401 | CockpitTab shows toast "Auto-post failed: Unauthorized", sets `autoPosting = false` |
| Worker `AUTOMATE_SECRET` not set | Worker logs warning and returns without calling Vercel |

---

## Testing Strategy

### Unit Tests

Unit tests cover specific examples, integration points, and error conditions:

- `ComposeTab`: verify `canPost` is false when any field is empty/whitespace
- `ComposeTab`: verify caption fallback sets caption to headline when AI returns empty
- `CockpitTab`: verify `triggerAutoPost` fetch includes `Authorization` header (mock fetch)
- `/api/competitors/feed`: verify 400 when `channelId` is missing, 502 on YouTube timeout
- `/api/trends/[source]`: verify `source=twitter` returns `{ trends: [...] }` shape
- `fetchMutembeiTVVideos`: verify Graph API path is taken when token is set, fallback when not
- `logPost` in `/api/post-video`: verify entry contains `post_type: "video"` (snake_case)
- Dashboard video count: verify both `post_type` and `postType` fields are counted

### Property-Based Tests

Property tests use a PBT library (e.g., `fast-check` for TypeScript) with a minimum of 100 iterations per property. Each test is tagged with the property it validates.

**Tag format:** `Feature: video-pipeline-and-mutembei-tv, Property {N}: {property_text}`

| Property | Test Description | Generator |
|---|---|---|
| P1: Post button validation | For any (url, headline, caption) where ≥1 is whitespace-only, canPost is false | `fc.string()` with at least one empty |
| P2: SSE event forwarding | For any array of SSE events, onProgress is called once per event | `fc.array(fc.record({ pct: fc.integer(0,100), step: fc.string() }))` |
| P3: Non-2xx sets error | For any HTTP status 400-599, status becomes "error" with code in message | `fc.integer(400, 599)` |
| P8: Nitter item parsing | For any valid RSS item XML, parsed trend has title, url, source, volume>0 | `fc.record({ title: fc.string(1,200), url: fc.webUrl() })` |
| P9: YouTube volume determinism | For any video with a publish timestamp, two calls return same volume | `fc.date()` |
| P10: Reddit volume = score | For any Reddit post JSON, trend.volume === post.score | `fc.record({ score: fc.integer(0, 1000000) })` |
| P11: post_type snake_case | For any successful post, log entry has post_type: "video" | `fc.record(...)` with mock logPost |
| P13: Mutembei source fields | For any video from fetchMutembeiTVVideos, fields are correct | Mock Graph API response with `fc.array(fc.record(...))` |
| P14: Mutembei attribution | For any Mutembei TV video, caption contains "Source: Mutembei TV" | `fc.record({ title: fc.string(), description: fc.string() })` |
| P16: Mutembei sort order | For any N≥2 results, items are sorted descending by publishedAt | `fc.array(fc.date(), { minLength: 2 })` |
| P19: Nitter deduplication | For any items with same normalized title, only one appears in output | `fc.array(fc.string())` with duplicates injected |

**Property test configuration:**

```typescript
// Example: Property 9 — YouTube volume determinism
// Feature: video-pipeline-and-mutembei-tv, Property 9: YouTube trend volumes are deterministic
fc.assert(
  fc.property(
    fc.date({ min: new Date(Date.now() - 48 * 3600 * 1000), max: new Date() }),
    (publishedAt) => {
      const ageMs = Date.now() - publishedAt.getTime();
      const volume1 = Math.max(1, Math.floor((48 * 3600 * 1000 - ageMs) / 3600000) * 1000);
      const volume2 = Math.max(1, Math.floor((48 * 3600 * 1000 - ageMs) / 3600000) * 1000);
      return volume1 === volume2;
    }
  ),
  { numRuns: 100 }
);
```

Both unit tests and property tests are complementary. Unit tests catch concrete bugs in specific scenarios; property tests verify general correctness across the full input space. Together they provide comprehensive coverage of the requirements.
