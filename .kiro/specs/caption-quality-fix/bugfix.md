# Bugfix Requirements Document

## Introduction

PPP TV Kenya's social media automation system generates low-quality captions for entertainment, sports, celebrity, and music content. The root cause is that non-news categories (CELEBRITY, MUSIC, ENTERTAINMENT, SPORTS, TV & FILM, etc.) bypass the AI caption generation pipeline entirely and fall back to raw article text with a generic CTA appended. This produces captions that lack editorial voice, storytelling, personality, and strategic CTAs — making every post look like an automated repost bot rather than a premium Kenyan media brand.

The fix must overhaul the caption generation logic so that all content types — not just news — receive AI-crafted captions with a strong hook, narrative body, content-matched CTA, and niche hashtag strategy.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN an article has a non-news category (e.g. CELEBRITY, MUSIC, ENTERTAINMENT, SPORTS, TV & FILM, MOVIES) THEN the system skips AI generation and pastes raw article text directly as the caption

1.2 WHEN a caption is generated for any content type THEN the system appends a generic, content-agnostic CTA (e.g. "Save this for later", "Tag someone") regardless of whether it matches the content's intent

1.3 WHEN a caption is generated THEN the system appends a repetitive, meaningless branding line (e.g. "PPP TV Verdict: The story is just getting started") that adds no value and appears on every post

1.4 WHEN a caption is generated THEN the system includes raw source URLs, "Source: …", and "Credit: …" lines inline in the caption body, making posts look auto-generated

1.5 WHEN hashtags are selected THEN the system uses generic spam hashtags (#fyp, #viralvideo, #GlowUp, #tiktokeastafrica) with no niche targeting, no brand hashtags, and no consistency across content types

1.6 WHEN a caption is generated for entertainment or sports content THEN the system produces no hook, no curiosity gap, no emotional pull, and no storytelling — it copies the article headline verbatim

1.7 WHEN a caption is generated THEN the system produces inconsistent formatting: captions start mid-sentence, repeat lines, have broken titles, and contain typos from the raw source

1.8 WHEN a caption is generated for a video post THEN the system appends the full video URL inline in the caption body, cluttering the post

### Expected Behavior (Correct)

2.1 WHEN an article has a non-news category THEN the system SHALL invoke AI caption generation with an entertainment-specific prompt that produces a hook, narrative body, and content-matched CTA — identical pipeline depth as news content

2.2 WHEN a CTA is appended to a caption THEN the system SHALL select a CTA matched to the content's intent: news/debate content → "What do you think?", drama/conflict content → "Pick a side 👇", opportunity content → "Send this to someone job hunting", sports content → "Who are you backing? 👇"

2.3 WHEN a caption is generated THEN the system SHALL NOT include any generic branding verdict lines; brand identity SHALL be expressed through voice and tone, not repeated slogans

2.4 WHEN a caption is generated THEN the system SHALL place source attribution only in the first comment (not inline in the caption body), keeping the caption clean and human-looking

2.5 WHEN hashtags are selected THEN the system SHALL use niche, category-specific hashtags that include at least one PPP TV brand hashtag (#PPPTVKenya), relevant Kenyan niche tags, and content-specific tags — no generic spam hashtags

2.6 WHEN a caption is generated for entertainment or sports content THEN the system SHALL produce a caption with: (a) a strong opening hook that creates curiosity or emotional pull, (b) 2–3 sentences of narrative context, and (c) a content-matched CTA

2.7 WHEN a caption is generated THEN the system SHALL produce clean, consistently formatted output: no repeated lines, no mid-sentence starts, no broken titles, no raw typos from source

2.8 WHEN a caption is generated for a video post THEN the system SHALL NOT include the video URL inline in the caption body; the URL SHALL only appear in the first comment if needed

### Unchanged Behavior (Regression Prevention)

3.1 WHEN an article has a news category (NEWS, POLITICS, BUSINESS, TECHNOLOGY, HEALTH, SCIENCE) THEN the system SHALL CONTINUE TO use the existing Gemini+Search journalist-style caption pipeline

3.2 WHEN AI generation fails for any content type THEN the system SHALL CONTINUE TO fall back gracefully to an excerpt-based caption without crashing

3.3 WHEN a caption is generated THEN the system SHALL CONTINUE TO place hashtags in the first comment (not the caption body) for Instagram posts

3.4 WHEN story verification runs THEN the system SHALL CONTINUE TO block unverified or low-confidence stories regardless of content category

3.5 WHEN the daily post cap and posting hour checks run THEN the system SHALL CONTINUE TO enforce those limits regardless of content category

3.6 WHEN a clickbait thumbnail title is generated THEN the system SHALL CONTINUE TO use Gemini with Google Search for factual headline generation
