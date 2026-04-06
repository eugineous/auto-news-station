# Requirements Document

## Introduction

PPP TV Kenya is a Next.js 14 autonomous social media station deployed on Vercel (project: `auto-news-station`) that posts entertainment, sports, music, and celebrity content to Instagram and Facebook 24/7 without human intervention. The system scrapes RSS feeds, generates AI-written headlines and captions via Gemini, produces branded thumbnail images, and publishes to both platforms on a cron schedule.

This overhaul addresses six critical production failures — silent Gemini errors, broken category rotation, broken deduplication, an unused Knowledge Base, poor thumbnail quality, and video scraping that only works by channel — plus raises the overall content quality to match the Gen Z Nairobi voice the brand requires.

## Glossary

- **System**: The full PPP TV Kenya auto-posting application (Next.js app + Cloudflare Worker)
- **Pipeline**: The automated sequence that scrapes → scores → deduplicates → generates AI content → publishes one post per cron tick
- **Gemini**: Google Gemini 2.0 Flash — the AI model used for headline and caption generation
- **Knowledge Base (KB)**: The editable set of brand, voice, and topic instructions stored in Supabase and loaded at runtime by the AI
- **Headline**: The 4–7 word ALL CAPS text overlaid on the thumbnail image
- **Caption**: The Instagram/Facebook post body text (under 180 words, Gen Z Nairobi voice)
- **Thumbnail**: The branded 1080×1350 (4:5) or 1080×1920 (9:16) image posted to the feed
- **Dedup**: The deduplication system that prevents the same article from being posted more than once
- **Category Rotation**: The logic that cycles through content categories (ENTERTAINMENT, SPORTS, MUSIC, CELEBRITY, etc.) across consecutive posts
- **Vercel Project**: `auto-news-station` — the production deployment (NOT `auto-news-station-1`)
- **Cloudflare Worker**: `auto-ppp-tv.euginemicah.workers.dev` — handles cron scheduling, KV state, R2 video staging
- **Supabase**: PostgreSQL + storage backend for post logs, dedup, Knowledge Base, and agent state
- **SUPABASE_SERVICE_KEY**: The service-role key required for server-side Supabase writes (bypasses RLS)
- **RLS**: Row Level Security — Supabase policy that blocks writes from the anon key
- **TikWM**: Third-party API used to fetch TikTok videos by account or keyword search
- **R2**: Cloudflare R2 object storage used to stage videos before posting
- **EAT**: East Africa Time (UTC+3) — the timezone used for all scheduling decisions
- **Gen Z Nairobi Voice**: Conversational, specific, culturally aware tone targeting 18–28 year old Nairobi audience

---

## Requirements

### Requirement 1: Correct Vercel Deployment Target

**User Story:** As the station operator, I want all code changes deployed to the correct Vercel project, so that fixes actually reach the live production site.

#### Acceptance Criteria

1. THE System SHALL use `auto-news-station` as the Vercel project name in `.vercel/project.json`, not `auto-news-station-1`
2. WHEN a deployment is triggered, THE System SHALL deploy to the project reachable at `auto-news-station.vercel.app`
3. IF `.vercel/project.json` contains `auto-news-station-1`, THEN THE System SHALL update it to `auto-news-station` before any other fix is deployed

---

### Requirement 2: Fix Gemini AI Integration

**User Story:** As the station operator, I want Gemini to reliably generate headlines and captions, so that posts never fall back to raw article titles.

#### Acceptance Criteria

1. WHEN `generateHeadline` is called, THE Gemini_Client SHALL use model `gemini-2.0-flash` with the `systemInstruction` field populated from the Knowledge Base `headline_guide` section
2. WHEN `generateCaption` is called, THE Gemini_Client SHALL use model `gemini-2.0-flash` with the `systemInstruction` field populated from the Knowledge Base `brand_voice`, `caption_guide`, `gen_z_guide`, and `kenya_knowledge` sections
3. THE Gemini_Client SHALL pass system instructions via the `config.systemInstruction` parameter of `client.models.generateContent`, not as a user-role message
4. IF the Gemini API returns an error or empty response, THEN THE System SHALL log the full error message and fall back to a structured template caption (not the raw article title)
5. THE System SHALL validate that the generated headline is between 6 and 100 characters before accepting it; IF the headline fails validation, THEN THE System SHALL retry once before using the fallback
6. THE System SHALL validate that the generated caption is at least 50 characters before accepting it; IF the caption fails validation, THEN THE System SHALL retry once before using the fallback

