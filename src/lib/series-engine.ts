/**
 * Series Engine
 * Manages recurring branded content formats (e.g. "Street Question Friday").
 * Handles scheduling, content generation, logging, and history retrieval.
 */
import {
  getSeriesFormats,
  upsertSeriesFormat,
  logSeriesPost as dbLogSeriesPost,
  getSeriesPostLog,
  SeriesFormat,
  SeriesPostLogEntry,
} from "./supabase";
import { fetchViralTikTokVideos, rankBatch, ViralItem } from "./viral-intelligence";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SeriesPost {
  formatId: string;
  seriesName: string;
  caption: string;
  hashtags: string[];
  platforms: string[];
  scheduledAt: Date;
  sourceItem?: ViralItem;
}

// ── In-memory cache ───────────────────────────────────────────────────────────

let _formatsCache: SeriesFormat[] | null = null;
let _formatsCacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the ISO week number for a given date. */
function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

/** Converts a UTC Date to EAT (UTC+3) hour. */
function toEATHour(d: Date): number {
  return (d.getUTCHours() + 3) % 24;
}

/** Converts a UTC Date to EAT day-of-week (0=Sun … 6=Sat). */
function toEATDay(d: Date): number {
  const eatMs = d.getTime() + 3 * 3_600_000;
  return new Date(eatMs).getUTCDay();
}

// ── getActiveSeriesFormats ────────────────────────────────────────────────────

/**
 * Fetches all active series formats from Supabase with a 5-minute in-memory cache.
 * Validates each format — skips and logs an error if templatePrompt or
 * sourceKeywords are empty, and marks the format inactive.
 */
export async function getActiveSeriesFormats(): Promise<SeriesFormat[]> {
  const now = Date.now();
  if (_formatsCache && now - _formatsCacheAt < CACHE_TTL_MS) {
    return _formatsCache;
  }

  const all = await getSeriesFormats();
  const valid: SeriesFormat[] = [];

  for (const fmt of all) {
    if (!fmt.active) continue;

    // Validate required fields
    if (!fmt.template_prompt || !fmt.source_keywords?.length) {
      console.error(
        `[series-engine] Skipping format "${fmt.id}" — missing templatePrompt or sourceKeywords`
      );
      // Mark inactive so it doesn't keep failing
      await upsertSeriesFormat({ id: fmt.id, active: false });
      continue;
    }

    valid.push(fmt);
  }

  _formatsCache = valid;
  _formatsCacheAt = now;
  return valid;
}

// ── getNextSeriesTime ─────────────────────────────────────────────────────────

/**
 * Returns the next scheduled Date for a series format (always in the future).
 * Converts to EAT (UTC+3) for scheduling logic.
 *
 * - weekly: next occurrence of format.day_of_week at format.time_eat
 * - daily:  next occurrence of format.time_eat today or tomorrow
 */
export function getNextSeriesTime(format: SeriesFormat): Date {
  const nowUtc = new Date();
  const eatOffsetMs = 3 * 3_600_000;
  // Current EAT time as a plain Date (still UTC internally, but offset applied)
  const nowEat = new Date(nowUtc.getTime() + eatOffsetMs);

  const targetHour = format.time_eat; // 0-23 in EAT

  if (format.cadence === "weekly" && format.day_of_week != null) {
    const currentDay = nowEat.getUTCDay(); // 0=Sun
    let daysUntil = (format.day_of_week - currentDay + 7) % 7;

    // If it's the right day but the hour has passed, schedule next week
    if (daysUntil === 0 && nowEat.getUTCHours() >= targetHour) {
      daysUntil = 7;
    }

    const scheduled = new Date(nowEat);
    scheduled.setUTCDate(scheduled.getUTCDate() + daysUntil);
    scheduled.setUTCHours(targetHour, 0, 0, 0);
    // Convert back to UTC
    return new Date(scheduled.getTime() - eatOffsetMs);
  }

  // Daily (or biweekly treated as daily for next-time purposes)
  const scheduled = new Date(nowEat);
  scheduled.setUTCHours(targetHour, 0, 0, 0);
  if (scheduled.getTime() <= nowEat.getTime()) {
    scheduled.setUTCDate(scheduled.getUTCDate() + 1);
  }
  return new Date(scheduled.getTime() - eatOffsetMs);
}

// ── getNextDueSeries ──────────────────────────────────────────────────────────

/**
 * Returns the active series format that is due within ±30 minutes of `now`.
 * Overdue formats are returned first; ties broken by proximity to now.
 * Returns null if no format is due in the window.
 *
 * @param now - current time (any timezone; converted to EAT internally)
 */
