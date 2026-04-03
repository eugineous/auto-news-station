# Requirements Document

## Introduction

This spec covers a combined set of bugfixes and new features for PPP TV Kenya, a Next.js social media automation app that posts videos to Instagram and Facebook. The work falls into two areas:

1. **Bugfixes** — five confirmed defects across the Composer, Cockpit, Competitors, Trends, and Dashboard pages that prevent core functionality from working correctly.
2. **New Features** — a Mutembei TV Facebook video scraper, a continuous video stream guarantee, and Twitter/X trends via Nitter RSS.

The system consists of a Next.js frontend, a set of Next.js API routes, a Cloudflare Worker (`auto-ppp-tv.euginemicah.workers.dev`), Supabase for dedup/logging, and Cloudflare R2 for video staging.

---

## Glossary

- **Composer**: The `/composer` page; contains the ComposeTab and CockpitTab components.
- **ComposeTab**: The manual video posting UI inside the Composer page.
- **CockpitTab**: The autonomous posting monitor UI inside the Composer page.
- **Pipeline**: The `/api/automate-video` route — the autonomous video posting pipeline.
- **Worker**: The Cloudflare Worker at `auto-ppp-tv.euginemicah.workers.dev`.
- **Post_Log**: The persistent log of all posts, stored in Supabase and readable via `/api/post-log`.
- **SSE**: Server-Sent Events — the streaming protocol used by `/api/post-video` to report progress.
- **R2**: Cloudflare R2 object storage used to stage videos before posting to Instagram/Facebook.
- **Mutembei_TV**: The Facebook page at `https://www.facebook.com/MutembeiTV`, a Kenyan news video source.
- **Nitter**: A privacy-respecting Twitter/X frontend that exposes RSS feeds of public accounts and trends.
- **Video_Sources**: The `src/lib/video-sources.ts` module that aggregates video content from 20+ sources.
- **post_type**: The field in the Post_Log that identifies a log entry as a video post (value: `"video"`).
- **EARS**: Easy Approach to Requirements Syntax — the pattern used for all acceptance criteria.

---

## Requirements

### Requirement 1: Composer "Post Video" Button Must Work

**User Story:** As a content operator, I want the "Post Video" button in the Composer to successfully post a video to Instagram and Facebook, so that I can manually publish content without it silently failing.

#### Acceptance Criteria

1. WHEN the user clicks "Post Video to IG + FB" and `url`, `headline`, and `caption` are all non-empty, THE ComposeTab SHALL initiate a POST request to `/api/post-video` and begin reading the SSE stream.
2. WHILE the SSE stream is being read, THE ComposeTab SHALL call `onProgress(pct, step)` for every `data:` event received, updating the ProgressPanel in real time.
3. IF the fetch to `/api/post-video` returns a non-2xx HTTP status or the response body is null, THEN THE ComposeTab SHALL set `status` to `"error"` and display the HTTP status code as the error message.
4. IF a parsed SSE event contains `done: true` and `success: false`, THEN THE ComposeTab SHALL set `status` to `"error"` and display the `error` field from the event to the user.
5. IF a parsed SSE event contains `done: true` and `success: true`, THEN THE ComposeTab SHALL set `status` to `"success"` and display the Instagram and Facebook post IDs.
6. WHEN the button is in `status === "posting"` state, THE ComposeTab SHALL disable the button and show a spinner with the label "Posting to IG + FB (~60s)…".
7. THE ComposeTab SHALL disable the "Post Video" button when any of `url`, `headline`, or `caption` is empty or whitespace-only.

---

### Requirement 2: Cockpit Auto-Post Must Include Authorization Header

**User Story:** As a content operator, I want the Cockpit's autonomous posting to actually trigger the video pipeline, so that the system posts videos on schedule without manual intervention.

#### Acceptance Criteria

1. WHEN `triggerAutoPost()` is called in CockpitTab, THE CockpitTab SHALL include the HTTP header `Authorization: Bearer ppptvWorker2024` in the POST request to `/api/automate-video`.
2. THE `/api/automate-video` route SHALL accept `Authorization: Bearer ppptvWorker2024` as a valid credential.
3. IF the POST to `/api/automate-video` returns HTTP 401, THEN THE CockpitTab SHALL display a toast with the message "Auto-post failed: Unauthorized" and set `autoPosting` to `false`.
4. WHILE the `autoPost` toggle is enabled, THE CockpitTab SHALL call `triggerAutoPost()` every 12 minutes via `setInterval`.
5. WHEN `triggerAutoPost()` completes successfully, THE CockpitTab SHALL refresh the post log and display a toast with the title of the newly posted video.

