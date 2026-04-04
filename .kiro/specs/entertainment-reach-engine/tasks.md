# Tasks: Entertainment Reach Engine

## Task List

- [x] 1. Database Schema & Migrations
  - [x] 1.1 Create `series_formats` Supabase table with all SeriesFormat fields and primary key on `id`
  - [x] 1.2 Create `mix_budget` Supabase table with date as primary key and upsert support
  - [x] 1.3 Create `series_post_log` Supabase table with format_id, week_number, platforms, result fields
  - [x] 1.4 Add indexes on `series_formats(active, cadence)`, `mix_budget(date)`, `series_post_log(format_id, created_at)`
  - [x] 1.5 Seed the 10 default series formats into `series_formats`

- [x] 2. Viral Score Engine — Entertainment Categories
  - [x] 2.1 Add `EntertainmentCategory` type (13 categories) to `src/lib/viral-intelligence.ts`
  - [x] 2.2 Implement `getKenyaBoost()` — returns +25 for Kenyan content signals
  - [x] 2.3 Implement `getCategoryHeat()` — returns heat score per EntertainmentCategory
  - [x] 2.4 Update `calculateViralScore()` to use weighted formula: recency×0.35 + engagement×0.30 + kenyaRelevance×0.20 + categoryHeat×0.10 + trendMatch×0.05
  - [x] 2.5 Clamp all score fields to [0, 100]; set recency=0 for content older than 48h
  - [x] 2.6 Implement `rankBatch()` — ranks up to 100 candidates by total viral score
  - [x] 2.7 Write property-based tests (fast-check) for scoreContent: all fields in [0,100], recency=0 after 48h, Kenya boost ≥25

- [x] 3. Content Mix Orchestrator (`src/lib/content-mix.ts`)
  - [x] 3.1 Implement `getMixBudget(date)` — reads from `mix_budget` table, returns zero-state on error
  - [x] 3.2 Implement `updateBudget(date, type)` — upserts mix_budget row atomically
  - [x] 3.3 Implement `selectPipeline(budget)` — returns ContentType based on deficit calculation and series due check
  - [x] 3.4 Implement `getDailyMixReport(date)` — returns actual vs target percentages with recommendation string
  - [x] 3.5 Enforce rolling 7-day window logic in mix health calculation
  - [x] 3.6 Write property-based tests: selectPipeline always returns valid ContentType, targets sum ≤ dailyTarget

- [x] 4. Series Engine (`src/lib/series-engine.ts`)
  - [x] 4.1 Implement `getActiveSeriesFormats()` — fetches from Supabase with 5-minute in-memory cache
  - [x] 4.2 Implement `getNextDueSeries(now)` — returns format due within ±30 min of now in EAT, overdue first
  - [x] 4.3 Implement `generateSeriesPost(format)` — fetch keywords → filter 48h → rank → AI caption → cover image
  - [x] 4.4 Implement fallback to broader category search when keyword fetch returns empty
  - [x] 4.5 Implement `logSeriesPost(formatId, post)` — writes to series_post_log, updates lastPostedAt and totalPosts
  - [x] 4.6 Implement `getSeriesHistory(formatId, limit)` — reads from series_post_log
  - [x] 4.7 Validate series format on load — mark active=false and log error if templatePrompt or sourceKeywords empty
  - [x] 4.8 Write property-based tests: getNextSeriesTime always returns future Date, getNextDueSeries only returns active formats

- [x] 5. Platform Optimizer (`src/lib/platform-optimizer.ts`)
  - [x] 5.1 Define `PLATFORM_CONFIGS` constant with maxCaptionLength, maxHashtags, optimalHashtags, peakHoursEAT, aspectRatio, hashtagStyle for all 4 platforms
  - [x] 5.2 Implement `buildCaption(content, platform)` — platform-specific caption with correct length truncation
  - [x] 5.3 Implement `selectHashtags(category, platform)` — returns platform-appropriate hashtag list
  - [x] 5.4 Implement `getBestPostingTime(platform, category)` — returns next optimal EAT hour
  - [x] 5.5 Implement `getAspectRatio(platform, contentType)` — returns correct AspectRatio enum value
  - [x] 5.6 Implement `optimize(content, platforms)` — runs all optimizations in parallel via Promise.all
  - [x] 5.7 Instagram: put hashtags in firstComment field, keep caption ≤150 chars optimal
  - [x] 5.8 TikTok: inject hook, max 5 hashtags inline
  - [x] 5.9 Facebook: append sourceUrl and 3–5 hashtags inline
  - [x] 5.10 YouTube: build full description with 5–8 tags, up to 5000 chars
  - [x] 5.11 Write property-based tests: caption length ≤ maxCaptionLength, hashtag count ≤ maxHashtags for all platforms

