# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Non-News Categories Bypass AI Pipeline
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the early-return block executes for non-news categories
  - **Scoped PBT Approach**: Scope the property to each of the six non-news categories (CELEBRITY, MUSIC, ENTERTAINMENT, SPORTS, TV & FILM, MOVIES) with representative article inputs
  - Mock `generateAIContent` with articles of each non-news category (e.g. `{ category: "CELEBRITY", fullBody: "Vera Sidika and Brown Mauzo split confirmed...", sourceName: "Mpasho", url: "https://mpasho.co.ke/..." }`)
  - Assert that `result.caption` does NOT equal `rawArticleText.slice(0, 500)` — i.e. AI rewrote it
  - Assert that `result.caption` does NOT contain `"Source: "` inline in the caption body
  - Assert that `result.caption` does NOT contain the article URL inline
  - Assert that `result.caption` contains a hook sentence (first sentence creates curiosity or emotional pull)
  - Assert that `result.firstComment` contains `#PPPTVKenya`
  - Run test on UNFIXED code (the `if (!isNewsCategory(article.category))` early-return block is still present)
  - **EXPECTED OUTCOME**: Test FAILS — counterexample: caption equals `rawBody.slice(0, 500) + "\n\nSave this for later. 🔖\n\nSource: Mpasho"` — confirming the early-return path executes
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.4, 1.6_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - News Categories Use Existing Gemini+Search Pipeline
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: `generateAIContent({ category: "NEWS", ... })` on unfixed code — confirm it reaches the Gemini+Search path (not the early-return block)
  - Observe: `generateAIContent({ category: "POLITICS", ... })` — confirm journalist pipeline executes
  - Observe: when Gemini throws, `buildExcerptCaption` fallback fires for news articles
  - Observe: `result.firstComment` contains hashtags (not in caption body) for news articles
  - Write property-based test: for all articles where `isNewsCategory(category)` returns true, the function does NOT hit the early-return block and the caption is NOT equal to raw article text
  - Write property-based test: for all articles where `isNewsCategory(category)` returns true, `result.firstComment` contains hashtags and `result.caption` does NOT contain hashtag strings
  - Write property-based test: when AI throws for a news article, `result.caption` is a non-empty excerpt-based fallback (not a crash)
  - Verify all tests PASS on UNFIXED code (confirms baseline behavior to preserve)
  - **EXPECTED OUTCOME**: Tests PASS — confirms news pipeline is working correctly before the fix
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Fix caption quality for non-news categories
  - [x] 3.1 Remove the `isNewsCategory` early-return block from `generateAIContent` in `src/lib/gemini.ts`
    - Delete the entire `if (!isNewsCategory(article.category))` block (lines ~170–182 in gemini.ts)
    - Non-news categories must now fall through to the AI generation path
    - _Bug_Condition: isBugCondition(article) where NOT isNewsCategory(article.category) AND returned caption equals rawArticleText_
    - _Expected_Behavior: all categories reach the Gemini prompt construction and API calls_
    - _Preservation: NEWS, POLITICS, BUSINESS, TECHNOLOGY, HEALTH, SCIENCE articles must continue using the existing Gemini+Search journalist pipeline_
    - _Requirements: 2.1, 3.1_

  - [x] 3.2 Add `ENTERTAINMENT_CAPTION_SYSTEM` prompt and `entertainmentCaptionPrompt` builder in `src/lib/gemini.ts`
    - Create `ENTERTAINMENT_CAPTION_SYSTEM` system prompt instructing the model to: write a strong curiosity/emotional hook as the first sentence, follow with 2–3 sentences of narrative context using verified facts, close with a content-matched CTA — no "Source:" lines, no URLs, no verdict slogans
    - Create `entertainmentCaptionPrompt(article, hookPattern)` builder that passes category, title, summary, and fullBody to the prompt
    - Route non-news categories to this prompt instead of `captionPrompt` (which remains for news categories)
    - _Requirements: 2.1, 2.6, 2.7_

  - [x] 3.3 Implement `getMatchedCTA(category, title)` replacing `getEngagementCTA()` for non-news categories in `src/lib/gemini.ts`
    - Map category + detected intent to appropriate CTAs:
      - SPORTS → `"Who are you backing? 👇"` / `"Drop your prediction below 🔥"`
      - CELEBRITY with drama/conflict keywords → `"Pick a side 👇"` / `"Whose side are you on? 💬"`
      - MUSIC → `"Stream it now — link in bio 🎵"` / `"Who's your favourite Kenyan artist? 👇"`
      - ENTERTAINMENT with opportunity keywords → `"Send this to someone who needs to see it 👀"`
      - Default → `"What do you think? Drop it below 👇"`
    - Keep `getEngagementCTA()` for news categories (unchanged)
    - _Requirements: 2.2_

  - [x] 3.4 Strip source/URL from caption body and move to `firstComment` in `src/lib/gemini.ts`
    - Remove `"Source: " + article.sourceName` from caption construction for non-news categories
    - Update `firstComment` builder to include source attribution: `${hashtags}\n\nSource: ${article.sourceName || "PPP TV Kenya"} | ${article.url}`
    - Ensure caption body contains no inline "Source:", "Credit:", article URL, or video URL
    - _Requirements: 2.4, 2.8_

  - [x] 3.5 Remove generic branding verdict lines from prompts and post-processing in `src/lib/gemini.ts`
    - Audit `ENTERTAINMENT_CAPTION_SYSTEM` and `CAPTION_SYSTEM` for any "PPP TV Verdict" or "The story is just getting started" patterns and exclude them
    - Add post-processing strip: remove any line matching `/PPP TV Verdict|The story is just getting started/i` from generated captions
    - _Requirements: 2.3_

  - [x] 3.6 Refine `HASHTAG_BANK` in `src/lib/gemini.ts`
    - Remove generic spam tags from all category sets: `#fyp`, `#viralvideo`, `#GlowUp`, `#tiktokeastafrica`
    - Confirm `#PPPTVKenya` is present in every category set (already present — verify and keep)
    - Add niche tags where missing (e.g. `#KenyaCeleb` for CELEBRITY, `#SportKE` for SPORTS)
    - _Requirements: 2.5_

  - [x] 3.7 Remove inline URL append in `src/app/api/automate/route.ts`
    - In `postOneArticle`, remove or guard the `caption += "\n\n${article.url}"` block (lines ~230–232)
    - URL attribution is now handled by `firstComment` from `generateAIContent`
    - _Requirements: 2.8_

  - [x] 3.8 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Non-News Categories Receive AI-Generated Captions
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms non-news categories now receive AI-crafted captions with hook, matched CTA, no inline source/URL clutter, and `#PPPTVKenya` in firstComment
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES — confirms bug is fixed
    - _Requirements: 2.1, 2.2, 2.4, 2.6, 2.7, 2.8_

  - [x] 3.9 Verify preservation tests still pass
    - **Property 2: Preservation** - News Categories and Existing Behaviors Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS — confirms no regressions in news pipeline, fallback chain, or hashtag placement
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite and confirm Property 1 (bug condition) and Property 2 (preservation) both pass
  - Manually verify one CELEBRITY and one SPORTS article through the pipeline end-to-end — confirm caption has hook, matched CTA, no inline URL, and firstComment has `#PPPTVKenya` + source attribution
  - Manually verify one NEWS article — confirm journalist pipeline is unchanged
  - Ensure all tests pass; ask the user if questions arise