---

### Requirement 3: Fix Category Rotation

**User Story:** As the station operator, I want posts to cycle through all content categories, so that the feed is not dominated by a single category like SPORTS.

#### Acceptance Criteria

1. THE Category_Rotation_System SHALL maintain a persistent record of the last-posted category in Cloudflare KV via the `/last-category` endpoint
2. WHEN selecting the next article to post, THE Pipeline SHALL exclude articles in the same category as the last-posted category, provided at least one article in a different category is available
3. THE Pipeline SHALL cycle through the category order: ENTERTAINMENT → SPORTS → MUSIC → CELEBRITY → TV & FILM → MOVIES → LIFESTYLE → GENERAL → repeat
4. IF the `/last-category` KV endpoint returns an empty string or an error, THEN THE Pipeline SHALL treat the last category as unknown and select from all available categories
5. IF only articles from the last-posted category are available, THEN THE Pipeline SHALL post from that category rather than skipping the post entirely
6. WHEN a post succeeds, THE Pipeline SHALL immediately write the posted article's category to the `/last-category` KV endpoint

---

### Requirement 4: Fix Deduplication

**User Story:** As the station operator, I want the dedup system to reliably prevent the same article from being posted multiple times, so that followers never see the same story 5 times in a row.

#### Acceptance Criteria

1. THE Dedup_System SHALL use `SUPABASE_SERVICE_KEY` (service-role key) for all Supabase writes to `seen_articles` and `posts` tables, bypassing RLS
2. IF `SUPABASE_SERVICE_KEY` is not set in Vercel environment variables, THEN THE System SHALL log a warning on startup and fall back to Cloudflare KV dedup via the `/seen/check` and `/seen` endpoints
3. WHEN an article is selected for posting, THE Dedup_System SHALL mark it as seen in `seen_articles` BEFORE the publish call, not after
4. THE Dedup_System SHALL check both the article `id` (URL hash) and a title fingerprint (first 60 normalised characters) when determining if an article has been seen
5. THE Dedup_System SHALL retain seen-article records for 30 days
6. WHEN the Pipeline runs, THE Dedup_System SHALL perform an in-memory title-fingerprint dedup pass on the current batch before any Supabase check, to catch URL variants of the same story

---

### Requirement 5: Knowledge Base Feeds Every AI Call at Runtime

**User Story:** As the station operator, I want every AI-generated headline and caption to use the current Knowledge Base content, so that edits I make on the Knowledge Base page take effect immediately.

#### Acceptance Criteria

1. WHEN `generateAIContent` is called, THE KB_Loader SHALL fetch the current Knowledge Base from Supabase and merge it with the hardcoded defaults (Supabase values override defaults)
2. THE KB_Loader SHALL cache the merged Knowledge Base in memory for 5 minutes to avoid a Supabase round-trip on every post
3. WHEN the cache is older than 5 minutes, THE KB_Loader SHALL refresh from Supabase on the next AI call
4. THE Gemini_Client SHALL inject the `brand_voice`, `headline_guide`, `caption_guide`, `gen_z_guide`, and `kenya_knowledge` KB sections into every AI prompt as system instructions
5. IF Supabase is unreachable, THEN THE KB_Loader SHALL use the hardcoded `KB_DEFAULTS` without failing the post
6. THE Knowledge_Base_Page SHALL display a status indicator showing whether the AI is currently using the live KB or the hardcoded defaults

---

### Requirement 6: Thumbnail Quality — Correct Dimensions and Strong Branding

**User Story:** As the station operator, I want thumbnails to look professional and on-brand, so that posts stand out in the Instagram and Facebook feeds.

#### Acceptance Criteria

