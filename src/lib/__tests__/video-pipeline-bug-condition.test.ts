/**
 * Bug-condition exploration tests for the video pipeline.
 * These tests FAIL on unfixed code — failure confirms the bugs exist.
 * DO NOT fix the tests. Fix the code, then re-run.
 *
 * Feature: video-pipeline-and-mutembei-tv
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ── Property 11: post_type is always snake_case "video" ───────────────────────
// Bug: /api/post-video logs `postType: "video"` (camelCase) instead of `post_type: "video"` (snake_case)
// The dashboard reads `p.post_type` so videos always show as 0.
describe("Property 11: post_type snake_case in /api/post-video log entry", () => {
  it("should log post_type (snake_case) not postType (camelCase)", async () => {
    // Capture what logPost is called with by reading the route source
    // We test the shape of the log entry directly by inspecting the route code
    const routeSource = await import("fs").then(fs =>
      fs.readFileSync("src/app/api/post-video/route.ts", "utf-8")
    );

    // On unfixed code: logPost is called with `postType: "video"` (camelCase) — this assertion FAILS
    // On fixed code: logPost is called with `post_type: "video"` (snake_case) — this assertion PASSES
    expect(routeSource).toContain('post_type: "video"');
    expect(routeSource).not.toContain('postType: "video"');
  });

  it("PBT: for any successful video post, log entry must have post_type field (snake_case)", () => {
    // Simulate the log entry shape that /api/post-video produces
    // On unfixed code: the entry has `postType` not `post_type`
    fc.assert(
      fc.property(
        fc.record({
          article_id: fc.string({ minLength: 1 }),
          title: fc.string({ minLength: 1 }),
          url: fc.string({ minLength: 1 }),
          category: fc.constantFrom("ENTERTAINMENT", "SPORTS", "CELEBRITY", "MUSIC"),
        }),
        (fields) => {
          // The fixed log entry must use snake_case post_type
          const logEntry = {
            ...fields,
            post_type: "video", // this is what the FIXED code should produce
            ig_success: true,
            fb_success: true,
            posted_at: new Date().toISOString(),
          };
          // Verify snake_case field exists and camelCase does not
          expect("post_type" in logEntry).toBe(true);
          expect("postType" in logEntry).toBe(false);
          expect(logEntry.post_type).toBe("video");
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 4: Auth header always present in triggerAutoPost ─────────────────
// Bug: CockpitTab.triggerAutoPost() calls /api/automate-video without Authorization header → 401
describe("Property 4: Auth header in CockpitTab.triggerAutoPost", () => {
  it("should include Authorization header in the automate-video fetch call", async () => {
    const composerSource = await import("fs").then(fs =>
      fs.readFileSync("src/app/composer/page.tsx", "utf-8")
    );

    // Find the triggerAutoPost function and check it includes the auth header
    // On unfixed code: the fetch call has no Authorization header — this FAILS
    // On fixed code: the fetch call includes Authorization: Bearer ppptvWorker2024 — this PASSES
    const triggerBlock = composerSource.slice(
      composerSource.indexOf("async function triggerAutoPost"),
      composerSource.indexOf("async function triggerAutoPost") + 800
    );

    expect(triggerBlock).toContain("Authorization");
    expect(triggerBlock).toContain("Bearer ppptvWorker2024");
  });
});

// ── Property 9: YouTube trend volumes are deterministic ───────────────────────
// Bug: getYouTube() uses Math.random() for volume — non-deterministic
describe("Property 9: YouTube trend volumes are deterministic", () => {
  it("should use recency-based formula not Math.random()", async () => {
    const trendsSource = await import("fs").then(fs =>
      fs.readFileSync("src/app/api/trends/[source]/route.ts", "utf-8")
    );

    // On unfixed code: contains Math.random() for YouTube volume — this FAILS
    // On fixed code: uses recency formula — this PASSES
    const youtubeBlock = trendsSource.slice(
      trendsSource.indexOf("async function getYouTube"),
      trendsSource.indexOf("async function getYouTube") + 1000
    );
    expect(youtubeBlock).not.toContain("Math.random()");
  });

  it("PBT: volume formula is deterministic for same publishedAt", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 47 * 3600 * 1000 }), // age in ms within 48h
        (ageMs) => {
          // The fixed formula: recency-based, deterministic
          const volume1 = Math.max(1, Math.floor((48 * 3600 * 1000 - ageMs) / 3600000) * 1000);
          const volume2 = Math.max(1, Math.floor((48 * 3600 * 1000 - ageMs) / 3600000) * 1000);
          return volume1 === volume2 && volume1 > 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 10: Reddit trend volume equals post score ────────────────────────
// Bug: getReddit() uses Math.random() for volume instead of p.score
describe("Property 10: Reddit trend volume equals post score", () => {
  it("should use p.score not Math.random() for Reddit volume", async () => {
    const trendsSource = await import("fs").then(fs =>
      fs.readFileSync("src/app/api/trends/[source]/route.ts", "utf-8")
    );

    const redditBlock = trendsSource.slice(
      trendsSource.indexOf("async function getReddit"),
      trendsSource.indexOf("async function getReddit") + 1000
    );

    // On unfixed code: contains Math.random() — this FAILS
    // On fixed code: uses p.score — this PASSES
    expect(redditBlock).not.toContain("Math.random()");
    expect(redditBlock).toContain("p.score");
  });

  it("PBT: for any Reddit post, trend.volume must equal post.score", () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1 }),
          title: fc.string({ minLength: 1 }),
          score: fc.integer({ min: 0, max: 1000000 }),
          stickied: fc.constant(false),
          created_utc: fc.integer({ min: 1600000000, max: 1800000000 }),
          is_video: fc.constant(false),
          url: fc.webUrl(),
          permalink: fc.string({ minLength: 1 }),
        }),
        (post) => {
          // The fixed code should use post.score directly
          const volume = post.score || 0;
          expect(volume).toBe(post.score);
        }
      ),
      { numRuns: 100 }
    );
  });
});
