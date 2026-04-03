# Implementation Plan: Video Pipeline & Mutembei TV

## Overview

Fix five bugs and add two features in the PPP TV Kenya Next.js app. Tasks are ordered so tests come first (bug-condition tests that fail on unfixed code, then preservation tests that pass), followed by fixes from simplest to most complex, then new features, then the Cloudflare Worker fix.

## Tasks

- [x] 1. Write bug-condition exploration tests (PBT) — these FAIL on unfixed code
  - [x] 1.1 Write property test for post_type snake_case (Property 11)
    - In `src/lib/__tests__/video-pipeline-bug-condition.test.ts`, write a fast-check property that mocks `logPost` in `/api/post-video/route.ts` and asserts the logged entry has `post_type: "video"` (snake_case). On unfixed code this FAILS because the route logs `postType: "video"` (camelCase).
    - **Property 11: post_type is always snake_case "video"**
    - **Validates: Requirements 5.1**
  - [ ]* 1.2 Write property test for auth header in triggerAutoPost (Property 4)
    - Mock `fetch` and assert every call to `/api/automate-video` from `triggerAutoPost` includes `Authorization: Bearer ppptvWorker2024`. On unfixed code this FAILS because the header is absent.
    - **Property 4: Auth header always present in triggerAutoPost**
    - **Validates: Requirements 2.1**
  - [ ]* 1.3 Write property test for caption fallback (Property 1 — canPost)
    - Use fast-check to generate `(url, headline, caption)` triples where at least one is whitespace-only and assert `canPost` is `false`. Also assert that after `doFetch` returns an empty caption but non-empty headline, `caption` is set to `headline`. On unfixed code the second assertion FAILS.
    - **Property 1: Post button requires non-empty fields**
    - **Validates: Requirements 1.7**
  - [ ]* 1.4 Write property test for YouTube trend volume determinism (Property 9)
    - Generate random `publishedAt` dates within 48h and assert two calls to the volume formula return the same value. On unfixed code this FAILS because `Math.random()` is used.
    - **Property 9: YouTube trend volumes are deterministic**
    - **Validates: Requirements 4.6**
  - [ ]* 1.5 Write property test for Reddit trend volume = post score (Property 10)
    - Generate Reddit post JSON with arbitrary `score` values and assert `trend.volume === post.score`. On unfixed code this FAILS because `Math.random()` is used.
    - **Property 10: Reddit trend volume equals post score**
    - **Validates: Requirements 4.7**
  - _Requirements: 5.1, 2.1, 1.7, 4.6, 4.7_

- [x] 2. Write preservation tests — these PASS on unfixed code
  - [x] 2.1 Write property test for SSE event forwarding (Property 2)
    - In `src/lib/__tests__/video-pipeline-preservation.test.ts`, generate arrays of SSE events and assert `onProgress` is called exactly N times. Must pass before and after fixes.
    - **Property 2: SSE progress events are forwarded**
    - **Validates: Requirements 1.2**
  - [ ]* 2.2 Write property test for non-2xx sets error status (Property 3)
    - Generate HTTP status codes 400–599 and assert `status` becomes `"error"` with the code in the message.
    - **Property 3: Non-2xx response sets error status**
    - **Validates: Requirements 1.3**
  - [ ]* 2.3 Write property test for Nitter item parsing (Property 8)
    - Generate synthetic RSS `<item>` XML and assert parsed trend has non-empty `title`, `url`, `source: "twitter"`, and `volume > 0`.
    - **Property 8: Nitter items are correctly parsed**
    - **Validates: Requirements 4.3, 8.3**
  - [ ]* 2.4 Write property test for Nitter deduplication (Property 19)
    - Inject duplicate-title items and assert at most one survives per normalized title.
    - **Property 19: Nitter deduplication by normalized title**
    - **Validates: Requirements 8.4**
  - [ ]* 2.5 Write property test for Mutembei TV source fields (Property 13)
    - Mock Graph API response with fast-check arrays and assert every item has `sourceName: "Mutembei TV"`, `category: "ENTERTAINMENT"`, and `id` prefixed with `"mutembei:"`.
    - **Property 13: Mutembei TV source fields are correct**
    - **Validates: Requirements 6.1**
  - [ ]* 2.6 Write property test for Mutembei TV sort order (Property 16)
    - Generate N≥2 items with random `created_time` values and assert the result is sorted descending by `publishedAt`.
    - **Property 16: Mutembei TV results are sorted by recency**
    - **Validates: Requirements 6.8**
  - [ ]* 2.7 Write property test for Mutembei TV caption attribution (Property 14)
    - Generate arbitrary video titles/descriptions and assert the final caption always contains `"Source: Mutembei TV"`.
    - **Property 14: Mutembei TV caption always contains attribution**
    - **Validates: Requirements 6.5**
  - [ ]* 2.8 Write property test for Mutembei TV viral score boost (Property 17)
    - Assert that a Mutembei TV video's `_score` is at least 30 points higher than the same video scored without the boost.
    - **Property 17: Mutembei TV gets viral score boost**
    - **Validates: Requirements 7.4**
  - _Requirements: 1.2, 1.3, 4.3, 8.3, 8.4, 6.1, 6.5, 6.8, 7.4_

