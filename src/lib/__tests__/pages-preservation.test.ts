/**
 * Preservation Property Tests — pages-not-working
 *
 * These tests verify behaviors that must NOT change after the fixes are applied.
 * They MUST PASS on the current unfixed code.
 *
 * **Validates: Requirements 3.1 – 3.12**
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/** Read a source file relative to the workspace root */
function src(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");
}

// ─── P1: Middleware protects the correct routes ───────────────────────────────

describe("P1: Middleware PROTECTED routes", () => {
  it("PROTECTED array contains all expected protected routes", () => {
    const code = src("src/middleware.ts");
    const expected = [
      "/dashboard",
      "/composer",
      "/queue",
      "/analytics",
      "/settings",
      "/accounts",
      "/content",
      "/trends",
      "/calendar",
      "/intelligence",
      "/factory",
      "/competitors",
    ];
    for (const route of expected) {
      expect(code).toContain(`"${route}"`);
    }
  });
});

// ─── P2: Middleware does NOT protect /clipper ─────────────────────────────────

describe("P2: Middleware does NOT protect /clipper", () => {
  it("PROTECTED array does not contain /clipper", () => {
    const code = src("src/middleware.ts");
    // Extract the PROTECTED array content
    const match = code.match(/const PROTECTED\s*=\s*\[([^]*?)\]/);
    expect(match).not.toBeNull();
    const arrayContent = match![1];
    expect(arrayContent).not.toContain('"/clipper"');
  });
});

// ─── P3: Shell NAV contains all expected non-clipper nav items ────────────────

describe("P3: Shell NAV contains all expected nav items", () => {
  it("NAV array contains hrefs for all expected pages", () => {
    const code = src("src/app/shell.tsx");
    const expectedHrefs = [
      "/dashboard",
      "/composer",
      "/trends",
      "/calendar",
      "/intelligence",
      "/factory",
      "/competitors",
      "/analytics",
      "/accounts",
      "/settings",
    ];
    for (const href of expectedHrefs) {
      expect(code).toContain(`"${href}"`);
    }
  });
});

// ─── P4: CalendarPage reads posted_at (snake_case) ───────────────────────────

describe("P4: CalendarPage uses posted_at field", () => {
  it("calendar/page.tsx references posted_at for post records", () => {
    const code = src("src/app/calendar/page.tsx");
    expect(code).toContain("posted_at");
  });
});

// ─── P5: DashboardPage clearCache includes Authorization header ───────────────

describe("P5: DashboardPage clearCache has Authorization header", () => {
  it("dashboard/page.tsx clearCache fetch includes Authorization header", () => {
    const code = src("src/app/dashboard/page.tsx");
    // The clearCache function must include an Authorization header
    expect(code).toContain("Authorization");
    // Specifically in the context of clearCache
    const hasClearCacheWithAuth =
      /clearCache[\s\S]{0,400}Authorization/.test(code) ||
      /Authorization[\s\S]{0,400}clearCache/.test(code);
    expect(hasClearCacheWithAuth).toBe(true);
  });
});

// ─── P6: ComposerPage Compose tab uses /api/post-video ───────────────────────

describe("P6: ComposerPage Compose tab uses /api/post-video", () => {
  it("composer/page.tsx contains /api/post-video endpoint", () => {
    const code = src("src/app/composer/page.tsx");
    expect(code).toContain("/api/post-video");
  });
});

// ─── P7: QueuePage post action uses /api/post-from-url ───────────────────────

describe("P7: QueuePage post action uses /api/post-from-url", () => {
  it("queue/page.tsx contains /api/post-from-url endpoint", () => {
    const code = src("src/app/queue/page.tsx");
    expect(code).toContain("/api/post-from-url");
  });
});

// ─── P8: Login page uses /api/auth POST ──────────────────────────────────────

describe("P8: Login page uses /api/auth for authentication", () => {
  it("login/page.tsx contains /api/auth endpoint", () => {
    const code = src("src/app/login/page.tsx");
    expect(code).toContain("/api/auth");
  });
});

// ─── P9: Shell has MOBILE_NAV array ──────────────────────────────────────────

describe("P9: Shell has mobile bottom nav", () => {
  it("shell.tsx contains MOBILE_NAV array", () => {
    const code = src("src/app/shell.tsx");
    expect(code).toContain("MOBILE_NAV");
  });
});

// ─── P10: IntelligencePage uses credentials: "include" ───────────────────────

describe("P10: IntelligencePage uses credentials: include", () => {
  it('intelligence/page.tsx contains credentials: "include"', () => {
    const code = src("src/app/intelligence/page.tsx");
    expect(code).toContain('credentials: "include"');
  });
});
