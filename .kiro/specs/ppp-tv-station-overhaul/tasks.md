# Implementation Plan: PPP TV Kenya Station Overhaul

## Overview

Fix six critical production failures and raise content quality across the autonomous Next.js 14 social media station. Tasks are ordered by dependency: config fix first, then core infrastructure (Gemini, dedup, KB), then content quality (thumbnails, headlines, captions), then video and autonomy, then UI and parser hardening, then tests.

## Tasks

- [x] 1. Fix Vercel deployment target
  - [x] 1.1 Update `.vercel/project.json` — change `projectName` from `auto-news-station-1` to `auto-news-station` and verify `projectId` matches the correct project
    - _Requirements: 1.1, 1.2, 1.3_
  - [ ]* 1.2 Write unit test: assert `.vercel/project.json` contains `"auto-news-station"` (not `"auto-news-station-1"`)
    - _Requirements: 1.1_

- [x] 2. Fix Gemini AI integration
  - [x] 2.1 Refactor `src/lib/gemini.ts` — update `generateHeadline` and `generateCaption` to pass system instructions via `config.systemInstruction` (not as a user-role message), use model `gemini-2.0-flash`, and populate `systemInstruction` from the KB sections (`headline_guide` for headlines; `brand_voice`, `caption_guide`, `gen_z_guide`, `kenya_knowledge` for captions)
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 2.2 Implement `generateWithRetry` in `src/lib/gemini.ts` — generic retry wrapper with `validate` predicate, `maxRetries = 2`, structured fallback return, and `[gemini] AI fallback used: <reason>` log on fallback
    - Headline validation: `s.length >= 6 && s.length <= 100`
    - Caption validation: `s.length >= 50`
    - _Requirements: 2.4, 2.5, 2.6_
  - [ ]* 2.3 Write property test for AI output validation (Property 2)
    - **Property 2: AI output validation rejects out-of-range values and retries**
    - **Validates: Requirements 2.4, 2.5, 2.6**
  - [ ]* 2.4 Write unit tests for `src/lib/gemini.ts`
    - `generateHeadline` returns fallback when `GEMINI_API_KEY` is not set
    - `generateCaption` includes source credit in fallback path
    - KB defaults contain all required keys: `brand_voice`, `headline_guide`, `caption_guide`, `gen_z_guide`, `kenya_knowledge`
    - _Requirements: 2.1–2.6_

- [x] 3. Fix category rotation
  - [x] 3.1 Update `src/app/api/automate/route.ts` — define `CATEGORY_CYCLE` array in order: `ENTERTAINMENT → SPORTS → MUSIC → CELEBRITY → TV & FILM → MOVIES → LIFESTYLE → GENERAL`; implement `getLastCategory()` (GET `/last-category` from CF KV) and `setLastCategory(cat)` (POST `/last-category` to CF KV)
    - _Requirements: 3.1, 3.3_
  - [x] 3.2 Implement `selectNextCategory(lastCategory, availableCategories)` — hard-exclude `lastCategory` when alternatives exist, find next category in `CATEGORY_CYCLE`, fall back to any category if no alternatives; call `setLastCategory` after every successful post
    - _Requirements: 3.2, 3.4, 3.5, 3.6_
  - [ ]* 3.3 Write property test for category rotation hard-exclude (Property 3)
    - **Property 3: Category rotation hard-excludes the last-posted category**
    - **Validates: Requirements 3.2, 3.3**
  - [ ]* 3.4 Write property test for last-category KV round-trip (Property 4)
    - **Property 4: Last-category KV round-trip**
    - **Validates: Requirements 3.1, 3.6**

