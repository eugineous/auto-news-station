# Requirements: Entertainment Reach Engine

## Overview

PPP TV Kenya needs a comprehensive content automation and reach-maximization system that positions it as the top entertainment brand for Kenyan and global audiences. The system enforces a 70/20/10 content mix strategy, manages recurring branded series, and optimizes every post for each social platform.

---

## User Stories

### 1. Content Mix Orchestration

**As a** content operator,
**I want** the automation system to enforce a 70/20/10 content mix (70% viral clips, 20% recurring series, 10% feature videos),
**So that** the channel maintains a consistent, high-performing content rhythm without manual intervention.

#### Acceptance Criteria

- 1.1: The system tracks daily post counts per content type (viral_clip, series, feature_video) in Supabase.
- 1.2: Each cron cycle selects the pipeline type that is most under-represented relative to its target ratio.
- 1.3: When a series is due (within ±30 minutes of its scheduled EAT time), it takes priority over the ratio calculation.
- 1.4: If a series or feature video is unavailable, the system falls back to the viral clip pipeline.
- 1.5: The mix budget is tracked over a rolling 7-day window, not just per-day.
- 1.6: The system skips posting during the dead zone (1am–5am EAT).
- 1.7: A distributed lock prevents concurrent cron runs from double-posting.

#### Correctness Properties

- **P1.1**: For any mix budget state, `selectPipeline()` always returns one of `["viral_clip", "series", "feature_video"]`.
- **P1.2**: For any `dailyTarget > 0`, `targets.viral_clip + targets.series + targets.feature_video <= dailyTarget`.
- **P1.3**: The system never publishes more than one post per cron invocation.

---

### 2. Recurring Series Engine

**As a** content operator,
**I want** the system to automatically generate and publish recurring branded series (e.g. "Street Question Friday", "Meme of the Day"),
**So that** followers have predictable, appointment-style content that builds loyalty.

#### Acceptance Criteria

- 2.1: The system supports 10 pre-defined series formats stored in Supabase `series_formats` table.
- 2.2: Each series format defines: name, emoji, cadence (daily/weekly), day of week, EAT posting time, content type, tone, hashtag set, platforms, template prompt, cover style, and source keywords.
- 2.3: The Series Engine fetches source content matching the series keywords, filtered to the last 48 hours.
- 2.4: If no recent source content is found, the engine falls back to broader category search.
- 2.5: The engine generates an AI caption using the series tone and template prompt.
- 2.6: The engine generates a branded cover image in the series cover style.
- 2.7: Series posts are logged to `series_post_log` with format ID, week number, and publish results.
- 2.8: `lastPostedAt` and `totalPosts` are updated on the `series_formats` record after each publish.
- 2.9: A misconfigured series (empty `templatePrompt` or `sourceKeywords`) is skipped and marked `active = false`.

#### Correctness Properties

- **P2.1**: For any valid `SeriesFormat`, `getNextSeriesTime()` always returns a future Date.
- **P2.2**: `getNextDueSeries(now)` only returns formats where `active = true`.
- **P2.3**: `publishSeriesPost()` never throws — all errors are wrapped in the result object.

---

### 3. Platform Optimizer

**As a** content operator,
**I want** every post to be automatically optimized for each target platform (TikTok, Instagram, Facebook, YouTube),
**So that** captions, hashtags, aspect ratios, and posting times are always platform-appropriate.

#### Acceptance Criteria

- 3.1: The optimizer produces one `PlatformPost` per target platform from a single content item.
- 3.2: Instagram captions are kept short (≤150 chars optimal); hashtags go in the first comment (5–10 tags).
- 3.3: TikTok captions include a hook and max 5 hashtags inline.
- 3.4: Facebook captions include the source URL and 3–5 hashtags inline.
- 3.5: YouTube descriptions include 5–8 tags and are up to 5,000 chars.
- 3.6: Each platform post's `scheduledAt` is set to the next optimal EAT posting window for that platform.
- 3.7: Aspect ratio is set per platform: TikTok/IG Reels/YT Shorts = 9:16; YT long-form = 16:9; IG feed = 1:1.
- 3.8: Caption length never exceeds the platform maximum (IG=2200, FB=63206, TT=2200, YT=5000).

#### Correctness Properties

