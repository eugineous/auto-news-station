/**
 * Unit tests for video-cockpit-overhaul
 * Run with: npx ts-node --skip-project src/lib/__tests__/video-cockpit-overhaul.unit.test.ts
 * Or add jest/vitest to devDependencies and run normally.
 *
 * Uses Node.js built-in assert — no test framework required.
 */

import assert from "assert";

// ── Helpers ───────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(() => { console.log(`  ✓ ${name}`); passed++; })
            .catch((err: any) => { console.error(`  ✗ ${name}\n    ${err.message}`); failed++; });
    } else {
      console.log(`  ✓ ${name}`);
      passed++;
    }
  } catch (err: any) {
    console.error(`  ✗ ${name}\n    ${err.message}`);
    failed++;
  }
}

// ── 1. Levenshtein function (extracted inline) ────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  }
  return dp[m][n];
}

console.log("\n── Levenshtein ──────────────────────────────────────────────────────────────");

test("identical strings → 0", () => {
  assert.strictEqual(levenshtein("hello", "hello"), 0);
});

test("empty strings → 0", () => {
  assert.strictEqual(levenshtein("", ""), 0);
});

test("one empty → length of other", () => {
  assert.strictEqual(levenshtein("abc", ""), 3);
  assert.strictEqual(levenshtein("", "abc"), 3);
});

test("single substitution", () => {
  assert.strictEqual(levenshtein("cat", "bat"), 1);
});

test("single insertion", () => {
  assert.strictEqual(levenshtein("cat", "cats"), 1);
});

test("single deletion", () => {
  assert.strictEqual(levenshtein("cats", "cat"), 1);
});

test("near-duplicate titles (distance < 10) should be flagged", () => {
  const title1 = "RUTO SIGNS NEW BILL INTO LAW";
  const title2 = "RUTO SIGNS NEW BILL INTO LAW TODAY";
  assert.ok(levenshtein(title1.slice(0, 60), title2.slice(0, 60)) < 10);
});

test("completely different titles (distance >= 10) should pass", () => {
  const title1 = "RUTO SIGNS NEW BILL INTO LAW";
  const title2 = "DIAMOND PLATINUMZ RELEASES NEW ALBUM";
  assert.ok(levenshtein(title1.slice(0, 60), title2.slice(0, 60)) >= 10);
});

// ── 2. SSE line parsing logic ─────────────────────────────────────────────────
console.log("\n── SSE Line Parsing ─────────────────────────────────────────────────────────");

function parseSSELines(lines: string[]): any[] {
  const events: any[] = [];
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    try {
      events.push(JSON.parse(line.slice(6)));
    } catch { /* skip malformed */ }
  }
  return events;
}

function parseSSEBuffer(chunks: string[]): any[] {
  let buf = "";
  const events: any[] = [];
  for (const chunk of chunks) {
    buf += chunk;
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try { events.push(JSON.parse(line.slice(6))); } catch {}
    }
  }
  return events;
}

test("empty stream → no events", () => {
  assert.deepStrictEqual(parseSSELines([]), []);
});

test("single data: line → one event", () => {
  const events = parseSSELines(['data: {"pct":50,"step":"Uploading"}']);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].pct, 50);
});

test("multi-event stream → all events parsed", () => {
  const lines = [
    'data: {"pct":10,"step":"Scraping"}',
    'data: {"pct":50,"step":"Uploading"}',
    'data: {"pct":100,"step":"Done","done":true,"success":true}',
  ];
  const events = parseSSELines(lines);
  assert.strictEqual(events.length, 3);
  assert.strictEqual(events[2].done, true);
});

test("non-data: lines are ignored", () => {
  const lines = [
    "event: progress",
    ": keep-alive",
    'data: {"pct":25,"step":"Downloading"}',
    "",
    "retry: 3000",
  ];
  const events = parseSSELines(lines);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].pct, 25);
});

test("malformed JSON line is skipped without throwing", () => {
  const lines = [
    "data: {broken json",
    'data: {"pct":100,"done":true}',
  ];
  const events = parseSSELines(lines);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].done, true);
});

test("event split across two chunks is buffered correctly", () => {
  const payload = 'data: {"pct":100,"done":true,"success":true}\n';
  // Split at a random position in the middle
  const splitAt = 20;
  const chunks = [payload.slice(0, splitAt), payload.slice(splitAt)];
  const events = parseSSEBuffer(chunks);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].success, true);
});