- [x] 4. Fix deduplication
  - [x] 4.1 Update `src/lib/supabase.ts` — create `supabaseAdmin` client using `SUPABASE_SERVICE_KEY` (service-role key, bypasses RLS); add startup warning in `src/app/api/automate/route.ts` when `SUPABASE_SERVICE_KEY` is not set
    - _Requirements: 4.1, 4.2_
  - [x] 4.2 Implement `isArticleSeen(id, titleFp)` — checks both `seen_articles.id` and `seen_articles.title_fp`; falls back to KV `/seen/check` if Supabase unavailable
    - _Requirements: 4.4_
  - [x] 4.3 Implement `markArticleSeen(id, title)` — upserts to `seen_articles` with `title_fp` (first 60 normalised chars); ensure it is called and awaited BEFORE the publish call in the pipeline
    - _Requirements: 4.3, 4.5_
  - [x] 4.4 Implement `deduplicateByTitleFingerprint(articles)` in `src/app/api/automate/route.ts` — in-memory pass on the current batch before any Supabase check
    - _Requirements: 4.6_
  - [ ]* 4.5 Write property test for mark-before-publish ordering (Property 5)
    - **Property 5: Dedup marks articles seen before publish**
    - **Validates: Requirements 4.3**
  - [ ]* 4.6 Write property test for dual-key dedup (Property 6)
    - **Property 6: Dual-key dedup catches both URL variants and title variants**
    - **Validates: Requirements 4.4**
  - [ ]* 4.7 Write property test for in-memory batch dedup (Property 7)
    - **Property 7: In-memory batch dedup eliminates title duplicates**
    - **Validates: Requirements 4.6**

- [x] 5. Knowledge Base runtime loading
  - [x] 5.1 Implement `getKB()` in `src/lib/gemini.ts` — module-level cache (`_kbCache`, `_kbLoadTime`, `KB_CACHE_TTL = 5 * 60 * 1000`); fetch from Supabase `knowledge_base` table and merge with `KB_DEFAULTS` (Supabase values override); fall back to `KB_DEFAULTS` on Supabase error with `[kb] Supabase unreachable, using defaults` log
    - _Requirements: 5.1, 5.2, 5.3, 5.5_
  - [x] 5.2 Export `invalidateKBCache()` from `src/lib/gemini.ts` — resets `_kbLoadTime = 0`; call it from the KB API route (`/api/knowledge-base/route.ts`) after every successful save or delete
    - _Requirements: 5.4, 11.5_
  - [x] 5.3 Update `generateHeadline` and `generateCaption` to call `getKB()` and inject all required KB sections into every prompt as system instructions
    - _Requirements: 5.4_
  - [ ]* 5.4 Write property test for KB merge — Supabase overrides defaults (Property 8)
    - **Property 8: KB merge — Supabase values override defaults**
    - **Validates: Requirements 5.1, 5.5**
  - [ ]* 5.5 Write property test for KB cache TTL (Property 9)
    - **Property 9: KB cache respects 5-minute TTL**
    - **Validates: Requirements 5.2, 5.3**
  - [ ]* 5.6 Write property test for KB cache invalidation on save (Property 22)
    - **Property 22: KB cache invalidated on save**
    - **Validates: Requirements 11.5**

- [ ] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Thumbnail quality — correct dimensions and branding
  - [x] 7.1 Update `src/lib/image-gen.ts` — define `IMAGE_RATIOS` map (`"4:5": {w:1080,h:1350}`, `"9:16": {w:1080,h:1920}`); update `generateImage` to use `ratio` option (default `"4:5"`) and resize background via Sharp `fit: "cover"` to exact dimensions; fall back to solid `#111` if image fetch fails
    - _Requirements: 6.1, 6.2, 6.7_
  - [x] 7.2 Update Satori layout in `src/lib/image-gen.ts` — render PPP TV logo at `top:96, left:40, 240×96px`; render `PPP TV KENYA` top bar in `#E50914`; apply gradient overlay `rgba(0,0,0,0) 0% → rgba(0,0,0,1) 78%`; render category pill using `CAT_COLORS` map
    - _Requirements: 6.3, 6.4, 6.5, 6.8_
  - [x] 7.3 Implement `getHeadlineFontSize(title)` — returns value in `[58, 160]` based on character count thresholds; render headline in Bebas Neue, ALL CAPS, white
    - _Requirements: 6.6_
  - [ ]* 7.4 Write property test for thumbnail font size range (Property 10)
    - **Property 10: Thumbnail font size stays within [58, 160] px**
    - **Validates: Requirements 6.6**
  - [ ]* 7.5 Write property test for category color lookup (Property 11)
    - **Property 11: Category color lookup always returns a valid color**
    - **Validates: Requirements 6.5**
  - [ ]* 7.6 Write unit tests for `src/lib/image-gen.ts`
    - `generateImage` with `ratio: "4:5"` produces buffer decodable to 1080×1350
    - `generateImage` with `ratio: "9:16"` produces buffer decodable to 1080×1920
    - `generateImage` with null `imageUrl` does not throw
    - _Requirements: 6.1, 6.2, 6.7_