1. THE Image_Generator SHALL produce thumbnails at 1080×1350 pixels (4:5 ratio) for feed posts by default
2. THE Image_Generator SHALL produce thumbnails at 1080×1920 pixels (9:16 ratio) for Reel cover images
3. THE Image_Generator SHALL render the PPP TV Kenya logo in the top-left corner of every thumbnail, sized at 240×96 pixels
4. THE Image_Generator SHALL render a "PPP TV KENYA" text strip in the top bar using the brand red colour `#E50914`
5. THE Image_Generator SHALL render the category pill using the correct category colour from the `CAT_COLORS` map
6. THE Image_Generator SHALL render the headline in Bebas Neue font, ALL CAPS, white, auto-sized between 58px and 160px based on character count
7. IF the background image cannot be fetched, THEN THE Image_Generator SHALL use a solid `#111` background rather than failing
8. THE Image_Generator SHALL apply a gradient overlay from transparent at the top to solid black at the bottom, ensuring the headline is always legible regardless of background image content

---

### Requirement 7: Headlines — 4–7 Words, Name-First Formula

**User Story:** As the station operator, I want every thumbnail headline to be 4–7 words, starting with the subject's name, so that headlines are readable on a phone screen at a glance.

#### Acceptance Criteria

1. THE Headline_Generator SHALL instruct Gemini to produce headlines of exactly 4–7 words
2. THE Headline_Generator SHALL instruct Gemini to start the headline with the most prominent name or the biggest fact in the story
3. THE Headline_Generator SHALL instruct Gemini to use exactly one strong action verb (DROPS, CONFIRMS, REVEALS, SIGNS, BEATS, WINS, SLAMS, LEAVES, JOINS, BREAKS, CLAPS BACK, GOES VIRAL)
4. THE Headline_Generator SHALL instruct Gemini to output ALL CAPS with no punctuation except a dash (—)
5. THE Headline_Generator SHALL reject any generated headline longer than 7 words and retry once; IF the retry also exceeds 7 words, THEN THE Headline_Generator SHALL truncate to the first 7 words
6. THE Headline_Generator SHALL never use the banned words: SHOCKING, AMAZING, INCREDIBLE, YOU WON'T BELIEVE, MUST SEE, EXPLOSIVE, BOMBSHELL

---

### Requirement 8: Captions — Gen Z Nairobi Voice

**User Story:** As the station operator, I want every caption to sound like a knowledgeable Nairobi friend sharing news, not a formal news anchor, so that the content resonates with the Gen Z audience.

#### Acceptance Criteria

1. THE Caption_Generator SHALL produce captions under 180 words
2. THE Caption_Generator SHALL structure every caption in three parts: a hook (1–2 sentences), the story (2–4 sentences with specific facts), and a close (1 sentence with engagement CTA + source credit)
3. THE Caption_Generator SHALL use 2–3 emojis maximum per caption, placed naturally within the text
4. THE Caption_Generator SHALL never include hashtags in the caption body; hashtags SHALL be placed in the first comment only
5. THE Caption_Generator SHALL never use the phrases "stay tuned", "watch this space", or "find out why below"
6. THE Caption_Generator SHALL always end with a source credit line in the format "Source: [source name]"
7. THE Caption_Generator SHALL use one of the approved Gen Z opener patterns from the `caption_guide` KB section
8. IF the generated caption exceeds 180 words, THEN THE Caption_Generator SHALL retry once with an explicit word-count constraint; IF the retry still exceeds 180 words, THEN THE Caption_Generator SHALL truncate at the last complete sentence before the 180-word limit

---

### Requirement 9: Video Scraping by Topic and Keyword

**User Story:** As the station operator, I want the video pipeline to find videos by topic and keyword (e.g. "Kenyan Entertainment", "LeBron James"), not just by channel, so that the most relevant viral videos are always available.

#### Acceptance Criteria