- [x] 6. Main Automate Route — Mix Orchestrator Integration
  - [x] 6.1 Update `src/app/api/automate/route.ts` to call `getMixBudget()` at start of each cycle
  - [x] 6.2 Call `selectPipeline(budget)` to route to series, feature video, or viral clip pipeline
  - [x] 6.3 Integrate series pipeline: call `getNextDueSeries()` → `generateSeriesPost()` → `publishSeriesPost()`
  - [x] 6.4 Call `optimizeForPlatforms()` before publishing viral clips and feature videos
  - [x] 6.5 Call `updateBudget()` after each successful publish
  - [x] 6.6 Skip cycle during dead zone (1am–5am EAT)
  - [x] 6.7 Ensure distributed lock (Cloudflare KV) prevents concurrent runs

- [~] 7. Series Trigger API (`src/app/api/series/trigger/route.ts`)
  - [ ] 7.1 Create POST handler accepting `{ formatId, platforms }`
  - [ ] 7.2 Validate Bearer token against AUTOMATE_SECRET
  - [ ] 7.3 Fetch series format by ID, return 404 if not found
  - [ ] 7.4 Call `generateSeriesPost()` and `publishSeriesPost()`
  - [ ] 7.5 Return `{ posted, series, platforms, result }` JSON response
  - [ ] 7.6 Return structured JSON error on all failure paths

- [~] 8. Mix Health API (`src/app/api/mix-health/route.ts`)
  - [ ] 8.1 Create GET handler accepting `?days=N` query param (default 7)
  - [ ] 8.2 Validate Bearer token against AUTOMATE_SECRET
  - [ ] 8.3 Call `getDailyMixReport()` for the requested period
  - [ ] 8.4 Return `MixHealthReport` JSON with actual percentages, onTarget bool, and recommendation string

- [~] 9. Series Manager UI (`src/app/series/page.tsx`)
  - [ ] 9.1 Create page with auth guard (redirect to /login if unauthenticated)
  - [ ] 9.2 Fetch and display all series formats in a table: name, cadence, next scheduled time, active status
  - [ ] 9.3 Implement toggle active/inactive per series format
  - [ ] 9.4 Implement "Trigger Now" button that calls POST /api/series/trigger
  - [ ] 9.5 Implement create new series format form with all required fields and inline validation
  - [ ] 9.6 Implement edit existing series format (inline or modal)
  - [ ] 9.7 Show validation errors inline for empty templatePrompt, missing sourceKeywords, invalid timeEAT

- [~] 10. Reach Intelligence Dashboard Extensions (`src/app/intelligence/page.tsx`)
  - [ ] 10.1 Add Mix Health panel: bar chart showing actual vs target % for viral_clip, series, feature_video
  - [ ] 10.2 Show recommendation string when any type is >5% off target
  - [ ] 10.3 Add Series Performance panel: table with series name, total posts, last posted, frequency
  - [ ] 10.4 Add Platform Reach Breakdown panel: per-platform post counts for last 7 and 30 days
  - [ ] 10.5 Add Top Entertainment Categories panel: ranked by post count
  - [ ] 10.6 Add manual refresh button that re-fetches mix health data
  - [ ] 10.7 All new panels use existing dashboard UI component patterns (cards, pills, charts)

- [~] 11. Property-Based Test Suite
  - [ ] 11.1 Install fast-check as dev dependency
  - [ ] 11.2 Write PBT for `selectPipeline`: for any MixBudget, always returns valid ContentType
  - [ ] 11.3 Write PBT for `scoreContent`: all ViralScore fields always in [0, 100]
  - [ ] 11.4 Write PBT for `buildCaption`: output length always ≤ maxCaptionLength per platform
  - [ ] 11.5 Write PBT for `selectHashtags`: count always ≤ maxHashtags per platform
  - [ ] 11.6 Write PBT for `getMixBudget`: targets always sum to ≤ dailyTarget for any dailyTarget > 0
  - [ ] 11.7 Write PBT for `getNextSeriesTime`: always returns a future Date for any valid SeriesFormat