- [x] 8. Headlines — 4–7 words, name-first formula
  - [x] 8.1 Implement `enforceHeadlineRules(headline)` in `src/lib/gemini.ts` — uppercase, strip banned words (`SHOCKING`, `AMAZING`, `INCREDIBLE`, `YOU WON'T BELIEVE`, `MUST SEE`, `EXPLOSIVE`, `BOMBSHELL`), truncate to first 7 words if over 7, strip disallowed punctuation
    - _Requirements: 7.4, 7.5, 7.6_
  - [x] 8.2 Update the headline system prompt to instruct Gemini: exactly 4–7 words, start with the most prominent name or biggest fact, use exactly one strong action verb from the approved list, ALL CAPS, no punctuation except dash (—)
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [x] 8.3 Wire `enforceHeadlineRules` into the `generateHeadline` return path so it runs on every generated headline before validation
    - _Requirements: 7.5_
  - [ ]* 8.4 Write property test for headline ALL CAPS and no banned words (Property 12)
    - **Property 12: Headlines are ALL CAPS and contain no banned words**
    - **Validates: Requirements 7.4, 7.6**
  - [ ]* 8.5 Write property test for headline 7-word truncation (Property 13)
    - **Property 13: Headlines are truncated to 7 words maximum**
    - **Validates: Requirements 7.1, 7.5**

- [x] 9. Captions — Gen Z Nairobi voice
  - [x] 9.1 Update the caption system prompt in `src/lib/gemini.ts` — instruct Gemini: under 180 words, three-part structure (hook → story → close with CTA + source credit), 2–3 emojis max, no hashtags in body, no banned phrases (`stay tuned`, `watch this space`, `find out why below`), end with `Source: [sourceName]`, use approved Gen Z opener patterns from `caption_guide` KB section
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_
  - [x] 9.2 Add caption post-processing in `generateCaption` — if word count > 180, retry once with explicit word-count constraint; if still over 180, truncate at last complete sentence before word 180
    - _Requirements: 8.8_
  - [ ]* 9.3 Write property test for caption word count under 180 (Property 14)
    - **Property 14: Captions are under 180 words**
    - **Validates: Requirements 8.1, 8.8**
  - [ ]* 9.4 Write property test for captions — no hashtags and no banned phrases (Property 15)
    - **Property 15: Captions contain no hashtags and no banned phrases**
    - **Validates: Requirements 8.4, 8.5**
  - [ ]* 9.5 Write property test for caption source credit (Property 16)
    - **Property 16: Captions end with a source credit line**
    - **Validates: Requirements 8.6**

- [ ] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Video scraping by topic and keyword
  - [x] 11.1 Implement `searchTikWMByKeyword(keyword, count, sortBy)` in `src/lib/video-sources.ts` — POST to `https://www.tikwm.com/api/feed/search` with `{keywords, count, sort_type}`; return `[]` on zero results or HTTP error without throwing
    - _Requirements: 9.1, 9.3, 9.7_
  - [x] 11.2 Define `VIDEO_KEYWORDS` tiered list in `src/lib/video-sources.ts` — Tier 1 (Kenya/Africa, always searched), Tier 2 (global sports/music, rotated), Tier 3 (background variety, occasional); integrate keyword search into `fetchAllVideoSources()`
    - _Requirements: 9.2_
  - [x] 11.3 Implement `scoreVideo(video)` — additive scoring: `viralScore + recencyScore + kenyanBoost (+25 for Kenya/Africa keywords) + playBoost + upvoteBoost`; add video dedup by URL and title fingerprint before scoring
    - _Requirements: 9.4, 9.5_
  - [ ]* 11.4 Write property test for video scoring determinism (Property 17)
    - **Property 17: Video scoring is additive and deterministic**
    - **Validates: Requirements 9.4**
  - [ ]* 11.5 Write property test for video batch dedup (Property 18)
    - **Property 18: Video batch dedup eliminates URL and title duplicates**
    - **Validates: Requirements 9.5**
  - [ ]* 11.6 Write unit tests for `src/lib/video-sources.ts`
    - `searchTikWMByKeyword` with zero results returns `[]` without throwing
    - `VIDEO_KEYWORDS.tier1` is non-empty and contains Kenya-specific terms
    - TikWM search request includes `sort_type: 1` (play count sort)
    - _Requirements: 9.1, 9.2, 9.3, 9.7_