- **P3.1**: For any `platform` and `ContentItem`, `buildCaption()` output length ≤ `PLATFORM_CONFIGS[platform].maxCaptionLength`.
- **P3.2**: For any `platform` and `ContentItem`, hashtag count ≤ `PLATFORM_CONFIGS[platform].maxHashtags`.
- **P3.3**: `optimizeForPlatforms()` always returns exactly one `PlatformPost` per platform in the input array.

---

### 4. Viral Score Engine (Entertainment Categories)

**As a** content operator,
**I want** the viral scoring system to understand all entertainment categories with Kenya-first weighting,
**So that** the most relevant and timely content is always selected for posting.

#### Acceptance Criteria

- 4.1: The system supports 13 entertainment categories: COMEDY, MUSIC, DANCE, FASHION, SPORTS_BANTER, POP_CULTURE, STREET_CONTENT, CELEBRITY, MEMES, VIRAL_TRENDS, TV_FILM, INFLUENCERS, EAST_AFRICA.
- 4.2: Kenyan content receives a +25 boost to `kenyaRelevance` score before weighting.
- 4.3: Content older than 48 hours receives `recency = 0`.
- 4.4: The total viral score is a weighted average: recency×0.35 + engagement×0.30 + kenyaRelevance×0.20 + categoryHeat×0.10 + trendMatch×0.05.
- 4.5: All score fields are clamped to [0, 100].
- 4.6: The engine ranks up to 100 candidates per cycle to stay within Vercel's timeout limits.

#### Correctness Properties

- **P4.1**: For any `ContentItem`, all fields of `ViralScore` are in range [0, 100].
- **P4.2**: For any `ContentItem` with `publishedAt` older than 48h, `scoreContent().recency === 0`.
- **P4.3**: For any Kenyan `ContentItem`, `kenyaRelevance` is at least 25 points higher than the same item without Kenya signals.

---

### 5. Series Manager UI

**As a** content operator,
**I want** a UI to create, edit, pause, and delete series formats,
**So that** I can manage the recurring content calendar without touching the database directly.

#### Acceptance Criteria

- 5.1: The Series Manager page lists all series formats with name, cadence, next scheduled time, and active status.
- 5.2: Operators can create a new series format via a form with all required fields.
- 5.3: Operators can edit any field of an existing series format.
- 5.4: Operators can toggle a series active/inactive.
- 5.5: Operators can manually trigger a series post for any format.
- 5.6: The page is protected by the existing auth middleware.
- 5.7: Validation errors (empty templatePrompt, missing sourceKeywords, invalid timeEAT) are shown inline.

---

### 6. Reach Intelligence Dashboard

**As a** content operator,
**I want** the intelligence dashboard to show mix health, series performance, and platform reach breakdowns,
**So that** I can see at a glance whether the content strategy is on track.

#### Acceptance Criteria

- 6.1: The dashboard shows a mix health panel with actual vs target percentages for all three content types.
- 6.2: The dashboard shows a recommendation string when any content type is more than 5% off target.
- 6.3: The dashboard shows per-series performance: total posts, last posted, and post frequency.
- 6.4: The dashboard shows a platform reach breakdown for the last 7 and 30 days.
- 6.5: The dashboard shows top-performing entertainment categories ranked by post count and engagement.
- 6.6: Mix health data is refreshed on page load and can be manually refreshed.

---

### 7. API Endpoints

**As a** system operator,
**I want** secure API endpoints for mix health reporting and manual series triggering,
**So that** external tools and the UI can interact with the engine programmatically.

#### Acceptance Criteria

- 7.1: `POST /api/series/trigger` accepts `{ formatId, platforms }` and publishes the series immediately.
- 7.2: `GET /api/mix-health?days=N` returns a `MixHealthReport` for the last N days.
- 7.3: Both endpoints require `Authorization: Bearer <AUTOMATE_SECRET>` header.
- 7.4: Both endpoints return structured JSON error responses on failure.
- 7.5: `POST /api/series/trigger` returns `{ posted, series, platforms, result }`.

---

### 8. Database Schema

**As a** developer,
**I want** the required Supabase tables created with correct schema and indexes,
**So that** the engine has reliable persistent storage for series formats, mix budgets, and post logs.

#### Acceptance Criteria

- 8.1: `series_formats` table stores all series format fields with `id` as primary key.
- 8.2: `mix_budget` table stores daily mix state keyed by date with upsert support.
- 8.3: `series_post_log` table stores each series post with format ID, week number, platforms, and result.
- 8.4: All three tables have appropriate indexes for common query patterns.
- 8.5: The 10 default series formats are seeded into `series_formats` on migration.
