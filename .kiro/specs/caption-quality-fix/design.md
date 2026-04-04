# Caption Quality Fix — Bugfix Design

## Overview

Non-news categories (CELEBRITY, MUSIC, ENTERTAINMENT, SPORTS, TV & FILM, MOVIES) bypass the AI caption generation pipeline in `src/lib/gemini.ts`. The `generateAIContent` function short-circuits at the `isNewsCategory` guard and returns raw article text with a generic CTA, producing robotic, low-quality captions with no hook, no storytelling, spam hashtags, and source/URL clutter inline in the caption body.

The fix routes all non-news categories through a dedicated entertainment-specific Gemini prompt, implements content-matched CTAs by category/intent, strips source URLs and credit lines from the caption body (moving them to the first comment), replaces generic hashtags with niche category-specific sets, and removes the generic branding verdict line.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — `isNewsCategory(article.category)` returns `false`, causing the early-return path in `generateAIContent` to execute instead of the AI pipeline
- **Property (P)**: The desired behavior — all content types receive AI-crafted captions with a strong hook, 2–3 sentence narrative, content-matched CTA, clean formatting, and no inline URL/source clutter
- **Preservation**: The existing Gemini+Search journalist pipeline for news categories, graceful fallback on AI failure, hashtags-in-first-comment behavior, story verification, post caps, and posting hours — all must remain unchanged
- **generateAIContent**: The function in `src/lib/gemini.ts` that generates clickbait title, caption, and first comment for a given article
- **isNewsCategory**: The guard function in `src/lib/gemini.ts` that returns `true` for NEWS, POLITICS, BUSINESS, TECHNOLOGY, HEALTH, SCIENCE — the bug lives in the `else` branch it gates
- **ENTERTAINMENT_CATEGORIES**: The set of non-news categories affected by the bug: CELEBRITY, MUSIC, ENTERTAINMENT, SPORTS, TV & FILM, MOVIES
- **firstComment**: The Instagram first-comment field used to hold hashtags and attribution, keeping the caption body clean

## Bug Details

### Bug Condition

The bug manifests when `generateAIContent` is called with an article whose category is not in `NEWS_CATEGORIES`. The early-return block at line ~170 of `gemini.ts` skips all AI generation and returns raw article text directly, bypassing the Gemini prompt, hook generation, narrative structure, content-matched CTAs, and clean formatting logic.

**Formal Specification:**

```
FUNCTION isBugCondition(article)
  INPUT: article of type Article
  OUTPUT: boolean

  RETURN NOT (article.category.toUpperCase() IN
              ['NEWS', 'POLITICS', 'BUSINESS', 'TECHNOLOGY', 'HEALTH', 'SCIENCE'])
         AND generateAIContent was called for this article
         AND the returned caption equals rawArticleText (no AI rewrite occurred)
END FUNCTION
```

### Examples

- **CELEBRITY article**: "Vera Sidika and Brown Mauzo split confirmed" → caption = first 500 chars of raw article body + "\n\nSave this for later. 🔖\n\nSource: Mpasho" — no hook, no narrative, source inline
- **MUSIC article**: "Khaligraph Jones drops new album" → caption = raw summary + generic CTA + "Source: Ghafla Kenya" — no storytelling, no music-specific hashtags
- **SPORTS article**: "Harambee Stars qualify for AFCON" → caption = raw body excerpt + "Tag someone who needs to see this! 👀" — no emotional pull, no sports CTA, generic hashtags
- **ENTERTAINMENT article with video**: caption includes full video URL inline — clutters the post and looks automated

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- News categories (NEWS, POLITICS, BUSINESS, TECHNOLOGY, HEALTH, SCIENCE) continue using the existing Gemini+Search journalist pipeline with `CAPTION_SYSTEM` prompt and Google Search grounding
- On AI failure for any category, the system falls back gracefully to `buildExcerptCaption` without crashing
- Hashtags are placed in `firstComment`, not in the caption body, for all content types
- Story verification (`verifyStory`) continues to block unverified/low-confidence stories regardless of category
- Daily post cap, posting hour checks, and category rotation logic remain unchanged
- Clickbait thumbnail title generation via Gemini+Search remains unchanged

**Scope:**
All inputs where `isNewsCategory(article.category)` returns `true` must be completely unaffected by this fix. This includes all articles with categories: NEWS, POLITICS, BUSINESS, TECHNOLOGY, HEALTH, SCIENCE.

## Hypothesized Root Cause

