# Implementation Plan: Video Cockpit Overhaul

## Overview

Incremental implementation starting with the three critical bug fixes, then new API routes, expanded video sources, Composer UX improvements, and platform-wide features. Each task builds on the previous and ends with all code wired together.

## Tasks

- [x] 1. Fix SSE parsing bug in Composer (`src/app/composer/page.tsx`)
  - Replace `response.json()` call with `response.body.getReader()` + `TextDecoder` buffered SSE reader in `handlePost()`
  - Buffer incomplete lines across `reader.read()` chunks; only parse lines starting with `data: `
  - Skip non-`data:` lines silently; catch JSON parse errors per-line without throwing
  - On `{ done: true, success: true }`: show success for 3s, reset all form fields (url, headline, caption, thumbUrl, thumbSrc, resolvedVideoUrl, platform), then call `onSuccess()` to switch to Cockpit tab
  - On `{ done: true, success: false }`: remain on Compose tab, display error details
  - Disable Post button while `status === "posting"` or `status === "resolving"`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.1, 3.2, 3.3, 3.4_

  - [ ]\* 1.1 Write property test for SSE chunk-boundary buffering
    - **Property 1: SSE chunk-boundary buffering**
    - **Validates: Requirements 1.1, 1.6**
    - Use `fc.array(fc.uint8Array())` to split a valid SSE payload at random positions; assert parsed events match full-payload parse

  - [ ]\* 1.2 Write property test for SSE line filtering
    - **Property 2: SSE line filtering**
    - **Validates: Requirements 1.2, 1.3**
    - Use `fc.array(fc.string())` mixing `data:` and non-`data:` lines; assert only `data:` lines produce parsed events

  - [ ]\* 1.3 Write property test for SSE error resilience
    - **Property 3: SSE error resilience**
    - **Validates: Requirements 1.5**
    - Use `fc.integer({ min: 400, max: 599 })` for HTTP error codes; assert `status` becomes `"error"` without uncaught exceptions

  - [ ]\* 1.4 Write property test for post button disabled during posting
    - **Property 8: Post button disabled during posting**
    - **Validates: Requirements 3.4**
    - Use `fc.constantFrom("posting", "resolving")`; assert Post button is disabled for these statuses

  - [ ]\* 1.5 Write property test for post-success form reset
    - **Property 7: Post-success form reset**
    - **Validates: Requirements 3.2**
    - Use `fc.record({ url, headline, caption, ... })` for any form state; assert all fields are empty strings after success event + navigation delay

- [x] 2. Fix dark IG video thumbnails — cover image pipeline (`src/app/api/post-video/route.ts`, `src/lib/publisher.ts`)
  - In `post-video/route.ts`: after `stageVideo()`, call `generateImage(article, { ratio: "4:5" })` to produce a 1080×1350 JPEG buffer
  - Attempt R2 staging via `WORKER_URL + "/stage-image"`; on success set `coverImageUrl`
  - Fallback: upload via `${GRAPH_API}/${fbPageId}/photos` with `published: false`; fetch returned image's `images[0].source` as `coverImageUrl`
  - If both fail, proceed without `cover_url` (do not abort the post)
  - Spread `...(coverImageUrl ? { cover_url: coverImageUrl } : {})` into the IG container payload
  - Apply same fix in `src/lib/publisher.ts` `publishToInstagramVideo()` — ensure `cover_url` is always included when staging succeeds
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]\* 2.1 Write property test for cover image dimensions
    - **Property 4: Cover image dimensions**
    - **Validates: Requirements 2.5, 8.7**
    - Use `fc.record({ title: fc.string(), category: fc.constantFrom(...CATS) })`; assert returned JPEG decodes to exactly 1080×1350 px

  - [ ]\* 2.2 Write property test for cover URL in IG payload
    - **Property 5: Cover URL in IG payload**
    - **Validates: Requirements 2.1, 2.6, 8.6**
    - Use `fc.string()` for staged image URLs; assert IG container payload contains `cover_url` matching R2 public URL pattern

  - [ ]\* 2.3 Write property test for cover image staging resilience
    - **Property 6: Cover image staging resilience**
    - **Validates: Requirements 2.4**
    - Use `fc.boolean()` for both staging methods failing; assert IG Reels API is still called without `cover_url`

- [ ] 3. Checkpoint — Ensure bug fixes pass all tests, ask the user if questions arise.

