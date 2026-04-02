/**
 * Bug Condition Exploration Tests — pages-not-working
 *
 * These tests are EXPECTED TO FAIL on unfixed code.
 * Failures confirm the bugs exist. That is the success condition for Task 1.
 *
 * Groups:
 *   A — wrong/dead endpoints
 *   B — field name mismatch
 *   C — missing Shell wrapper
 *   D — deleted feature still present
 *   E — UX/CORS gaps
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Read a source file relative to the workspace root */
function src(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");
}

// ─── Group A — wrong/dead endpoints ──────────────────────────────────────────

describe("Group A — wrong/dead endpoints", () => {
  it("A1: StatusPage calls /api/admin/health (not /api/post-log)", () => {
    const code = src("src/app/status/page.tsx");
    // BUG: page calls the non-existent /api/admin/health route
    // EXPECTED AFTER FIX: should call /api/post-log
    expect(code).toContain("/api/post-log");
    // This will FAIL because the current code calls /api/admin/health
  });

  it("A2: QueuePage fetch is called with the correct worker URL (not ppp-tv-worker)", () => {
    const code = src("src/app/queue/page.tsx");
    // BUG: uses ppp-tv-worker.euginemicah.workers.dev (wrong/stale URL)
    // EXPECTED AFTER FIX: should use auto-ppp-tv.euginemicah.workers.dev
    expect(code).not.toContain("ppp-tv-worker.euginemicah.workers.dev");
    // This will FAIL because the current code still has the wrong URL
  });

  it("A3: CockpitTab load() calls /api/post-log (not WORKER + /post-log directly)", () => {
    const code = src("src/app/composer/page.tsx");
    // BUG: CockpitTab fetches WORKER + "/post-log" directly, bypassing app auth
    // EXPECTED AFTER FIX: should call /api/post-log with credentials: "include"
    // Check that the direct worker call is gone
    expect(code).not.toMatch(/fetch\s*\(\s*WORKER\s*\+\s*["']\/post-log["']/);
    // This will FAIL because the current code calls WORKER + "/post-log"
  });

  it("A4: triggerNow in DashboardPage includes Authorization header", () => {
    const code = src("src/app/dashboard/page.tsx");
    // BUG: triggerNow calls /trigger with no Authorization header
    // EXPECTED AFTER FIX: should include Authorization: Bearer ppptvWorker2024
    // Find the triggerNow function and check it has an Authorization header
    const triggerNowMatch = code.match(/async function triggerNow[\s\S]*?^\s*}/m);
    // Broader search: look for the trigger fetch call with auth header
    const hasTriggerWithAuth = /euginemicah\.workers\.dev\/trigger[\s\S]{0,200}Authorization/.test(code) ||
      /Authorization[\s\S]{0,200}euginemicah\.workers\.dev\/trigger/.test(code);
    expect(hasTriggerWithAuth).toBe(true);
    // This will FAIL because triggerNow has no Authorization header
  });
});

// ─── Group B — field name mismatch ───────────────────────────────────────────

describe("Group B — field name mismatch", () => {
  it("B1: AnalyticsPage reads ig_success (not instagram.success) from log entries", () => {
    const code = src("src/app/analytics/page.tsx");
    // BUG: reads p.instagram.success which is undefined for Supabase snake_case data
    // EXPECTED AFTER FIX: should read p.ig_success
    expect(code).toContain("ig_success");
    // This will FAIL because the current code uses p.instagram.success
  });

  it("B2: ContentPage reads ig_success / fb_success (not instagram.success / facebook.success)", () => {
    const code = src("src/app/content/page.tsx");
    // BUG: reads entry.instagram.success / entry.facebook.success — undefined for Supabase data
    // EXPECTED AFTER FIX: should read entry.ig_success / entry.fb_success
    expect(code).toContain("ig_success");
    // This will FAIL because the current code uses entry.instagram.success
  });
});

// ─── Group C — missing Shell wrapper ─────────────────────────────────────────

describe("Group C — missing Shell wrapper", () => {
  it("C1: StatusPage source includes <Shell> wrapper", () => {
    const code = src("src/app/status/page.tsx");
    // BUG: StatusPage renders a bare <div> with no Shell wrapper
    // EXPECTED AFTER FIX: should be wrapped in <Shell>
    expect(code).toMatch(/<Shell[\s>]/);
    // This will FAIL because StatusPage has no Shell wrapper
  });

  it("C2: AboutPage source includes a nav header (Shell or back-link bar)", () => {
    const code = src("src/app/about/page.tsx");
    // BUG: AboutPage renders without any nav header
    // EXPECTED AFTER FIX: should have a top bar with PPP TV logo and ← Dashboard link
    // The fix adds a styled top bar div with the logo and back link
    expect(code).toMatch(/PPP.*TV|← Dashboard|Back to Dashboard/);
    // NOTE: current code only has a plain "← Back to Dashboard" anchor at the bottom,
    // not a proper nav header at the top. The fix adds a proper top bar.
    // We check for the top bar pattern specifically:
    // Check for the top bar pattern: a div with borderBottom styling at the top
    expect(code).toContain("borderBottom");
    expect(code).toContain("0a0a0a");
    // This will FAIL because AboutPage has no nav header bar
  });

  it("C3: PrivacyPage source includes a nav header (Shell or back-link bar)", () => {
    const code = src("src/app/privacy/page.tsx");
    // BUG: PrivacyPage renders without any nav header
    // EXPECTED AFTER FIX: should have a top bar with PPP TV logo and ← Dashboard link
    // Check for the top bar pattern: a div with borderBottom styling at the top
    expect(code).toContain("borderBottom");
    expect(code).toContain("0a0a0a");
    // This will FAIL because PrivacyPage has no nav header bar
  });
});

// ─── Group D — deleted feature still present ─────────────────────────────────

describe("Group D — deleted feature still present", () => {
  it("D1: src/app/clipper/page.tsx file does NOT exist", () => {
    const clipperPath = path.resolve(process.cwd(), "src/app/clipper/page.tsx");
    // BUG: the clipper page file still exists and should have been deleted
    // EXPECTED AFTER FIX: file should not exist
    expect(fs.existsSync(clipperPath)).toBe(false);
    // This will FAIL because the file currently exists
  });

  it("D2: Shell NAV array does NOT contain an entry with href /clipper", () => {
    const code = src("src/app/shell.tsx");
    // BUG: Shell NAV array still has { href: "/clipper", ... }
    // EXPECTED AFTER FIX: /clipper entry should be removed from NAV
    expect(code).not.toContain('"/clipper"');
    // This will FAIL because shell.tsx still has the /clipper nav entry
  });
});

// ─── Group E — UX/CORS gaps ───────────────────────────────────────────────────

describe("Group E — UX/CORS gaps", () => {
  it("E1: CompetitorsPage fetchYouTubeFeed calls /api/competitors/feed (not youtube.com directly)", () => {
    const code = src("src/app/competitors/page.tsx");
    // BUG: fetchYouTubeFeed fetches https://www.youtube.com/feeds/... directly from browser
    // EXPECTED AFTER FIX: should call /api/competitors/feed?channelId=...
    expect(code).toContain("/api/competitors/feed");
    // This will FAIL because the current code calls youtube.com directly
  });

  it("E2: FactoryPage renders a retry button for failed items", () => {
    const code = src("src/app/factory/page.tsx");
    // BUG: failed items show an error string but no retry button
    // EXPECTED AFTER FIX: should have a retry button (↺ Retry or similar) for error status items
    // Check that there's a retry button in the error state render path
    const hasRetryInErrorBlock = /status.*error[\s\S]{0,500}[Rr]etry|[Rr]etry[\s\S]{0,500}status.*error/.test(code);
    expect(hasRetryInErrorBlock).toBe(true);
    // This will FAIL because the current factory page has no retry button for failed items
  });
});