---

### Requirement 3: Competitors Page Must Display YouTube Posts

**User Story:** As a content strategist, I want the Competitors page to show recent videos from competitor YouTube channels, so that I can monitor what topics they are covering.

#### Acceptance Criteria

1. WHEN the Competitors page mounts, THE CompetitorsPage SHALL call `loadCompetitor` for the first competitor in the list and display a loading spinner while the fetch is in progress.
2. WHEN `fetchYouTubeFeed` is called with a valid YouTube channel ID, THE CompetitorsPage SHALL fetch `/api/competitors/feed?channelId={channelId}` and parse the returned Atom XML into `CompetitorPost` objects.
3. IF `/api/competitors/feed` returns a non-2xx response or throws a network error, THEN THE CompetitorsPage SHALL display "No posts loaded yet" for that competitor rather than showing a blank or broken state.
4. THE `/api/competitors/feed` route SHALL proxy the YouTube Atom feed at `https://www.youtube.com/feeds/videos.xml?channel_id={channelId}` and return the raw XML with `Content-Type: application/xml`.
5. IF the YouTube feed fetch times out after 10 seconds, THEN THE `/api/competitors/feed` route SHALL return HTTP 502 with a JSON error body `{ "error": "Failed to fetch YouTube feed" }`.
6. WHEN a competitor's feed is successfully loaded, THE CompetitorsPage SHALL display up to 10 posts with title, thumbnail, relative publish time, and a "Cover This" link.

---

### Requirement 4: Trends Page Must Show Real Data for All Sources

**User Story:** As a content strategist, I want the Trends page to show real trending topics from Twitter/X, YouTube, and Reddit, so that I can identify what to post about.

#### Acceptance Criteria

1. WHEN the Trends page requests `source=twitter`, THE `/api/trends/[source]` route SHALL fetch trending topics from at least one public Nitter RSS feed and return a non-empty `trends` array.
2. THE Nitter_Fetcher SHALL attempt Nitter instances in this order: `nitter.poast.org`, `nitter.privacydev.net`, `nitter.net`, falling back to the next instance if the current one times out or returns a non-2xx response.
3. WHEN a Nitter RSS feed is successfully fetched, THE Nitter_Fetcher SHALL parse each `<item>` into a trend object with `title`, `url`, `source: "twitter"`, and a non-zero `volume` derived from the item's position or engagement data.
4. IF all Nitter instances fail, THEN THE `/api/trends/[source]` route SHALL return a static fallback list of Kenya-focused Twitter topics with `source: "twitter-fallback"`.
5. WHEN the Trends page requests `source=youtube`, THE `/api/trends/[source]` route SHALL fetch the RSS feed for each of the 5 configured YouTube channels and return up to 20 trend items with real `title` and `url` values.
6. THE YouTube_Trend_Fetcher SHALL use a `volume` value derived from the video's recency (hours since publish) rather than `Math.random()`, so that volume scores are deterministic and reproducible.
7. WHEN the Trends page requests `source=reddit`, THE `/api/trends/[source]` route SHALL fetch the hot posts from each configured subreddit and return trend items with `volume` equal to the Reddit post's `score` field.
8. IF a Reddit subreddit fetch returns HTTP 429 (rate limited), THEN THE Reddit_Fetcher SHALL skip that subreddit and continue with the remaining ones, returning whatever results are available.

---

### Requirement 5: Dashboard Video Count Must Reflect Actual Video Posts

**User Story:** As a content operator, I want the Dashboard to show the correct number of videos posted today, so that I can track daily output accurately.

#### Acceptance Criteria

1. THE `/api/post-video` route SHALL log each successful post with the field `post_type: "video"` (snake_case) in the Post_Log entry.
2. THE `/api/automate-video` route SHALL log each successful post with the field `post_type: "video"` (snake_case) in the Post_Log entry.
3. WHEN the Dashboard reads the Post_Log, THE Dashboard SHALL count a post as a video if `p.post_type === "video"` OR `p.postType === "video"`, so that both legacy and new log entries are counted.
4. THE Dashboard SHALL display the video count as "🎬 Videos {n} today" where `n` is the count of video posts whose `posted_at` or `postedAt` timestamp falls within the current calendar day.

---

### Requirement 6: Mutembei TV Facebook Video Scraper

**User Story:** As a content operator, I want the system to automatically scrape, rebrand, and post all videos from the Mutembei TV Facebook page, so that PPP TV Kenya can cover Kenyan news stories sourced from Mutembei TV without manual effort.

#### Acceptance Criteria