- [x] 4. Add `extractThumbnailUrl()` helper and expand video sources (`src/lib/video-sources.ts`)
  - Add `extractThumbnailUrl(video: VideoItem, resolved?: { thumbnail?: string }): string` function:
    - YouTube: extract video ID from `url`, return `https://img.youtube.com/vi/{id}/maxresdefault.jpg`
    - TikTok (`sourceType === "direct-mp4"`): return `video.thumbnail` if non-empty
    - Fallback chain: `resolved?.thumbnail` → `video.thumbnail` → `""`
  - Add `FOOTBALL_RSS_FEEDS` array (ESPN, Sky Sports, Goal.com, BBC Sport) with `cat: "SPORTS"`
  - Wire football feeds into `fetchAllVideoSources()` via `fetchNewsRSSWithVideo()` (already handles YouTube embed extraction)
  - Verify TMZ and ET Online are in `NEWS_RSS_FEEDS` with `cat: "CELEBRITY"` and `.slice(0, 5)` cap
  - Verify Citizen TV Kenya, KTN News Kenya, NTV Kenya are in `YOUTUBE_CHANNELS` with correct IDs and `cat: "NEWS"`
  - Apply `isEntertainmentTitle()` filter to TMZ and ET Online items
  - Export `extractThumbnailUrl` for use in `automate-video/route.ts`
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]\* 4.1 Write property test for YouTube thumbnail URL construction
    - **Property 13: YouTube thumbnail URL construction**
    - **Validates: Requirements 7.5, 8.1**
    - Use `fc.string({ minLength: 11, maxLength: 11 })` for YouTube video IDs; assert `extractThumbnailUrl()` returns correct `maxresdefault.jpg` URL

  - [ ]\* 4.2 Write property test for source category assignment
    - **Property 11: Source category assignment**
    - **Validates: Requirements 6.4, 7.4**
    - Use `fc.constantFrom(...FOOTBALL_FEEDS, ...ENTERTAINMENT_FEEDS)`; assert football feeds produce `"SPORTS"`, TMZ/ET Online produce `"CELEBRITY"`, Kenyan TV channels produce `"NEWS"`

  - [ ]\* 4.3 Write property test for football RSS resilience
    - **Property 12: Football RSS resilience**
    - **Validates: Requirements 6.7**
    - Use `fc.subarray(FOOTBALL_FEEDS)` where a random subset returns non-2xx; assert `fetchAllVideoSources()` still returns items from healthy feeds without throwing

  - [ ]\* 4.4 Write property test for entertainment feed item cap
    - **Property 14: Entertainment feed item cap**
    - **Validates: Requirements 7.7**
    - Use `fc.array(rssItemArb, { minLength: 6, maxLength: 20 })`; assert at most 5 items returned per entertainment feed

  - [ ]\* 4.5 Write property test for Bloom filter dedup
    - **Property 15: Bloom filter dedup**
    - **Validates: Requirements 6.6**
    - Use `fc.array(fc.string())` with some repeated IDs; assert `fetchAllVideoSources()` output contains no duplicate IDs

- [x] 5. Wire `extractThumbnailUrl()` into autonomous pipeline (`src/app/api/automate-video/route.ts`)
  - Import `extractThumbnailUrl` from `video-sources.ts`
  - Replace the inline `thumbRaw = target.thumbnail || ""` logic with `extractThumbnailUrl(target, resolved)`
  - Pass the extracted thumbnail URL as `article.imageUrl` to `generateImage()`
  - Add video quality filter: in `stageVideoInR2()`, check `buf.length < 500_000`; if too small return `null`
  - Add caption length optimizer: after `generateAIContent()`, call `truncateCaption(ai.caption, 2200)` before building `caption`
  - Add `truncateCaption(caption: string, maxLen = 2200): string` utility (truncate at last sentence boundary before limit)
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 11.17, 11.18_

  - [ ]\* 5.1 Write property test for video size filter
    - **Property 21: Video size filter**
    - **Validates: Requirements 11.17**
    - Use `fc.integer({ min: 0, max: 499999 })`; assert `stageVideoInR2()` returns `null` for buffers smaller than 500KB

  - [ ]\* 5.2 Write property test for caption length truncation
    - **Property 19: Caption length truncation**
    - **Validates: Requirements 11.18**
    - Use `fc.string({ minLength: 2201, maxLength: 5000 })`; assert `truncateCaption()` returns string ≤ 2200 chars ending at a sentence boundary

