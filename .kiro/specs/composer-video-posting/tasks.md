# Implementation Plan: Composer Video Posting Fix

## Overview

Add `publishVideo()` to `publisher.ts`, route video articles in `/api/automate` to it, add `VideoPost` type to `types.ts`, and verify the Composer UI and `/api/post-video` are correct.

## Tasks

- [x] 1. Add VideoPost type to src/lib/types.ts
  - Add `VideoPost` interface with `stagedVideoUrl`, `stagedKey`, `coverImageUrl?`, `caption`, `category` fields
  - _Requirements: 1.1_

- [x] 2. Add publishVideo() to src/lib/publisher.ts
  - [x] 2.1 Implement publishToInstagramVideo() internal function
    - Accept `post: SocialPost`, `stagedVideoUrl: string`, `coverImageUrl?: string`
    - Build container payload with `media_type: "REELS"`, `video_url: stagedVideoUrl`, `share_to_feed: true`
    - Include `cover_url` in payload only when `coverImageUrl` is defined
    - Reuse existing `waitForIGContainer()` for polling (3s intervals, 45s timeout, attempt publish on timeout)
    - Return `{ success: false, error: "Instagram tokens not configured" }` when env vars missing
    - _Requirements: 1.2, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4_

  - [ ]\* 2.2 Write property test for publishToInstagramVideo() — IG endpoint invariant
    - **Property 1: Instagram video endpoint invariant**
    - **Validates: Requirements 1.2, 2.2**

  - [x] 2.3 Implement publishToFacebookVideo() internal function
    - Accept `post: SocialPost`, `stagedVideoUrl: string`
    - POST to `/{pageId}/videos` with `file_url: stagedVideoUrl`, `description`, `published: true`
    - Return `{ success: false, error: "Facebook tokens not configured" }` when env vars missing
    - _Requirements: 1.3, 1.6_

  - [ ]\* 2.4 Write property test for publishToFacebookVideo() — FB endpoint invariant
    - **Property 2: Facebook video endpoint invariant**
    - **Validates: Requirements 1.3**

  - [x] 2.5 Implement and export publishVideo() orchestrator
    - Accept `posts: { ig?: SocialPost; fb?: SocialPost }`, `stagedVideoUrl: string`, `coverImageUrl?: string`
    - Run `publishToInstagramVideo()` and `publishToFacebookVideo()` concurrently via `Promise.all()`
    - Return `PublishResult`
    - _Requirements: 1.1, 1.7, 1.8_

  - [ ]\* 2.6 Write property test for publishVideo() — concurrent platform posting
    - **Property 7: Concurrent platform posting**
    - **Validates: Requirements 1.7**

- [x] 3. Checkpoint — Ensure publisher.ts compiles cleanly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update /api/automate/route.ts to route video articles to publishVideo()
  - [x] 4.1 Import publishVideo from publisher.ts in automate/route.ts
    - Add `publishVideo` to the existing import from `@/lib/publisher`
    - _Requirements: 3.2_

  - [x] 4.2 Add video staging helper in postOneArticle()
    - When `article.isVideo && article.videoUrl`, call CF Worker `/stage-video` to get `stagedVideoUrl`
    - On staging failure, log a warning and fall through to the existing `publish()` image path
    - _Requirements: 3.1, 3.4_

  - [x] 4.3 Replace the existing internal `/api/post-video` HTTP call with a direct publishVideo() call
    - Remove the `fetch(\`\${baseUrl}/api/post-video\`, ...)`block inside`postOneArticle()`
    - Call `publishVideo({ ig: igPost, fb: fbPost }, stagedVideoUrl, coverImageUrl?)` instead
    - Log the post with `postType: "video"` on success
    - Keep the existing `publish()` image path for non-video articles unchanged
    - _Requirements: 3.2, 3.3, 3.5_

  - [ ]\* 4.4 Write property test for automate pipeline video routing
    - **Property 3: Automate pipeline video routing**
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 5. Verify /api/post-video/route.ts correctness (no functional changes expected)
  - Confirm request validation returns HTTP 400 for missing `url`, `headline`, or `caption`
  - Confirm IG post uses `media_type: "REELS"` and `video_url`
  - Confirm FB post uses `/{pageId}/videos` with `file_url`
  - Confirm staged video is deleted fire-and-forget after posting
  - If any of the above are wrong, fix them; otherwise leave the file unchanged
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 6. Verify Composer VideoTab UX in src/app/composer/page.tsx
  - Confirm Post button is disabled when `url`, `headline`, or `caption` is empty
  - Confirm button label shows `"Posting video... (~60s)"` while `status === "loading"`
  - Confirm button is disabled while `status === "loading"` (prevents duplicate submissions)
  - Confirm `PostResult` shows success with platform post IDs or error state correctly
  - If any of the above are wrong, fix them; otherwise leave the file unchanged
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 7. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Property tests use fast-check; mock `fetch` to capture Graph API request payloads
- The existing `publish()` function and all image-posting callers are untouched
- `/api/post-video` is already correct — task 5 is a verification step only
- Staged video cleanup (fire-and-forget DELETE to CF Worker) remains the caller's responsibility