1. THE Video_Sources module SHALL include Mutembei TV as a named video source with `sourceName: "Mutembei TV"`, `sourceType: "facebook"`, and `category: "ENTERTAINMENT"`.
2. WHEN the Mutembei_TV_Scraper is invoked, THE Mutembei_TV_Scraper SHALL attempt to retrieve the list of public videos from `https://www.facebook.com/MutembeiTV` using the Facebook Graph API endpoint `/{page-id}/videos?fields=id,title,description,source,created_time&access_token={token}`.
3. IF the Facebook Graph API token is not configured, THEN THE Mutembei_TV_Scraper SHALL fall back to scraping the public Facebook page's video tab using an HTTP GET with a browser User-Agent and parsing `<meta>` and JSON-LD data for video URLs.
4. FOR EACH video returned by the Mutembei_TV_Scraper, THE Pipeline SHALL check whether the video ID has been marked as seen in Supabase before processing it.
5. WHEN a Mutembei TV video has not been seen before, THE Pipeline SHALL download the video, generate a branded PPP TV cover image using `generateImage`, paraphrase the original caption in professional news style using both Nvidia and Gemini AI, and append `"Source: Mutembei TV"` to the generated caption.
6. THE AI_Paraphraser SHALL rewrite the original Mutembei TV caption to remove sensationalism, use professional news language, and keep the core factual content intact.
7. WHEN a Mutembei TV video is successfully posted to Instagram and Facebook, THE Pipeline SHALL mark the video ID as seen in Supabase to prevent duplicate posts.
8. THE Mutembei_TV_Scraper SHALL return videos sorted by `created_time` descending so that the most recent videos are processed first.
9. WHERE the Facebook Graph API is available, THE Mutembei_TV_Scraper SHALL use paginated requests to retrieve ALL available videos, not just the most recent page.

---

### Requirement 7: Continuous Video Stream — Pipeline Must Always Find Videos

**User Story:** As a content operator, I want the autonomous video pipeline to always find at least one video to post per run, so that PPP TV Kenya maintains a continuous posting cadence.

#### Acceptance Criteria

1. WHEN the Pipeline runs and finds no resolvable videos from primary sources, THE Pipeline SHALL attempt to fetch videos from Mutembei TV as a fallback source before returning "No resolvable videos found".
2. THE Cloudflare Worker's `/trigger` endpoint SHALL call `/api/automate-video` (not `/api/automate`) when triggered, so that the video pipeline is invoked on each cron tick.
3. WHEN the Cloudflare Worker cron fires (every 10 minutes), THE Worker SHALL call `triggerAutomateWithLock` which SHALL invoke the Next.js `/api/automate-video` endpoint with the `Authorization: Bearer ppptvWorker2024` header.
4. THE Pipeline SHALL prioritize Mutembei TV videos over other sources by assigning them a viral score boost of at least 30 points.
5. IF the Pipeline has already posted a video from Mutembei TV in the last 60 minutes, THEN THE Pipeline SHALL skip Mutembei TV as the fallback and return the standard "No resolvable videos found" response to avoid duplicate sourcing.
6. THE Video_Sources module SHALL export Mutembei TV as part of the `fetchAllVideoSources` function's source list so it is included in every pipeline run.

---

### Requirement 8: Twitter/X Trends via Nitter RSS

**User Story:** As a content strategist, I want the Trends page to show real Twitter/X trending topics relevant to Kenya, so that I can identify viral conversations to cover.

#### Acceptance Criteria

1. THE `/api/trends/[source]` route SHALL handle `source=twitter` by calling the Nitter_Fetcher and returning a `trends` array with at least 1 item when any Nitter instance is reachable.
2. THE Nitter_Fetcher SHALL fetch RSS feeds from Kenya-focused Twitter accounts including at minimum: `@citizentvkenya`, `@ntvkenya`, `@tukokenya`, `@nairobinews`, and `@spmbuzz`.
3. WHEN a Nitter RSS item is parsed, THE Nitter_Fetcher SHALL extract the tweet text as `title`, the tweet URL as `url`, set `source: "twitter"`, and set `volume` to a value between 1 and 100000 based on the item's position in the feed (first item = highest volume).
4. THE Nitter_Fetcher SHALL deduplicate trend items by normalising the `title` to lowercase and removing punctuation before comparing, so that near-identical tweets from different accounts are not returned as separate trends.
5. IF a Nitter instance returns an HTTP error or times out after 5 seconds, THEN THE Nitter_Fetcher SHALL log the failure and try the next configured instance without throwing an unhandled exception.
6. THE `/api/trends/[source]` route SHALL return Twitter trends with `fetchedAt` set to the current ISO timestamp so the Trends page can display how recently the data was fetched.