1. THE Video_Scraper SHALL support keyword-based search via TikWM's search endpoint in addition to account-based fetching
2. THE Video_Scraper SHALL maintain a tiered keyword list: Tier 1 (Kenya/Africa topics, always searched), Tier 2 (global sports/music, rotated), Tier 3 (background variety, occasional)
3. WHEN fetching videos by keyword, THE Video_Scraper SHALL request the top 10 results sorted by play count
4. THE Video_Scraper SHALL score videos by: play count boost + recency boost + Kenyan content boost (+25 for Kenya/Africa keywords) + upvote boost (for Reddit sources)
5. THE Video_Scraper SHALL deduplicate videos by URL and title fingerprint before scoring
6. THE Video_Scraper SHALL accept videos from: YouTube RSS channels, TikWM account feeds, TikWM keyword search, Reddit top posts, Dailymotion RSS, and news site RSS with embedded video
7. IF a keyword search returns zero results, THEN THE Video_Scraper SHALL fall back to the next keyword in the same tier without failing the pipeline

---

### Requirement 10: Autonomous Operation — No Silent Failures

**User Story:** As the station operator, I want the pipeline to run autonomously without silent failures, so that I can trust it is posting without manually checking every few hours.

#### Acceptance Criteria

1. WHEN any step in the Pipeline fails (scraping, AI generation, image generation, publishing), THE System SHALL log the failure with a descriptive message including the step name, error message, and article ID
2. THE Pipeline SHALL never silently swallow an error that causes a post to be skipped; every skip SHALL be logged with a reason
3. WHEN Gemini generation fails, THE System SHALL fall back to a structured template and log "AI fallback used" with the reason
4. WHEN image generation fails, THE System SHALL log the error and skip the post rather than posting a broken image
5. THE Cloudflare_Worker cron SHALL fire every 10 minutes and call the `/api/automate` endpoint; IF the endpoint returns a non-200 status, THE Worker SHALL log the status code and response body
6. THE Pipeline SHALL enforce a dead zone of 1:00am–5:45am EAT during which no posts are made
7. THE Pipeline SHALL enforce a minimum gap of 10 minutes between consecutive posts
8. THE Pipeline SHALL enforce a maximum of 48 posts per day
9. WHEN the daily post cap is reached, THE Pipeline SHALL log "Daily cap reached" and skip all further posts until midnight EAT

---

### Requirement 11: Knowledge Base Page — Live AI Test

**User Story:** As the station operator, I want to test the AI output directly from the Knowledge Base page, so that I can verify that my KB edits are working before the next scheduled post.

#### Acceptance Criteria

1. THE Knowledge_Base_Page SHALL provide a test input where the operator can paste any article URL
2. WHEN the operator submits a test URL, THE Knowledge_Base_Page SHALL call `/api/preview-url` and display the generated headline and caption
3. THE Knowledge_Base_Page SHALL display a status indicator showing "Using live KB" when Supabase KB data is loaded, or "Using defaults" when falling back to hardcoded values
4. THE Knowledge_Base_Page SHALL display the last-saved timestamp for each KB section
5. WHEN a KB section is saved, THE Knowledge_Base_Page SHALL invalidate the in-memory KB cache so the next AI call uses the updated content immediately
6. THE Knowledge_Base_Page SHALL display the word count and character count of the generated caption in the test result

---

### Requirement 12: Parser and Serializer Integrity — RSS Feed Parsing

**User Story:** As the station operator, I want the RSS feed parser to reliably extract articles from all configured feeds, so that the pipeline always has fresh content to post.

#### Acceptance Criteria

1. WHEN a valid RSS XML feed is provided, THE RSS_Parser SHALL extract title, link, pubDate, description, and media thumbnail from each `<item>` element
2. WHEN an RSS item contains a CDATA-wrapped title, THE RSS_Parser SHALL unwrap the CDATA and return the plain text title
3. THE RSS_Parser SHALL decode HTML entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`) in all extracted text fields
4. FOR ALL valid RSS items, parsing then re-serialising then parsing SHALL produce an equivalent Article object (round-trip property)
5. IF an RSS feed returns a non-200 HTTP status or times out after 10 seconds, THEN THE RSS_Parser SHALL return an empty array for that feed without throwing
6. THE RSS_Parser SHALL filter out items older than 24 hours based on the `pubDate` field