- [x] 6. Create new API routes (`src/app/api/scrape-videos/route.ts`, `src/app/api/schedule-post/route.ts`, `src/app/api/health/route.ts`)
  - `POST /api/scrape-videos`: call `fetchAllVideoSources()`, return `{ videos, count }` as JSON; add auth check matching existing pattern
  - `POST /api/schedule-post`: accept `{ url, headline, caption, category, scheduledAt }`; POST to `WORKER_URL + "/schedule"` with the payload; return `{ ok, id }`
  - `GET /api/health`: ping Meta Graph API, Gemini API, NVIDIA API, Worker KV (`/health`), and R2 (`/stage-image` with empty body) in parallel; measure latency for each; return `{ status, dependencies }` where `status` is `"ok"` / `"degraded"` / `"down"`
  - _Requirements: 11.2, 11.3, 11.11_

- [x] 7. Protect `/composer` route and add middleware auth (`src/middleware.ts`)
  - Update `middleware.ts` to redirect unauthenticated requests to `/login` for paths matching `/composer` and `/dashboard`
  - Use the existing `src/lib/auth.ts` session check pattern
  - Ensure the matcher includes `/composer` explicitly
  - _Requirements: 4.3_

- [ ] 8. Checkpoint — Ensure new routes and middleware work correctly, ask the user if questions arise.

- [x] 9. Redesign Composer page as standalone `/composer` route (`src/app/composer/page.tsx`)
  - Set `document.title = "Video Ops"` in a `useEffect` on mount
  - Add URL debounce: replace `onBlur` trigger with `useEffect` watching `url` state, debounced 600ms via `useRef<ReturnType<typeof setTimeout>>`
  - Add character counters: render `{caption.length}/2200` and `{headline.length}/120` below each field; color red when within 10% of limit
  - Add `localStorage` category persistence: on category change `localStorage.setItem("composer:category", category)`; on mount restore with fallback to `"GENERAL"`
  - Add "Copy Caption" button with 2s "Copied!" confirmation state
  - Add "Reset" button that clears all fields to empty defaults
  - Add source name + publication date display below URL input after successful fetch
  - Add "Duplicate Check" indicator: query `WORKER + "/seen/check"` with the URL's hash; show warning badge if already posted
  - Add `Ctrl+Enter` / `Cmd+Enter` keyboard shortcut to trigger post when `canPost` is true
  - Add "Post to IG only" / "Post to FB only" toggle (pass `{ igOnly: true }` or `{ fbOnly: true }` in the POST body)
  - Add direct links to published IG and FB posts using returned `postId` values on success
  - Add "Retry" button for each failed platform after partial post failure
  - Add real-time ETA display during posting based on current SSE `pct`
  - Add "Schedule" datetime-local input; when set, call `POST /api/schedule-post` instead of `POST /api/post-video`
  - Add hashtag editor below caption showing auto-generated tags with add/remove controls
  - Add "Caption Templates" dropdown with 5 templates (Breaking News, Celebrity Gossip, Sports Update, Music Release, General Entertainment)
  - Add emoji picker button next to caption that inserts at cursor position
  - Add "Tone" selector (Formal, Casual, Hype) passed to AI generation prompt
  - Add "Bulk Post" mode: textarea for up to 5 newline-separated URLs; sequential posting with 8s delay; queue status list
  - Add "Test Mode" toggle that skips final Meta API publish calls (dry run)
  - Add word count display alongside character count for caption
  - Add thumbnail "Regenerate" button on hover
  - Add recent URLs dropdown (last 5 from `localStorage`)
  - Add URL validation before enabling Fetch button (must match video URL pattern)
  - Add specific fetch error messages (network error vs. non-2xx)
  - Add AI confidence badge (Gemini / NVIDIA / excerpt fallback)
  - Add language selector (English / Swahili) for AI caption generation
  - Add "Source Attribution" field auto-populated from `sourceName`, editable before posting
  - Log submission to `localStorage` on post (timestamp, url, headline, caption, category)
  - _Requirements: 4.1, 4.2, 4.5, 4.6, 10.1–10.42_

  - [ ]\* 9.1 Write property test for debounce timing
    - **Property 16: Debounce timing**
    - **Validates: Requirements 10.1**
    - Use `fc.integer({ min: 0, max: 1200 })` for ms since last change; assert `doFetch()` is not called before 600ms and called exactly once after

  - [ ]\* 9.2 Write property test for character counter accuracy
    - **Property 17: Character counter accuracy**
    - **Validates: Requirements 10.2, 10.3**
    - Use `fc.string()`; assert displayed counter equals `string.length`

  - [ ]\* 9.3 Write property test for category localStorage round trip
    - **Property 18: Category localStorage round trip**
    - **Validates: Requirements 10.9**
    - Use `fc.constantFrom(...CATS)`; assert storing and reading back from `localStorage` restores the same category

