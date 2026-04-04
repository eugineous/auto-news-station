/**
 * Bug Condition Exploration Test — Caption Quality Fix
 *
 * Task 1: Write bug condition exploration test
 * Validates: Requirements 1.1, 1.4, 1.6
 *
 * CRITICAL: These tests MUST FAIL on unfixed code.
 * Failure confirms the bug exists — the early-return block in generateAIContent
 * executes for non-news categories, producing raw article text instead of
 * AI-crafted captions.
 *
 * Run with:
 *   npx ts-node --skip-project src/lib/__tests__/caption-quality.test.ts
 *
 * EXPECTED OUTCOME: Tests FAIL — this is SUCCESS for Task 1.
 * The counterexamples document exactly what the bug produces.
 */

import assert from "assert";
import { generateAIContent } from "../gemini";
import type { Article } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const counterexamples: { name: string; actual: string; expected: string }[] = [];

function test(name: string, fn: () => Promise<void>) {
  return fn()
    .then(() => {
      console.log(`  ✓ ${name}`);
      passed++;
    })
    .catch((err: any) => {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    });
}

// ── Non-news category articles (bug condition inputs) ─────────────────────────
const NON_NEWS_CATEGORIES = ["CELEBRITY", "MUSIC", "ENTERTAINMENT", "SPORTS", "TV & FILM", "MOVIES"] as const;

function makeArticle(category: string, overrides: Partial<Article> = {}): Article {
  const rawBody =
    "Vera Sidika and Brown Mauzo have officially confirmed their split after months of speculation. " +
    "The socialite took to Instagram to announce the end of their relationship, citing irreconcilable differences. " +
    "The couple, who share a daughter, Asia Brown, have been together since 2019. " +
    "Fans have been reacting with shock and sadness across social media platforms. " +
    "Neither party has revealed the specific reasons behind the breakup at this time.";

  return {
    id: `test-${category.toLowerCase().replace(/\s/g, "-")}`,
    title: "Vera Sidika and Brown Mauzo split confirmed",
    url: "https://mpasho.co.ke/vera-sidika-brown-mauzo-split",
    imageUrl: "https://mpasho.co.ke/image.jpg",
    summary: rawBody.slice(0, 200),
    fullBody: rawBody,
    sourceName: "Mpasho",
    publishedAt: new Date("2025-01-15"),
    category,
    ...overrides,
  };
}

// ── Property 1: Bug Condition — Non-News Categories Receive AI-Generated Captions
// Validates: Requirements 1.1, 1.4, 1.6
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n── Bug Condition Exploration: Non-News Categories Bypass AI Pipeline ────────");
console.log("   (Tests MUST FAIL on unfixed code — failure confirms the bug exists)\n");

