/**
 * Preservation Property Tests — Caption Quality Fix
 *
 * Task 2: Write preservation property tests (BEFORE implementing fix)
 * Validates: Requirements 3.1, 3.2, 3.3
 *
 * These tests verify that news categories (NEWS, POLITICS, BUSINESS, TECHNOLOGY,
 * HEALTH, SCIENCE) use the existing Gemini+Search journalist pipeline and do NOT
 * hit the early-return block that is the bug for non-news categories.
 *
 * CRITICAL: These tests MUST PASS on unfixed code — they establish the baseline
 * behavior that must not be broken by the fix.
 *
 * Run with:
 *   npx ts-node --skip-project src/lib/__tests__/caption-preservation.test.ts
 *
 * EXPECTED OUTCOME: Tests PASS — confirms news pipeline is working correctly
 * before the fix is applied.
 */

import assert from "assert";
import { generateAIContent } from "../gemini";
import type { Article } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ── News category articles (preservation inputs) ──────────────────────────────
const NEWS_CATEGORIES = ["NEWS", "POLITICS", "BUSINESS", "TECHNOLOGY", "HEALTH", "SCIENCE"] as const;

function makeNewsArticle(category: string, overrides: Partial<Article> = {}): Article {
  const rawBody =
    "President William Ruto has announced a new economic stimulus package worth KSh 50 billion " +
    "targeting small and medium enterprises across Kenya. The package, unveiled at State House Nairobi, " +
    "includes low-interest loans, tax relief measures, and digital infrastructure grants. " +
    "Treasury Cabinet Secretary John Mbadi confirmed the funds will be disbursed through the Kenya " +
    "Development Corporation starting next quarter. Opposition leaders have called for transparency " +
    "in the allocation process, citing past mismanagement of similar funds.";

  return {
    id: `test-preservation-${category.toLowerCase()}`,
    title: "Ruto announces KSh 50 billion SME stimulus package",
    url: "https://nation.africa/kenya/news/ruto-sme-stimulus-2025",
    imageUrl: "https://nation.africa/image.jpg",
    summary: rawBody.slice(0, 200),
    fullBody: rawBody,
    sourceName: "Nation Africa",
    publishedAt: new Date("2025-01-15"),
    category,
    ...overrides,
  };
}

// ── The early-return pattern: what the bug produces for non-news categories ───
// The early-return block in generateAIContent produces:
//   rawCaption.slice(0,500) + "\n\n" + cta + "\n\nSource: " + sourceName
//
// The distinguishing signal is "Source: " inline in the caption body.
// The news fallback (buildExcerptCaption) does NOT include "Source: " inline.
// For news categories, the early-return block is never reached, so "Source: "
// must not appear inline in the caption body.
function isEarlyReturnCaption(caption: string): boolean {
  // The early-return block always appends "\n\nSource: <name>" to the caption body
  return caption.includes("Source: ");
}

// ── Property 2: Preservation — News Categories Use Existing Pipeline ──────────
// Validates: Requirements 3.1, 3.2, 3.3
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n── Preservation Tests: News Categories Use Existing Gemini+Search Pipeline ──");
console.log("   (Tests MUST PASS on unfixed code — confirms baseline behavior)\n");