- [x] 10. Redesign Cockpit tab — video-first UI (`src/app/composer/page.tsx`)
  - Add `VideoPost` interface with `postType`, `thumbnail`, `sourceType` fields
  - Filter video posts: `posts.filter(p => p.postType === "video")` for the Video Feed section
  - Render video cards with: 80px-wide 16:9 thumbnail, platform badge (color from `PLATFORM_COLOR`), category badge, source name, relative timestamp, title (one-line truncated), IG ✓/✗, FB ✓/✗, "Re-post" button
  - Hide broken thumbnail images without showing broken-image icon (`onError` → hide element)
  - Add Video Stats row: total videos today, IG successes, FB successes, failures (both failed)
  - Show LIVE indicator (pulsing green dot) when `autoPosting === true`
  - Keep 15s auto-refresh interval (already present — verify it refreshes video feed section too)
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]\* 10.1 Write property test for video feed filtering
    - **Property 9: Video feed filtering**
    - **Validates: Requirements 5.1**
    - Use `fc.array(fc.record({ postType: fc.constantFrom("video", "article") }))`; assert Video Feed only shows `postType === "video"` entries

  - [ ]\* 10.2 Write property test for video stats computation
    - **Property 10: Video stats computation**
    - **Validates: Requirements 5.3**
    - Use `fc.array(videoPostArb)`; assert total, igOk, fbOk, and fails counts are computed correctly

- [x] 11. Redesign Sources tab — video cards, filter bar, Feed Health sub-tab (`src/app/composer/page.tsx`)
  - Switch Sources tab to call `POST /api/scrape-videos` instead of `POST /api/admin/feeds`
  - Render each `VideoItem` as a card: 80px 16:9 thumbnail, platform badge, category badge, source name, relative timestamp, title (one-line), "▶ Post" and "Edit" buttons
  - Hide broken thumbnails via `onError`
  - Add filter bar: ALL + per-platform buttons filtering by `sourceType`
  - Add summary line: total video count + unique source count above filter bar
  - Show "Scraping 50+ sources… (~20s)" spinner during load
  - "▶ Post" streams SSE from `/api/post-video` and updates card status inline
  - "Edit" pre-fills Compose tab with video URL and switches tab
  - Add "Feed Health" sub-tab: fetch `/api/admin/feeds/status`; display each feed's OK/error status, item count, latency ms, last item timestamp
  - Add duration range display next to platform badge when `video.duration` is available
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

- [ ] 12. Checkpoint — Ensure Composer page, Cockpit tab, and Sources tab render correctly, ask the user if questions arise.

- [x] 13. Add platform-wide features to Cloudflare Worker (`cloudflare/worker.js`)
  - Add `/schedule` POST endpoint: accept `{ url, headline, caption, category, scheduledAt, id }`; store as `schedule:{timestamp}:{id}` in KV
  - Add `/schedule` GET endpoint: list all `schedule:*` keys, return array of scheduled posts
  - Add `/schedule/:id` DELETE endpoint: delete a scheduled post by key
  - Add scheduled post execution in `triggerAutomateWithLock()`: list `schedule:*` keys whose timestamp ≤ `Date.now()`; for each, POST to `/api/post-video` on Vercel; mark as done or delete on success
  - Add `pipeline:paused` KV flag check at the top of `triggerAutomateWithLock()`: if set, skip the run and log
  - Add `/pipeline/pause` POST endpoint (authed): set `pipeline:paused = "1"` in KV
  - Add `/pipeline/resume` POST endpoint (authed): delete `pipeline:paused` from KV
  - Add `/blacklist` POST endpoint: accept `{ type: "domain"|"keyword", value }`; store as `blacklist:{type}:{value}` in KV
  - Add `/blacklist` GET endpoint: list all `blacklist:*` keys, return array
  - Add `/blacklist` DELETE endpoint: accept `{ key }` and delete from KV
  - Add Telegram notification helper: after each post (success or failure), POST to `https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage` with title, platform results, and post URL; use `TELEGRAM_CHAT_ID` env var
  - Add auto-retry logic: on post failure, store `retry:{timestamp+5min}:{articleId}` in KV; cron tick checks for pending retries before main pipeline
  - Add rate limit detection: when Meta Graph API returns error code 4 or 32, store `ratelimit:pause:{platform}` with 15-min TTL; pipeline checks this key before posting to that platform
  - _Requirements: 11.3, 11.4, 11.10, 11.13, 11.21, 11.22, 11.23, 11.29, 11.31, 11.32_

  - [ ]\* 13.1 Write property test for blacklist filtering
    - **Property 22: Blacklist filtering**
    - **Validates: Requirements 11.23**
    - Use `fc.array(fc.string())` for domains/keywords, some blacklisted; assert pipeline filter step excludes matching items