Based on code inspection of `src/lib/gemini.ts`:

1. **Early-return guard bypasses AI entirely**: The `if (!isNewsCategory(article.category))` block at the top of `generateAIContent` returns immediately with raw text, never reaching the Gemini prompt construction or API calls. This is the primary cause.

2. **No entertainment-specific prompt exists**: The `CAPTION_SYSTEM` and `captionPrompt` are written for news journalism style. There is no equivalent prompt for entertainment/celebrity/sports content that emphasizes hook, emotional pull, and storytelling.

3. **CTA selection is content-agnostic**: `getEngagementCTA()` picks randomly from a flat list with no category awareness — a sports article can get "Save this for later" and a job opportunity post can get "Tag someone who needs to see this".

4. **Source/URL appended inline**: The early-return path appends `"Source: " + article.sourceName` directly to the caption body. The `automate/route.ts` also appends `article.url` to the caption. Both need to move to `firstComment`.

5. **Hashtag sets contain generic spam tags**: The `HASHTAG_BANK` already has category-specific sets but they include some generic tags. The early-return path uses these correctly, but the caption body pollution and missing brand consistency remain issues.

## Correctness Properties

Property 1: Bug Condition — Entertainment Categories Receive AI-Generated Captions

_For any_ article where `isBugCondition(article)` returns true (non-news category), the fixed `generateAIContent` function SHALL return a caption that: (a) was produced by an AI model (not raw article text), (b) contains a strong opening hook, (c) contains 2–3 sentences of narrative context, (d) ends with a content-matched CTA appropriate to the category and intent, (e) contains no inline source URLs, "Source:", "Credit:", or video URLs, and (f) contains no generic branding verdict lines.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8**

Property 2: Preservation — News Categories and Existing Behaviors Unchanged

_For any_ article where `isBugCondition(article)` returns false (news category), the fixed `generateAIContent` function SHALL produce the same result as the original function — using the Gemini+Search journalist pipeline, `CAPTION_SYSTEM` prompt, and existing fallback chain — preserving all news caption behavior, story verification, post caps, posting hours, and hashtag-in-first-comment placement.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

**File**: `src/lib/gemini.ts`

**Function**: `generateAIContent`

**Specific Changes**:

1. **Remove the early-return non-news block**: Delete the `if (!isNewsCategory(article.category))` early-return block entirely. Non-news categories must flow into the AI generation path.

2. **Add entertainment-specific Gemini prompt**: Create a new `ENTERTAINMENT_CAPTION_SYSTEM` system prompt and `entertainmentCaptionPrompt` builder for non-news categories. The prompt must instruct Gemini to: write a strong curiosity/emotional hook as the first sentence, follow with 2–3 sentences of narrative context using verified facts, and close with a content-matched CTA. No "Source:" lines, no URLs, no verdict slogans.

3. **Implement content-matched CTA selection**: Replace `getEngagementCTA()` (random flat list) with `getMatchedCTA(category, title)` that maps category and detected intent to appropriate CTAs:
   - SPORTS → "Who are you backing? 👇" / "Drop your prediction below 🔥"
   - CELEBRITY drama/conflict → "Pick a side 👇" / "Whose side are you on? 💬"
   - MUSIC → "Stream it now — link in bio 🎵" / "Who's your favourite Kenyan artist? 👇"
   - ENTERTAINMENT opportunity → "Send this to someone who needs to see it 👀"
   - Default → "What do you think? Drop it below 👇"

4. **Strip source/URL from caption body**: Remove `"Source: " + article.sourceName` from caption construction. Move source attribution to `firstComment` alongside hashtags. In `automate/route.ts`, remove the `caption += "\n\n" + article.url` line (URL already handled by the platform or first comment).

5. **Remove generic branding verdict line**: Audit prompt templates and caption post-processing for any "PPP TV Verdict" or "The story is just getting started" patterns and remove them.

6. **Update `firstComment` builder**: Append source attribution to `firstComment`: `${hashtags}\n\nSource: ${article.sourceName || "PPP TV Kenya"} | ${article.url}` — keeping caption body clean.

