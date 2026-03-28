# Requirements Document

## Introduction

The Composer page currently has a `VideoTab` and `SocialImportTab` that correctly call `/api/post-video` to post videos to Instagram (as Reels) and Facebook (as videos). However, `publisher.ts` — the shared publish utility used by automated pipelines — only handles image posting. When an automated pipeline encounters an article with `isVideo: true`, it silently posts a branded thumbnail image instead of the actual video.

This feature fixes the gap by:

1. Adding a `publishVideo()` function to `publisher.ts` that posts to IG as REELS with `video_url` and to FB using the `/videos` endpoint with `file_url`
2. Updating automated pipelines (`/api/automate`) to route to `publishVideo()` when `article.isVideo` is true
3. Confirming the Composer's `VideoTab` and `SocialImportTab` are already correct and require no functional changes

## Glossary

- **Publisher**: The `src/lib/publisher.ts` module — shared utility for posting content to social platforms
- **publishVideo**: New function in Publisher that handles video posting (IG Reels + FB video)
- **publish**: Existing function in Publisher that handles image posting (IG image + FB photo)
- **Automate_Pipeline**: The `/api/automate` route — automated article-to-social posting pipeline
- **PostVideo_API**: The `/api/post-video` route — handles manual video posting from the Composer
- **VideoTab**: The video posting tab in the Composer page (`src/app/composer/page.tsx`)
- **SocialImportTab**: The social import tab in the Composer page that resolves and reposts social media videos
- **R2**: Cloudflare R2 object storage used to stage videos at a public HTTPS URL for IG/FB to fetch
- **CF_Worker**: The Cloudflare Worker that proxies staging requests to R2
- **IG_Graph_API**: The Facebook Graph API v19.0 endpoints for Instagram
- **FB_Graph_API**: The Facebook Graph API v19.0 endpoints for Facebook Pages
- **Article**: The data model representing a scraped news article, with optional `videoUrl` and `isVideo` fields
- **StagedVideoUrl**: A temporary public HTTPS URL in R2 pointing to the video file, accessible by IG and FB servers

---

## Requirements

### Requirement 1: publishVideo() Function in publisher.ts

**User Story:** As an automated pipeline, I want to call a dedicated video publish function, so that video articles are posted as actual videos (not images) to Instagram and Facebook.

#### Acceptance Criteria

1. THE Publisher SHALL export a `publishVideo()` function that accepts `posts: { ig?: SocialPost; fb?: SocialPost }`, a `stagedVideoUrl: string`, and an optional `coverImageUrl: string`
2. WHEN `publishVideo()` is called with a valid `stagedVideoUrl`, THE Publisher SHALL post to Instagram using `media_type: "REELS"` and `video_url: stagedVideoUrl` (not `image_url`)
3. WHEN `publishVideo()` is called with a valid `stagedVideoUrl`, THE Publisher SHALL post to Facebook using the `/{pageId}/videos` endpoint with `file_url: stagedVideoUrl` (not `/{pageId}/photos`)
4. WHEN `publishVideo()` is called and `coverImageUrl` is provided, THE Publisher SHALL include `cover_url: coverImageUrl` in the Instagram Reels container payload
5. WHEN `publishVideo()` is called and Instagram credentials (`INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_ACCOUNT_ID`) are not configured, THE Publisher SHALL return `{ success: false, error: "Instagram tokens not configured" }` for the Instagram result
6. WHEN `publishVideo()` is called and Facebook credentials (`FACEBOOK_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`) are not configured, THE Publisher SHALL return `{ success: false, error: "Facebook tokens not configured" }` for the Facebook result
7. WHEN `publishVideo()` is called, THE Publisher SHALL run the Instagram and Facebook posts concurrently using `Promise.all()`
8. THE Publisher SHALL return a `PublishResult` object with `instagram` and `facebook` fields from `publishVideo()`

### Requirement 2: Instagram Reel Container Polling in publishVideo()