async function runTests() {
  // ── Test Group 1: News categories do NOT hit the early-return block ──────────
  console.log("  Group 1: News categories bypass the early-return block\n");

  for (const category of NEWS_CATEGORIES) {
    const article = makeNewsArticle(category);

    let result: Awaited<ReturnType<typeof generateAIContent>>;
    try {
      result = await generateAIContent(article);
    } catch (err: any) {
      console.error(`  ✗ [${category}] generateAIContent threw unexpectedly: ${err.message}`);
      failed++;
      continue;
    }

    // Test: caption must NOT be the raw early-return pattern
    // (news categories skip the early-return block — they go through AI or fallback)
    await test(`[${category}] caption is NOT the early-return raw text pattern`, async () => {
      assert.ok(
        !isEarlyReturnCaption(result.caption),
        `Caption matches early-return pattern — news category hit the early-return block.\n` +
        `    Caption start: "${result.caption.slice(0, 120)}"\n` +
        `    Raw body start: "${article.fullBody.slice(0, 80)}"`
      );
    });

    // Test: caption must be non-empty (AI or fallback produced something)
    await test(`[${category}] caption is non-empty`, async () => {
      assert.ok(
        result.caption && result.caption.trim().length > 0,
        `Caption is empty — pipeline produced no output for ${category}`
      );
    });
  }

  // ── Test Group 2: firstComment contains hashtags, caption does NOT ───────────
  console.log("\n  Group 2: Hashtags in firstComment, not in caption body\n");

  for (const category of NEWS_CATEGORIES) {
    const article = makeNewsArticle(category);

    let result: Awaited<ReturnType<typeof generateAIContent>>;
    try {
      result = await generateAIContent(article);
    } catch (err: any) {
      console.error(`  ✗ [${category}] generateAIContent threw: ${err.message}`);
      failed++;
      continue;
    }

    // Test: firstComment must contain hashtags (the pipeline puts them there)
    await test(`[${category}] firstComment contains hashtags`, async () => {
      assert.ok(
        result.firstComment && result.firstComment.includes("#"),
        `firstComment does not contain hashtags for ${category}.\n` +
        `    firstComment: "${result.firstComment ?? "(empty)"}"`
      );
    });

    // Test: firstComment must contain #PPPTVKenya brand tag
    await test(`[${category}] firstComment contains #PPPTVKenya`, async () => {
      assert.ok(
        result.firstComment?.includes("#PPPTVKenya"),
        `firstComment missing #PPPTVKenya for ${category}.\n` +
        `    firstComment: "${result.firstComment ?? "(empty)"}"`
      );
    });

    // Test: caption body must NOT contain hashtag strings
    await test(`[${category}] caption body does NOT contain hashtags`, async () => {
      // The pipeline strips hashtags from caption via: caption.replace(/#\w+/g, "")
      assert.ok(
        !result.caption.includes("#"),
        `Caption body contains hashtags for ${category} — hashtags should be in firstComment only.\n` +
        `    Caption: "${result.caption.slice(0, 200)}"`
      );
    });
  }

  // ── Test Group 3: Graceful fallback when AI throws ───────────────────────────
  console.log("\n  Group 3: Graceful fallback when AI is unavailable\n");

  // When GEMINI_API_KEY and NVIDIA_API_KEY are not set, generateAIContent falls
  // back to buildExcerptCaption — it must not crash and must return non-empty caption.
  // In test environment, API keys are typically not set, so this tests the fallback path.
  for (const category of NEWS_CATEGORIES) {
    const article = makeNewsArticle(category);

    await test(`[${category}] fallback produces non-empty caption when AI unavailable`, async () => {
      let result: Awaited<ReturnType<typeof generateAIContent>>;
      try {
        result = await generateAIContent(article);
      } catch (err: any) {
        assert.fail(
          `generateAIContent threw instead of falling back gracefully for ${category}.\n` +
          `    Error: ${err.message}`
        );
      }
      assert.ok(
        result.caption && result.caption.trim().length >= 10,
        `Fallback caption is too short or empty for ${category}.\n` +
        `    Caption: "${result.caption}"`
      );
    });
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(70)}`);
  console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log(`\n  ✓ TASK 2 SUCCESS: All preservation tests pass on unfixed code.`);
    console.log(`    Baseline confirmed — news pipeline is working correctly.`);
    console.log(`    These tests will continue to pass after the fix (no regressions).`);
    process.exit(0);
  } else {
    console.log(`\n  ✗ TASK 2 FAILURE: ${failed} preservation test(s) failed.`);
    console.log(`    The news pipeline baseline is broken — investigate before proceeding.`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal error running preservation tests:", err);
  process.exit(1);
});