7. **Refine hashtag sets**: Audit `HASHTAG_BANK` to remove generic spam tags (#fyp, #viralvideo, #GlowUp) and ensure every category set includes `#PPPTVKenya` as the brand anchor tag.

**File**: `src/app/api/automate/route.ts`

**Function**: `postOneArticle`

**Specific Changes**:

1. **Remove inline URL append**: Remove or guard the `caption += "\n\n${article.url}"` line so video URLs and article URLs do not appear inline in the caption body.

## Testing Strategy

### Validation Approach

Two-phase approach: first run exploratory tests on the unfixed code to surface counterexamples and confirm the root cause, then verify the fix satisfies Property 1 and Property 2.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm the early-return path is the root cause.

**Test Plan**: Call `generateAIContent` with mock articles of each non-news category and assert that the returned caption is NOT equal to the raw article text. Run on unfixed code — all assertions will fail, confirming the bug.

**Test Cases**:

1. **CELEBRITY article test**: Call `generateAIContent({ category: "CELEBRITY", fullBody: "raw body text...", ... })` — assert caption ≠ raw body text (will fail on unfixed code)
2. **MUSIC article test**: Call `generateAIContent({ category: "MUSIC", summary: "raw summary...", ... })` — assert caption contains a hook sentence (will fail on unfixed code)
3. **SPORTS article test**: Call `generateAIContent({ category: "SPORTS", ... })` — assert caption ends with a sports-specific CTA (will fail on unfixed code)
4. **Source URL clutter test**: Call `generateAIContent` for any non-news article — assert caption does NOT contain "Source:" or the article URL inline (will fail on unfixed code)
5. **Video URL clutter test**: Call `postOneArticle` with a video article — assert caption does NOT contain the video URL inline (will fail on unfixed code)

**Expected Counterexamples**:

- Caption equals raw `fullBody.slice(0, 500)` + generic CTA + "Source: [name]" — confirming the early-return path executes
- Caption contains article URL inline — confirming `automate/route.ts` appends it unconditionally

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL article WHERE isBugCondition(article) DO
  result := generateAIContent_fixed(article)
  ASSERT result.caption != rawArticleText(article)
  ASSERT result.caption contains hook sentence (first sentence creates curiosity/pull)
  ASSERT result.caption does NOT contain "Source:" inline
  ASSERT result.caption does NOT contain article.url inline
  ASSERT result.caption does NOT contain "PPP TV Verdict"
  ASSERT result.firstComment contains hashtags with #PPPTVKenya
  ASSERT result.firstComment contains source attribution
  ASSERT ctaIsMatchedToCategory(result.caption, article.category)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL article WHERE NOT isBugCondition(article) DO
  ASSERT generateAIContent_original(article) ≈ generateAIContent_fixed(article)
  // Same Gemini+Search pipeline, same CAPTION_SYSTEM, same fallback chain
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because news category behavior has many input variations (different titles, summaries, sources, tones) and we need confidence that none of them regress.

**Test Plan**: Observe news category caption output on unfixed code first, capture the pipeline path taken, then write property-based tests asserting the same pipeline is used after the fix.

**Test Cases**:

1. **NEWS category preservation**: Verify `generateAIContent({ category: "NEWS", ... })` still uses Gemini+Search and `CAPTION_SYSTEM` after fix
2. **POLITICS category preservation**: Verify political articles still go through journalist pipeline
3. **Fallback preservation**: Verify that when Gemini throws, `buildExcerptCaption` is still called for both news and non-news categories
4. **firstComment hashtag placement**: Verify hashtags remain in `firstComment` (not caption body) for all categories after fix

### Unit Tests

- Test `isBugCondition` correctly identifies all six non-news categories
- Test `getMatchedCTA` returns category-appropriate CTAs for SPORTS, CELEBRITY, MUSIC, ENTERTAINMENT
- Test caption body contains no "Source:", no article URL, no video URL for non-news articles
- Test `firstComment` contains `#PPPTVKenya` brand tag for all categories
- Test `buildExcerptCaption` fallback still fires when AI throws for non-news category

### Property-Based Tests

- Generate random non-news articles (varying category, title length, body length, missing fields) and assert Property 1 holds for all: caption is AI-generated, has hook, has matched CTA, no inline URL clutter
- Generate random news articles and assert Property 2 holds for all: same pipeline path, same system prompt, same fallback chain as pre-fix
- Generate random articles with missing `fullBody` / `summary` and assert graceful fallback fires without crash for both news and non-news

### Integration Tests

- End-to-end: POST to `/api/automate` with a mocked CELEBRITY article — assert published caption has no inline URL, has hook, has sports/celeb CTA
- End-to-end: POST to `/api/automate` with a mocked NEWS article — assert published caption uses journalist style (lede + body + source close)
- End-to-end: POST to `/api/automate-video` with a MUSIC video — assert caption has no video URL inline, first comment has attribution + hashtags