async function runTests() {
  for (const category of NON_NEWS_CATEGORIES) {
    const article = makeArticle(category);
    const rawBody = article.fullBody!;
    const rawCaption500 = rawBody.slice(0, 500);

    let result: Awaited<ReturnType<typeof generateAIContent>>;
    try {
      result = await generateAIContent(article);
    } catch (err: any) {
      console.error(`  ✗ [${category}] generateAIContent threw: ${err.message}`);
      failed++;
      continue;
    }

    // ── Test 1: Caption must NOT equal raw article text (AI must have rewritten it)
    await test(`[${category}] caption is NOT raw article text (AI rewrote it)`, async () => {
      const isRawText = result.caption.startsWith(rawCaption500.slice(0, 100));
      if (isRawText) {
        counterexamples.push({
          name: `[${category}] caption equals raw article text`,
          actual: result.caption.slice(0, 200),
          expected: "AI-crafted caption with hook, narrative, and matched CTA",
        });
        assert.fail(
          `Caption is raw article text (early-return path executed).\n` +
          `    Actual caption start: "${result.caption.slice(0, 120)}"\n` +
          `    Expected: AI-crafted caption with hook and narrative`
        );
      }
    });

    // ── Test 2: Caption must NOT contain "Source: " inline
    await test(`[${category}] caption does NOT contain "Source: " inline`, async () => {
      if (result.caption.includes("Source: ")) {
        counterexamples.push({
          name: `[${category}] caption contains "Source: " inline`,
          actual: result.caption.slice(0, 200),
          expected: 'Source attribution in firstComment only, not in caption body',
        });
        assert.fail(
          `Caption contains "Source: " inline — source attribution leaked into caption body.\n` +
          `    Actual: "${result.caption.slice(0, 200)}"`
        );
      }
    });

    // ── Test 3: Caption must NOT contain the article URL inline
    await test(`[${category}] caption does NOT contain article URL inline`, async () => {
      if (result.caption.includes(article.url)) {
        counterexamples.push({
          name: `[${category}] caption contains article URL inline`,
          actual: result.caption.slice(0, 200),
          expected: "URL in firstComment only, not in caption body",
        });
        assert.fail(
          `Caption contains article URL inline.\n` +
          `    URL found: "${article.url}"\n` +
          `    Actual caption: "${result.caption.slice(0, 200)}"`
        );
      }
    });

    // ── Test 4: Caption must contain a hook (first sentence creates curiosity/pull)
    //    Minimum assertion: first sentence is NOT just the raw article body verbatim
    await test(`[${category}] caption contains a hook (not just raw article body)`, async () => {
      const firstSentence = result.caption.split(/[.!?]/)[0].trim();
      const rawFirstSentence = rawBody.split(/[.!?]/)[0].trim();
      const isVerbatimRaw = firstSentence.toLowerCase().startsWith(rawFirstSentence.toLowerCase().slice(0, 40));
      if (isVerbatimRaw) {
        counterexamples.push({
          name: `[${category}] first sentence is verbatim raw article body (no hook)`,
          actual: firstSentence,
          expected: "A curiosity/emotional hook crafted by AI",
        });
        assert.fail(
          `Caption first sentence is verbatim raw article body — no AI hook present.\n` +
          `    First sentence: "${firstSentence.slice(0, 120)}"\n` +
          `    Raw body start: "${rawFirstSentence.slice(0, 120)}"`
        );
      }
    });

    // ── Test 5: firstComment must contain "#PPPTVKenya"
    await test(`[${category}] firstComment contains "#PPPTVKenya"`, async () => {
      if (!result.firstComment?.includes("#PPPTVKenya")) {
        counterexamples.push({
          name: `[${category}] firstComment missing #PPPTVKenya`,
          actual: result.firstComment ?? "(empty)",
          expected: "firstComment contains #PPPTVKenya brand hashtag",
        });
        assert.fail(
          `firstComment does not contain "#PPPTVKenya".\n` +
          `    Actual firstComment: "${result.firstComment ?? "(empty)"}"`
        );
      }
    });
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(70)}`);
  console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);

  if (counterexamples.length > 0) {
    console.log(`\n── Counterexamples Found (Bug Evidence) ────────────────────────────────────`);
    for (const ce of counterexamples) {
      console.log(`\n  BUG: ${ce.name}`);
      console.log(`  Actual:   ${ce.actual}`);
      console.log(`  Expected: ${ce.expected}`);
    }
    console.log(`\n  ROOT CAUSE CONFIRMED: The early-return block in generateAIContent`);
    console.log(`  (if (!isNewsCategory(article.category))) executes for non-news categories,`);
    console.log(`  returning raw article text instead of invoking the AI caption pipeline.`);
  }

  if (failed > 0) {
    console.log(`\n  ✓ TASK 1 SUCCESS: Tests failed as expected — bug is confirmed.`);
    console.log(`    Do NOT fix the code yet. Document counterexamples above.`);
    // Exit 0 for task 1 — failure of assertions IS the success condition
    process.exit(0);
  } else {
    console.log(`\n  ⚠ UNEXPECTED: All tests passed on unfixed code.`);
    console.log(`    This means the bug may not be present or the test logic needs review.`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal error running tests:", err);
  process.exit(1);
});