- [x] 3. Checkpoint — run all tests before making any fixes
  - Ensure all bug-condition tests FAIL and all preservation tests PASS. Ask the user if questions arise.

- [x] 4. Fix Bug 5: post_type snake_case in /api/post-video
  - In `src/app/api/post-video/route.ts`, change the `logPost` call to use snake_case fields:
    - Replace `postType: "video"` → `post_type: "video"`
    - Replace `articleId` → `article_id`, `postedAt` → `posted_at`, `manualPost` → remove (not in schema)
    - Match the schema used by `/api/automate-video`: `{ article_id, title, url, category, source_name, post_type, ig_success, ig_post_id, ig_error, fb_success, fb_post_id, fb_error, posted_at }`
  - In `src/app/dashboard/page.tsx` (or wherever the video count is computed), ensure the filter counts both `p.post_type === "video"` AND `p.postType === "video"` for legacy entries.
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 5. Fix Bug 2: Add auth header to CockpitTab triggerAutoPost
  - In `src/app/composer/page.tsx`, find the `triggerAutoPost` function (line ~395).
  - Change the fetch call from:
    ```ts
    fetch("/api/automate-video", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" } })
    ```
    to:
    ```ts
    fetch("/api/automate-video", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer ppptvWorker2024" } })
    ```
  - Also add a 401 guard: if `r.status === 401`, set `toast({ msg: "Auto-post failed: Unauthorized", type: "err" })` and set `autoPosting = false`.
  - _Requirements: 2.1, 2.3_

- [x] 6. Fix Bug 1: Add caption fallback in ComposeTab doFetch
  - In `src/app/composer/page.tsx`, in the `doFetch` function, after the AI caption is set, add:
    ```ts
    if (!preview.ai?.caption && headline) {
      setCaption(headline);
      setIgCaption(headline);
      setFbCaption(headline);
    }
    ```
  - This ensures `caption` is never empty after a successful fetch, so `canPost` is not stuck as `false`.
  - _Requirements: 1.7_

- [x] 7. Checkpoint — run bug-condition tests for Bugs 5, 2, 1
  - Tests 1.1, 1.2, 1.3 should now PASS. Preservation tests should still PASS. Ask the user if questions arise.

- [x] 8. Fix Bug 3: Implement /api/competitors/feed/route.ts YouTube RSS proxy
  - The route at `src/app/api/competitors/feed/route.ts` is already correctly implemented (proxies YouTube Atom feed, returns `Content-Type: application/xml`, 502 on timeout). No code changes needed.
  - Verify by reading the file and confirming: `channelId` guard returns 400, timeout aborts at 10s, non-2xx returns 502, success returns raw XML with `Content-Type: application/xml`.
  - _Requirements: 3.4, 3.5_

- [x] 9. Fix Bug 4: Fix trends — add Twitter/Nitter source, fix deterministic volumes
  - In `src/app/api/trends/[source]/route.ts`:
  - **Add `getTwitter()` function:**
    - Define `NITTER_INSTANCES = ["nitter.poast.org", "nitter.privacydev.net", "nitter.net"]`
    - Define `NITTER_ACCOUNTS = ["citizentvkenya", "ntvkenya", "tukokenya", "nairobinews", "spmbuzz"]`
    - For each instance, fetch `https://{instance}/{account}/rss` with 5s timeout
    - Parse `<item>` elements: extract `title` (tweet text), `link` (tweet URL)
    - Set `volume` = `(items.length - index) * 1000` (position-based, deterministic)
    - Set `source: "twitter"`, `fetchedAt: new Date().toISOString()`
    - Stop trying instances once any one succeeds (`anySuccess` flag)
    - If all instances fail, return static Kenya fallback trends with `source: "twitter-fallback"`
    - Deduplicate by normalized title (lowercase, punctuation removed)
  - **Fix `getYouTube()` volume:** Replace `Math.floor(Math.random()*50000)+1000` with:
    ```ts
    const ageMs = Date.now() - new Date(published).getTime();
    const volume = Math.max(1, Math.floor((48 * 3600 * 1000 - ageMs) / 3600000) * 1000);
    ```
  - **Fix `getReddit()` volume:** Replace `Math.floor(Math.random()*10000)+500` with `p.score || 0`
  - **Add route handler:** In the `GET` handler, add `if (source === "twitter") return NextResponse.json({ trends: await getTwitter() });`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 10. Checkpoint — run bug-condition tests for Bug 4
  - Tests 1.4 and 1.5 should now PASS. All preservation tests should still PASS. Ask the user if questions arise.

