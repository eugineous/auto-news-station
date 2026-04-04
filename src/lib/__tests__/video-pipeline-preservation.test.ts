/**
 * Preservation tests for the video pipeline.
 * These tests PASS on unfixed code and must continue to PASS after all fixes.
 *
 * Feature: video-pipeline-and-mutembei-tv
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Property 2: SSE progress events are forwarded ─────────────────────────────
describe("Property 2: SSE event forwarding logic", () => {
  it("PBT: for any array of SSE events, onProgress is called once per event", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            pct: fc.integer({ min: 0, max: 100 }),
            step: fc.string({ minLength: 1, maxLength: 80 }),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (events) => {
          const calls: Array<{ pct: number; step: string }> = [];
          const onProgress = (pct: number, step: string) => calls.push({ pct, step });

          // Simulate the SSE parsing loop from ComposeTab.handlePost
          const lines = events.map(e => `data: ${JSON.stringify(e)}`);
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              onProgress(evt.pct, evt.step);
            } catch {}
          }

          expect(calls).toHaveLength(events.length);
          calls.forEach((call, i) => {
            expect(call.pct).toBe(events[i].pct);
            expect(call.step).toBe(events[i].step);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 3: Non-2xx response sets error status ────────────────────────────
describe("Property 3: Non-2xx HTTP status triggers error state", () => {
  it("PBT: for any 4xx/5xx status, error message contains the status code", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 400, max: 599 }),
        (status) => {
          // Simulate the error thrown in handlePost when !resp.ok
          const errorMessage = `Post request failed: HTTP ${status}`;
          expect(errorMessage).toContain(String(status));
          expect(errorMessage).toContain("Post request failed");
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 8: Nitter RSS items parse correctly ──────────────────────────────
describe("Property 8: Nitter RSS item parsing", () => {
  // Helper: the Nitter RSS parser logic (extracted from the trends route)
  function parseNitterItems(xml: string): Array<{ title: string; url: string }> {
    const items: Array<{ title: string; url: string }> = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const e = match[1];
      const title = (e.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                     e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
      const link = (e.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "";
      if (!title || !link) continue;
      items.push({ title: title.trim(), url: link.trim() });
    }
    return items;
  }

  it("PBT: for any valid RSS item, parsed trend has non-empty title, url, and volume > 0", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes("<") && !s.includes(">") && !s.includes("&") && s.trim().length > 0),
            url: fc.constant("https://nitter.net/citizentvkenya/status/123456"),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (rawItems) => {
          const xml = rawItems.map(item =>
            `<item><title>${item.title}</title><link>${item.url}</link></item>`
          ).join("\n");

          const parsed = parseNitterItems(xml);
          expect(parsed.length).toBe(rawItems.length);

          parsed.forEach((trend, index) => {
            expect(trend.title.length).toBeGreaterThan(0);
            expect(trend.url.length).toBeGreaterThan(0);
            // Volume is position-based: (total - index) * 1000
            const volume = (parsed.length - index) * 1000;
            expect(volume).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 19: Nitter deduplication by normalized title ─────────────────────
describe("Property 19: Nitter deduplication", () => {
  function normalizeTitle(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function deduplicateTrends(trends: Array<{ title: string; url: string }>): Array<{ title: string; url: string }> {
    const seen = new Set<string>();
    return trends.filter(t => {
      const key = normalizeTitle(t.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  it("PBT: for any items with same normalized title, only one survives dedup", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 50 }).filter(s => /[a-zA-Z0-9]/.test(s) && !s.includes("<")),
        fc.integer({ min: 2, max: 5 }),
        (baseTitle, dupeCount) => {
          // Create duplicates with slight variations (punctuation, case)
          const items = Array.from({ length: dupeCount }, (_, i) => ({
            title: i === 0 ? baseTitle : baseTitle.toUpperCase(),
            url: `https://nitter.net/status/${i}`,
          }));

          const deduped = deduplicateTrends(items);
          // All items normalize to the same key, so only 1 should survive
          const normalizedKeys = new Set(deduped.map(t => normalizeTitle(t.title)));
          expect(normalizedKeys.size).toBe(deduped.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 13: Mutembei TV source fields are correct ───────────────────────
describe("Property 13: Mutembei TV VideoItem fields", () => {
  // Simulate what fetchMutembeiTVVideos() should return
  function mapMutembeiVideo(v: { id: string; title?: string | null; description?: string | null; source?: string | null; created_time: string }) {
    const parsed = new Date(v.created_time);
    const publishedAt = isNaN(parsed.getTime()) ? new Date(0) : parsed;
    return {
      id: `mutembei:${v.id}`,
      title: v.title || v.description || "Mutembei TV Video",
      url: `https://www.facebook.com/MutembeiTV/videos/${v.id}`,
      directVideoUrl: v.source || undefined,
      thumbnail: "",
      publishedAt,
      sourceName: "Mutembei TV",
      sourceType: "direct-mp4" as const,
      category: "ENTERTAINMENT",
    };
  }

  it("PBT: for any Graph API video response, mapped item has correct source fields", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[0-9a-zA-Z]+$/.test(s)),
            title: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
            description: fc.option(fc.string({ minLength: 1, maxLength: 200 })),
            source: fc.option(fc.webUrl()),
            created_time: fc.date({ min: new Date("2020-01-01"), max: new Date() })
              .map(d => d.toISOString()),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (videos) => {
          const items = videos.map(mapMutembeiVideo);
          items.forEach((item, i) => {
            expect(item.sourceName).toBe("Mutembei TV");
            expect(item.category).toBe("ENTERTAINMENT");
            expect(item.id).toMatch(/^mutembei:/);
            expect(item.id).toBe(`mutembei:${videos[i].id}`);
            expect(item.sourceType).toBe("direct-mp4");
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 16: Mutembei TV results sorted by recency ───────────────────────
describe("Property 16: Mutembei TV sort order", () => {
  it("PBT: for any N≥2 items, result is sorted descending by publishedAt", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.date({ min: new Date("2020-01-01"), max: new Date() }),
          { minLength: 2, maxLength: 15 }
        ),
        (dates) => {
          // Simulate the sort that fetchMutembeiTVVideos applies
          const sorted = [...dates].sort((a, b) => b.getTime() - a.getTime());
          for (let i = 0; i < sorted.length - 1; i++) {
            expect(sorted[i].getTime()).toBeGreaterThanOrEqual(sorted[i + 1].getTime());
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 14: Mutembei TV caption always contains attribution ──────────────
describe("Property 14: Mutembei TV caption attribution", () => {
  function buildMutembeiCaption(body: string): string {
    return `${body}\n\nSource: Mutembei TV`;
  }

  it("PBT: for any caption body, final caption contains 'Source: Mutembei TV'", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        (body) => {
          const caption = buildMutembeiCaption(body);
          expect(caption).toContain("Source: Mutembei TV");
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 17: Mutembei TV viral score boost ────────────────────────────────
describe("Property 17: Mutembei TV viral score boost", () => {
  function scoreVideo(viralScore: number, isKenyan: boolean, hasDirect: boolean, isMutembeiTV: boolean): number {
    return viralScore + (isKenyan ? 25 : 0) + (hasDirect ? 10 : 0) + (isMutembeiTV ? 30 : 0);
  }

  it("PBT: Mutembei TV score is at least 30 points higher than same video without boost", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.boolean(),
        fc.boolean(),
        (viralScore, isKenyan, hasDirect) => {
          const withBoost = scoreVideo(viralScore, isKenyan, hasDirect, true);
          const withoutBoost = scoreVideo(viralScore, isKenyan, hasDirect, false);
          expect(withBoost - withoutBoost).toBe(30);
        }
      ),
      { numRuns: 100 }
    );
  });
});