- [x] 14. Add blacklist check to automate pipeline (`src/app/api/automate-video/route.ts`, `src/app/api/automate/route.ts`)
  - In `automate-video/route.ts`: after `fetchAllVideoSources()`, fetch `WORKER_URL + "/blacklist"` to get current blacklist entries
  - Filter `allVideos` to exclude items whose `url` domain or `title` matches any blacklist entry
  - Apply same blacklist filter in `src/app/api/automate/route.ts` `filterUnseen()` step
  - Add duplicate title detector: compute Levenshtein distance between new video title and titles posted in last 24h (from post log); skip if distance < 10
  - _Requirements: 11.19, 11.22, 11.23_

  - [ ]\* 14.1 Write property test for duplicate title detection
    - **Property 20: Duplicate title detection**
    - **Validates: Requirements 11.19**
    - Use `fc.tuple(fc.string(), fc.integer({ min: 0, max: 15 }))` for title pairs with distance; assert pipeline skips titles with distance < 10 from recent posts

- [x] 15. Add Dashboard Video Pipeline section and system health panel (`src/app/dashboard/page.tsx`)
  - Add "Video Pipeline" section separate from "Article Pipeline": video-specific stats, recent video posts, and controls
  - Add "Scheduled Posts" section: fetch `WORKER + "/schedule"` (GET); display each pending post with scheduled time, URL, and cancel button (DELETE)
  - Add system health panel: fetch `GET /api/health`; display each dependency (Meta Graph API, Gemini, NVIDIA, Worker KV, R2) with OK/error status and latency
  - Add "Pause Pipeline" toggle: call `WORKER + "/pipeline/pause"` or `"/pipeline/resume"` on toggle; read current state from `WORKER + "/health"` response
  - Add "Blacklist Manager": fetch `WORKER + "/blacklist"` (GET); display list with delete buttons; add form to add new domain/keyword entries
  - Add "Pipeline Log" section: show last 20 pipeline run results with timestamps, title, and outcome
  - Add "Video Archive" search: filter post log by title keyword
  - Add navigation link/button "Video Ops →" using `next/link` to `/composer`
  - _Requirements: 4.4, 11.1, 11.5, 11.12, 11.20, 11.22, 11.31_

- [ ] 16. Checkpoint — Ensure Dashboard sections render and Worker endpoints respond correctly, ask the user if questions arise.

- [x] 17. Write unit tests (`src/lib/__tests__/video-cockpit-overhaul.unit.test.ts`)
  - SSE parser: empty stream, single event, multi-event, event split across two chunks
  - `extractThumbnailUrl()`: YouTube ID extraction from `?v=` and `youtu.be/` URLs, TikTok cover fallback, empty thumbnail fallback
  - `truncateCaption()`: exactly 2200 chars (no-op), 2201 chars with sentence boundary, 2201 chars with no sentence boundary
  - Cover image fallback: mock R2 staging failure → FB photos fallback → no cover (proceed without)
  - Post-success navigation: success event triggers `onSuccess()` after 3s delay
  - Auth protection: unauthenticated request to `/composer` redirects to `/login`
  - Feed health: one feed returns non-2xx, others succeed — `fetchAllVideoSources()` still returns items
  - Blacklist: domain match excluded, keyword match excluded, no match passes through
  - _Requirements: 1.1–1.6, 3.1–3.4, 8.1–8.5, 11.17–11.19, 11.22–11.23_

- [ ] 18. Write property tests (`src/lib/__tests__/video-cockpit-overhaul.property.test.ts`)
  - Scaffold the test file with `fast-check` imports and `{ numRuns: 100 }` config
  - Implement all 22 property tests (P1–P22) as described in the design document
  - Each test must include the comment: `// Feature: video-cockpit-overhaul, Property {N}: {property_text}`
  - _Requirements: all (property tests validate correctness properties from design.md)_

- [ ] 19. Final checkpoint — Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Property tests validate universal correctness; unit tests validate specific examples and edge cases
- The Worker changes (task 13) require `wrangler deploy` after implementation