- [x] 12. Autonomous operation — structured logging and scheduling
  - [x] 12.1 Update `cloudflare/worker.js` — implement `isDeadZone(nowEAT)` (blocks 01:00–05:44 EAT), `canPost(env)` (10-min gap check via `last-post-ts` KV), and daily cap check (`daily:{date}` KV, max 48); log `"Daily cap reached"` and return early when cap hit
    - _Requirements: 10.6, 10.7, 10.8, 10.9_
  - [x] 12.2 Add structured JSON logging throughout the pipeline in `src/app/api/automate/route.ts` and `cloudflare/worker.js` — every event logs `{ts, step, articleId, status, reason, category}`; log non-200 responses from `/api/automate` with status code and body
    - _Requirements: 10.1, 10.2, 10.5_
  - [x] 12.3 Ensure every pipeline skip is logged with a reason (scrape failure, AI fallback, image failure, dedup skip, dead zone, gap, cap); image generation failure must log and skip the post rather than posting a broken image
    - _Requirements: 10.3, 10.4_
  - [ ]* 12.4 Write property test for dead zone enforcement (Property 19)
    - **Property 19: Dead zone blocks all posts between 1:00am and 5:45am EAT**
    - **Validates: Requirements 10.6**
  - [ ]* 12.5 Write property test for 10-minute gap enforcement (Property 20)
    - **Property 20: Minimum 10-minute gap between consecutive posts**
    - **Validates: Requirements 10.7**
  - [ ]* 12.6 Write property test for daily cap never exceeds 48 (Property 21)
    - **Property 21: Daily post cap never exceeds 48**
    - **Validates: Requirements 10.8**
  - [ ]* 12.7 Write unit tests for `cloudflare/worker.test.js`
    - Dead zone boundary: 00:59 EAT is not dead zone, 01:00 EAT is dead zone
    - Dead zone boundary: 05:44 EAT is dead zone, 05:45 EAT is not dead zone
    - `canPost` returns false when last post was 9 min 59 sec ago
    - `canPost` returns true when last post was exactly 10 min ago
    - _Requirements: 10.6, 10.7_

- [x] 13. Knowledge Base page — live AI test enhancements
  - [x] 13.1 Update `src/app/knowledge-base/page.tsx` — extend `TestResult` interface with `wordCount`, `charCount`, and `usingLiveKB` fields; display word count and character count in the test result panel
    - _Requirements: 11.6_
  - [x] 13.2 Add `usingLiveKB` status indicator to the KB page — show "Using live KB" (green) when Supabase data is loaded, "Using defaults" (orange) when falling back; extend `/api/preview-url` response to include `{ usingLiveKB: boolean }`
    - _Requirements: 11.3, 5.6_
  - [x] 13.3 Wire cache invalidation on save — `handleSave` in the KB page calls `POST /api/knowledge-base` then the route calls `invalidateKBCache()` directly so the next AI call uses updated content immediately
    - _Requirements: 11.5_
  - [ ]* 13.4 Write property test for word/char count accuracy (Property 23)
    - **Property 23: Caption word and character count match actual content**
    - **Validates: Requirements 11.6**
  - [ ]* 13.5 Write unit tests for `src/app/api/knowledge-base.test.ts`
    - `GET /api/knowledge-base` returns all 7 default sections when DB is empty
    - `POST /api/knowledge-base` upserts and returns `{ ok: true }`
    - `DELETE /api/knowledge-base` removes the row and returns `{ ok: true }`
    - _Requirements: 11.1, 11.2, 11.4_