**User Story:** As the system, I want to wait for Instagram to finish processing the video before publishing, so that the publish call does not fail due to an unready container.

#### Acceptance Criteria

1. WHEN an Instagram Reels container is created, THE Publisher SHALL poll the container's `status_code` field every 3 seconds before calling `media_publish`
2. WHEN the container `status_code` is `"FINISHED"`, THE Publisher SHALL proceed to call `media_publish`
3. IF the container `status_code` is `"ERROR"` or `"EXPIRED"`, THEN THE Publisher SHALL stop polling and return `{ success: false, error: "IG container failed: <status>" }` without calling `media_publish`
4. IF the container polling times out after 45 seconds without reaching `"FINISHED"`, THEN THE Publisher SHALL attempt to call `media_publish` anyway and log a warning

### Requirement 3: Automate Pipeline Video Routing

**User Story:** As the automated posting system, I want to detect video articles and route them to the video publish path, so that video content is posted as videos rather than images.

#### Acceptance Criteria

1. WHEN the Automate_Pipeline processes an `Article` where `isVideo` is `true` and `videoUrl` is a non-empty string, THE Automate_Pipeline SHALL stage the video URL in R2 before posting
2. WHEN the Automate_Pipeline processes an `Article` where `isVideo` is `true` and `videoUrl` is a non-empty string, THE Automate_Pipeline SHALL call `publishVideo()` instead of `publish()`
3. WHEN the Automate_Pipeline processes an `Article` where `isVideo` is `false` or `videoUrl` is absent, THE Automate_Pipeline SHALL call `publish()` (the image path) unchanged
4. WHEN the Automate_Pipeline stages a video and staging fails, THE Automate_Pipeline SHALL fall back to calling `publish()` with the generated image buffer and log a warning
5. WHEN the Automate_Pipeline successfully posts a video article via `publishVideo()`, THE Automate_Pipeline SHALL log the post with `postType: "video"`

### Requirement 4: /api/post-video Route Correctness (Existing Behavior Preserved)

**User Story:** As a Composer user, I want the video posting API to continue posting videos correctly, so that manual posts from VideoTab and SocialImportTab work as expected.

#### Acceptance Criteria

1. WHEN PostVideo_API receives a POST request with `url`, `headline`, and `caption`, THE PostVideo_API SHALL resolve the URL to a direct MP4 URL and stage it in R2
2. WHEN the video is staged, THE PostVideo_API SHALL post to Instagram using `media_type: "REELS"` and `video_url` pointing to the StagedVideoUrl
3. WHEN the video is staged, THE PostVideo_API SHALL post to Facebook using `/{pageId}/videos` with `file_url` pointing to the StagedVideoUrl
4. WHEN the post completes (success or failure on each platform), THE PostVideo_API SHALL delete the staged video from R2 as a fire-and-forget operation
5. WHEN PostVideo_API receives a request missing `url`, `headline`, or `caption`, THE PostVideo_API SHALL return HTTP 400 with a descriptive error message
6. IF video staging fails, THEN THE PostVideo_API SHALL return HTTP 500 with an error message

### Requirement 5: Composer UI Video Post Flow

**User Story:** As a content editor, I want to post a video from the Composer and see clear success or failure feedback, so that I know whether the post reached Instagram and Facebook.

#### Acceptance Criteria

1. WHEN VideoTab has a non-empty `url`, `headline`, and `caption`, THE VideoTab SHALL enable the Post button
2. WHEN the Post button is clicked, THE VideoTab SHALL set status to `"loading"` and disable the button to prevent duplicate submissions
3. WHEN PostVideo_API returns a response where `instagram.success` or `facebook.success` is `true`, THE VideoTab SHALL display a success status with the platform post IDs
4. WHEN PostVideo_API returns a response where both `instagram.success` and `facebook.success` are `false`, THE VideoTab SHALL display an error status
5. WHILE a post is in progress, THE VideoTab SHALL display the label "Posting video... (~60s)" on the Post button