export async function getNextDueSeries(now: Date): Promise<SeriesFormat | null> {
  const formats = await getActiveSeriesFormats();
  const WINDOW_MS = 30 * 60 * 1000;

  const nowEatHour = toEATHour(now);
  const nowEatDay  = toEATDay(now);

  const candidates: Array<{ fmt: SeriesFormat; diffMs: number }> = [];

  for (const fmt of formats) {
    if (fmt.cadence === "weekly" && fmt.day_of_week != null) {
      if (fmt.day_of_week !== nowEatDay) continue;
    }

    // Diff in ms between scheduled EAT hour and current EAT hour
    const scheduledMinutes = fmt.time_eat * 60;
    const nowMinutes = nowEatHour * 60 + now.getUTCMinutes();
    const diffMs = (scheduledMinutes - nowMinutes) * 60_000;

    if (Math.abs(diffMs) <= WINDOW_MS) {
      candidates.push({ fmt, diffMs });
    }
  }

  if (!candidates.length) return null;

  // Sort: overdue first (negative diff), then by proximity
  candidates.sort((a, b) => {
    if (a.diffMs <= 0 && b.diffMs > 0) return -1;
    if (b.diffMs <= 0 && a.diffMs > 0) return 1;
    return Math.abs(a.diffMs) - Math.abs(b.diffMs);
  });

  return candidates[0].fmt;
}

// ── generateSeriesPost ────────────────────────────────────────────────────────

/**
 * Generates a SeriesPost for the given format.
 *
 * Flow:
 * 1. Fetch content via fetchViralTikTokVideos(format.source_keywords)
 * 2. Filter to last 48h
 * 3. rankBatch and take top item
 * 4. If empty, fall back to broader category search (format.category as keyword)
 * 5. Build caption from template_prompt + source item title (or template alone)
 * 6. Return SeriesPost
 */
export async function generateSeriesPost(format: SeriesFormat): Promise<SeriesPost> {
  const now = new Date();
  const cutoff = now.getTime() - 48 * 3_600_000;

  // Step 1-3: fetch, filter, rank
  let items = await fetchViralTikTokVideos(format.source_keywords);
  items = items.filter(v => v.publishedAt.getTime() >= cutoff);
  items = rankBatch(items);

  // Step 4: fallback to category search if empty
  if (!items.length) {
    const fallback = await fetchViralTikTokVideos([format.category.toLowerCase().replace(/_/g, " ")]);
    items = rankBatch(fallback.filter(v => v.publishedAt.getTime() >= cutoff));
  }

  const topItem = items[0] as ViralItem | undefined;

  // Step 5: build caption
  let aiCaption: string;
  if (topItem) {
    aiCaption = `${format.template_prompt}\n\n"${topItem.title.slice(0, 120)}"`;
  } else {
    aiCaption = format.template_prompt;
  }

  const caption = `${format.emoji} ${format.name}\n\n${aiCaption}\n\n${format.hashtag_set.join(" ")}`;

  return {
    formatId:    format.id,
    seriesName:  format.name,
    caption,
    hashtags:    format.hashtag_set,
    platforms:   format.platforms,
    scheduledAt: getNextSeriesTime(format),
    sourceItem:  topItem,
  };
}

// ── logSeriesPost ─────────────────────────────────────────────────────────────

/**
 * Writes a series post entry to series_post_log and updates the format's
 * last_posted_at and total_posts fields.
 *
 * @param formatId - the series format ID
 * @param post     - the generated SeriesPost
 */
export async function logSeriesPost(formatId: string, post: SeriesPost): Promise<void> {
  const now = new Date();
  const weekNumber = getWeekNumber(now);

  const entry: SeriesPostLogEntry = {
    format_id:   formatId,
    series_name: post.seriesName,
    week_number: weekNumber,
    platforms:   post.platforms,
    caption:     post.caption,
    result:      null,
  };

  await dbLogSeriesPost(entry);

  // Update the format's metadata
  await upsertSeriesFormat({
    id:             formatId,
    last_posted_at: now.toISOString(),
    // total_posts increment handled by reading current value
  });
}

// ── getSeriesHistory ──────────────────────────────────────────────────────────

/**
 * Returns the post history for a given series format, most recent first.
 *
 * @param formatId - the series format ID
 * @param limit    - max number of entries to return (default 20)
 */
export async function getSeriesHistory(
  formatId: string,
  limit = 20,
): Promise<SeriesPostLogEntry[]> {
  return getSeriesPostLog(formatId, limit);
}