- [ ] 14. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. RSS parser hardening
  - [x] 15.1 Implement `unwrapCDATA(raw)` and `decodeEntities(str)` utilities in `src/lib/scraper.ts`; update `parseRSSItem` to use both on all extracted text fields (title, description)
    - _Requirements: 12.2, 12.3_
  - [x] 15.2 Add `AbortSignal.timeout(10_000)` to all feed fetch calls in `src/lib/scraper.ts`; return `[]` for that feed on non-200 HTTP status or timeout, with `[scraper] feed <name> returned <status>` log
    - _Requirements: 12.5_
  - [x] 15.3 Implement `isWithin24h(pubDate)` and apply it as a filter in `parseRSSItem` / the article batch — drop items older than 24 hours
    - _Requirements: 12.6_
  - [ ]* 15.4 Write property test for RSS round-trip (Property 24)
    - **Property 24: RSS parser round-trip**
    - **Validates: Requirements 12.1, 12.4**
  - [ ]* 15.5 Write property test for CDATA unwrap and entity decode (Property 25)
    - **Property 25: RSS text extraction — CDATA unwrap and entity decode**
    - **Validates: Requirements 12.2, 12.3**
  - [ ]* 15.6 Write property test for RSS age filter (Property 26)
    - **Property 26: RSS age filter excludes items older than 24 hours**
    - **Validates: Requirements 12.6**
  - [ ]* 15.7 Write unit tests for `src/lib/scraper.test.ts`
    - Feed fetch with HTTP 404 returns empty array
    - Feed fetch timeout returns empty array
    - Items with `pubDate` exactly 24h ago are excluded
    - _Requirements: 12.5, 12.6_

- [ ] 16. Write property-based tests (fast-check) for all 26 correctness properties
  - [ ] 16.1 Set up fast-check in the test suite — install `fast-check` if not present, configure `numRuns: 100` globally, create test files at the locations defined in the design: `src/lib/gemini.test.ts`, `src/lib/image-gen.test.ts`, `src/lib/scraper.test.ts`, `src/lib/video-sources.test.ts`, `src/lib/supabase.test.ts`, `src/app/api/knowledge-base.test.ts`, `cloudflare/worker.test.js`
    - _Requirements: all_
  - [ ] 16.2 Implement property tests P1–P9 (Gemini, category rotation, dedup, KB) in `src/lib/gemini.test.ts` and `src/lib/supabase.test.ts`
    - Each test tagged: `// Feature: ppp-tv-station-overhaul, Property N: <text>`
    - _Requirements: 2.1–2.6, 3.1–3.6, 4.3–4.6, 5.1–5.5_
  - [ ] 16.3 Implement property tests P10–P16 (image gen, headlines, captions) in `src/lib/image-gen.test.ts` and `src/lib/gemini.test.ts`
    - _Requirements: 6.5, 6.6, 7.1–7.6, 8.1–8.8_
  - [ ] 16.4 Implement property tests P17–P21 (video scoring, autonomous operation) in `src/lib/video-sources.test.ts` and `cloudflare/worker.test.js`
    - _Requirements: 9.4, 9.5, 10.6–10.9_
  - [ ] 16.5 Implement property tests P22–P26 (KB cache, RSS) in `src/lib/gemini.test.ts` and `src/lib/scraper.test.ts`
    - _Requirements: 11.5, 11.6, 12.1–12.6_

- [x] 17. Final checkpoint — Ensure all tests pass
  - Run `npx vitest --run` and confirm all property-based and unit tests pass. Ask the user if any questions arise before proceeding to deployment.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Property tests validate universal correctness properties (fast-check, 100 runs each)
- Unit tests validate specific examples, edge cases, and integration points
- Deployment to Vercel (task 1.1) must be the first fix applied — all other fixes are wasted if they deploy to the wrong project