- [x] 11. Add Feature: Mutembei TV scraper in video-sources.ts
  - In `src/lib/video-sources.ts`, add the exported `fetchMutembeiTVVideos()` function:
    - **Tier 1 (Graph API):** If `process.env.FACEBOOK_ACCESS_TOKEN` is set, fetch `https://graph.facebook.com/v19.0/MutembeiTV/videos?fields=id,title,description,source,created_time&limit=25&access_token={token}` with 10s timeout. Sort by `created_time` descending. Map to `VideoItem` with `id: "mutembei:{v.id}"`, `sourceName: "Mutembei TV"`, `sourceType: "direct-mp4"`, `category: "ENTERTAINMENT"`.
    - **Tier 2 (HTML fallback):** If token missing or API fails, fetch `https://www.facebook.com/MutembeiTV/videos` with browser User-Agent and 15s timeout. Parse JSON-LD and `application/json` script tags for video data using a helper `extractFacebookVideos(html)`. Map to same `VideoItem` shape.
    - Both tiers return `[]` on any error — pipeline continues with other sources.
  - _Requirements: 6.1, 6.2, 6.3, 6.8_

- [ ] 12. Add Feature: Dual AI + attribution in automate-video route for Mutembei TV
  - In `src/app/api/automate-video/route.ts`, add a `generateWithNvidiaCaption(article)` helper that calls the NVIDIA NIM API (`llama-3.1-8b-instruct`) directly and returns the caption string.
  - In the caption-generation block, add a branch for `target.sourceName === "Mutembei TV"`:
    ```ts
    if (target.sourceName === "Mutembei TV") {
      const [geminiResult, nvidiaResult] = await Promise.allSettled([
        generateAIContent(article),
        generateWithNvidiaCaption(article),
      ]);
      const geminiContent = geminiResult.status === "fulfilled" ? geminiResult.value : null;
      const nvidiaCaption = nvidiaResult.status === "fulfilled" ? nvidiaResult.value : null;
      const headline = geminiContent?.clickbaitTitle || target.title.toUpperCase();
      const body = nvidiaCaption || geminiContent?.caption || target.title;
      caption = `${body}\n\nSource: Mutembei TV`;
    }
    ```
  - _Requirements: 6.5, 6.6_

- [ ] 13. Add Feature: Include Mutembei TV in fetchAllVideoSources + viral score boost
  - In `src/lib/video-sources.ts`, in `fetchAllVideoSources()`, add `fetchMutembeiTVVideos()` to the parallel source fetches and prepend its results to the combined list so they appear before deduplication.
  - In `src/app/api/automate-video/route.ts`, in the scoring loop, add the Mutembei TV boost:
    ```ts
    const isMutembeiTV = v.sourceName === "Mutembei TV";
    const finalScore = viralScore + (isKenyan ? 25 : 0) + (hasDirect ? 10 : 0) + viewBoost + (isMutembeiTV ? 30 : 0);
    ```
  - _Requirements: 7.1, 7.4, 7.6_

- [ ] 14. Checkpoint — run preservation tests for Mutembei TV features
  - Tests 2.5, 2.6, 2.7, 2.8 should now PASS. All other tests should still PASS. Ask the user if questions arise.

- [ ] 15. Fix Cloudflare Worker: ensure it calls automate-video with correct URL
  - In `cloudflare/worker.js`, in `triggerAutomate()`, the `appUrl` is set to `env.VERCEL_APP_URL || "https://auto-news-station.vercel.app"`. The fallback URL is wrong — it should be the actual Vercel deployment URL.
  - Change the fallback to: `const appUrl = env.VERCEL_APP_URL || "https://ppp-tv-site-final.vercel.app";`
  - Confirm the video pipeline call already uses `Authorization: \`Bearer ${secret}\`` — it does (line ~990). No auth header change needed.
  - _Requirements: 7.2, 7.3_

- [ ] 16. Final checkpoint — run all tests
  - All bug-condition tests (1.1–1.5) should PASS.
  - All preservation tests (2.1–2.8) should PASS.
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Bug-condition tests are written first so regressions are caught immediately when fixes land
- Preservation tests guard against fixes breaking existing correct behavior
- Each fix is self-contained — they can be applied in any order after the tests are written
- The competitors feed route (Bug 3) requires no code change — it is already correct
- Property tests use `fast-check` (`fc`) with `numRuns: 100` minimum