test("multiple events split across chunks", () => {
  const full = 'data: {"pct":10}\ndata: {"pct":50}\ndata: {"pct":100,"done":true}\n';
  // Split into 3 uneven chunks
  const chunks = [full.slice(0, 15), full.slice(15, 40), full.slice(40)];
  const events = parseSSEBuffer(chunks);
  assert.strictEqual(events.length, 3);
  assert.strictEqual(events[2].done, true);
});

// ── 3. Middleware auth redirect logic ─────────────────────────────────────────
console.log("\n── Middleware Auth Logic ────────────────────────────────────────────────────");

const SESSION_COOKIE = "ppptv_admin_session";
const SESSION_VALUE  = "authenticated";
const PROTECTED_PATHS = ["/dashboard", "/composer", "/queue", "/analytics", "/settings", "/accounts", "/content"];

function shouldRedirect(pathname: string, cookieValue: string | undefined): boolean {
  const isProtected = PROTECTED_PATHS.some(p => pathname.startsWith(p));
  if (!isProtected) return false;
  return cookieValue !== SESSION_VALUE;
}

test("/composer without cookie → redirect", () => {
  assert.strictEqual(shouldRedirect("/composer", undefined), true);
});

test("/composer with wrong cookie → redirect", () => {
  assert.strictEqual(shouldRedirect("/composer", "wrong"), true);
});

test("/composer with valid cookie → no redirect", () => {
  assert.strictEqual(shouldRedirect("/composer", SESSION_VALUE), false);
});

test("/dashboard without cookie → redirect", () => {
  assert.strictEqual(shouldRedirect("/dashboard", undefined), true);
});

test("/login is not protected → no redirect", () => {
  assert.strictEqual(shouldRedirect("/login", undefined), false);
});

test("/api/post-video is not protected → no redirect", () => {
  assert.strictEqual(shouldRedirect("/api/post-video", undefined), false);
});

test("/ (root) is not protected → no redirect", () => {
  assert.strictEqual(shouldRedirect("/", undefined), false);
});

// ── 4. Blacklist domain/keyword matching logic ────────────────────────────────
console.log("\n── Blacklist Matching ───────────────────────────────────────────────────────");

interface BlacklistEntry { type: "domain" | "keyword"; value: string; }

function isBlacklisted(url: string, title: string, entries: BlacklistEntry[]): boolean {
  let domain = "";
  try { domain = new URL(url).hostname.toLowerCase(); } catch {}
  const titleLower = title.toLowerCase();
  return entries.some(e => {
    if (e.type === "domain") return domain.includes(e.value.toLowerCase());
    if (e.type === "keyword") return titleLower.includes(e.value.toLowerCase());
    return false;
  });
}

test("domain match → blacklisted", () => {
  const entries: BlacklistEntry[] = [{ type: "domain", value: "spam.com" }];
  assert.strictEqual(isBlacklisted("https://spam.com/video/123", "Some title", entries), true);
});

test("subdomain match → blacklisted", () => {
  const entries: BlacklistEntry[] = [{ type: "domain", value: "spam.com" }];
  assert.strictEqual(isBlacklisted("https://www.spam.com/video/123", "Some title", entries), true);
});

test("keyword match → blacklisted", () => {
  const entries: BlacklistEntry[] = [{ type: "keyword", value: "gambling" }];
  assert.strictEqual(isBlacklisted("https://legit.com/video", "Win big at gambling tonight", entries), true);
});

test("keyword match is case-insensitive", () => {
  const entries: BlacklistEntry[] = [{ type: "keyword", value: "GAMBLING" }];
  assert.strictEqual(isBlacklisted("https://legit.com/video", "Win big at gambling tonight", entries), true);
});

test("no match → not blacklisted", () => {
  const entries: BlacklistEntry[] = [
    { type: "domain", value: "spam.com" },
    { type: "keyword", value: "gambling" },
  ];
  assert.strictEqual(isBlacklisted("https://legit.com/video", "Celebrity news today", entries), false);
});

test("empty blacklist → not blacklisted", () => {
  assert.strictEqual(isBlacklisted("https://tiktok.com/video/123", "Great video", []), false);
});

test("invalid URL → domain check fails gracefully", () => {
  const entries: BlacklistEntry[] = [{ type: "domain", value: "spam.com" }];
  assert.strictEqual(isBlacklisted("not-a-url", "Some title", entries), false);
});

// ── Summary ───────────────────────────────────────────────────────────────────
setTimeout(() => {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 100);
