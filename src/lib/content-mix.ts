/**
 * Content Mix Orchestrator
 * Enforces the 70/20/10 content strategy (viral clips / series / feature videos)
 * and tracks daily mix budget via Supabase.
 */
import { getMixBudgetRow, upsertMixBudget, MixBudgetRow } from "./supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContentType = "viral_clip" | "series" | "feature_video";

export interface MixBudget {
  date: string;
  viralClips: { used: number; target: number };
  series: { used: number; target: number };
  featureVideos: { used: number; target: number };
  totalPosts: number;
  dailyTarget: number;
}

export interface MixHealthReport {
  period: string;
  viralClipsPct: number;
  seriesPct: number;
  featureVideoPct: number;
  onTarget: boolean;
  recommendation: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns today's date as YYYY-MM-DD in UTC. */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Builds a zero-state MixBudget for a given date. */
function zeroState(date: string, dailyTarget = 10): MixBudget {
  return {
    date,
    viralClips:    { used: 0, target: Math.floor(dailyTarget * 0.70) },
    series:        { used: 0, target: Math.floor(dailyTarget * 0.20) },
    featureVideos: { used: 0, target: Math.floor(dailyTarget * 0.10) },
    totalPosts: 0,
    dailyTarget,
  };
}

/** Converts a MixBudgetRow from Supabase into a MixBudget. */
function rowToBudget(row: MixBudgetRow): MixBudget {
  const dt = row.daily_target || 10;
  return {
    date: row.date,
    viralClips:    { used: row.viral_clip_count,    target: Math.floor(dt * 0.70) },
    series:        { used: row.series_count,         target: Math.floor(dt * 0.20) },
    featureVideos: { used: row.feature_video_count,  target: Math.floor(dt * 0.10) },
    totalPosts: row.viral_clip_count + row.series_count + row.feature_video_count,
    dailyTarget: dt,
  };
}

// ── getMixBudget ──────────────────────────────────────────────────────────────

/**
 * Reads the mix budget for a given date from Supabase.
 * Returns a zero-state budget (dailyTarget=10) on any error.
 *
 * @param date - YYYY-MM-DD date string
 */
export async function getMixBudget(date: string): Promise<MixBudget> {
  try {
    const row = await getMixBudgetRow(date);
    if (!row) return zeroState(date);
    return rowToBudget(row);
  } catch {
    return zeroState(date);
  }
}

// ── updateBudget ──────────────────────────────────────────────────────────────

/**
 * Increments the appropriate count column in mix_budget for the given date.
 * Uses upsert so the row is created if it doesn't exist yet.
 *
 * @param date - YYYY-MM-DD date string
 * @param type - which content type was just published
 */
export async function updateBudget(date: string, type: ContentType): Promise<void> {
  // Read current row first so we can increment correctly
  const current = await getMixBudget(date);
  const partial: Partial<import("./supabase").MixBudgetRow> = { date };

  if (type === "viral_clip") {
    partial.viral_clip_count = current.viralClips.used + 1;
  } else if (type === "series") {
    partial.series_count = current.series.used + 1;
  } else {
    partial.feature_video_count = current.featureVideos.used + 1;
  }

  await upsertMixBudget(partial);
}

// ── selectPipeline ────────────────────────────────────────────────────────────

/**
 * Pure function — determines which content pipeline to use based on the
 * current day's mix budget and deficit calculation.
 *
 * Logic:
 * - If no posts yet, return "viral_clip"
 * - If series is under 20% target, return "series"
 * - If feature_video is significantly under 10% target (>5% deficit), return "feature_video"
 * - Default: return "viral_clip"
 *
 * @param budget - current day's MixBudget
 */
export function selectPipeline(budget: MixBudget): ContentType {
  const total = budget.totalPosts;
  if (total === 0) return "viral_clip";

  const actualSeriesPct  = budget.series.used        / total;
  const actualFeaturePct = budget.featureVideos.used  / total;

  const seriesDeficit  = 0.20 - actualSeriesPct;
  const featureDeficit = 0.10 - actualFeaturePct;

  if (seriesDeficit > 0) return "series";
  if (featureDeficit > 0.05) return "feature_video";
  return "viral_clip";
}

// ── getDailyMixReport ─────────────────────────────────────────────────────────

/**
 * Reads the last N days of mix_budget rows and calculates aggregate percentages.
 * Returns a MixHealthReport with actual vs target percentages and a recommendation.
 *
 * Rolling window: defaults to 7 days.
 * onTarget = all types within 5% of their target percentage.
 *
 * @param days - number of days to look back (default 7)
 */
export async function getDailyMixReport(days = 7): Promise<MixHealthReport> {
  const period = `Last ${days} days`;

  // Collect rows for each day in the window
  const rows: MixBudget[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    rows.push(await getMixBudget(d));
  }

  const totalViral   = rows.reduce((s, r) => s + r.viralClips.used,    0);
  const totalSeries  = rows.reduce((s, r) => s + r.series.used,         0);
  const totalFeature = rows.reduce((s, r) => s + r.featureVideos.used,  0);
  const grandTotal   = totalViral + totalSeries + totalFeature;

  if (grandTotal === 0) {
    return {
      period,
      viralClipsPct: 0,
      seriesPct: 0,
      featureVideoPct: 0,
      onTarget: true,
      recommendation: "No posts recorded in this period.",
    };
  }

  const viralClipsPct  = Math.round((totalViral   / grandTotal) * 100);
  const seriesPct      = Math.round((totalSeries  / grandTotal) * 100);
  const featureVideoPct = Math.round((totalFeature / grandTotal) * 100);

  const viralDiff   = viralClipsPct  - 70;
  const seriesDiff  = seriesPct      - 20;
  const featureDiff = featureVideoPct - 10;

  const onTarget =
    Math.abs(viralDiff)   <= 5 &&
    Math.abs(seriesDiff)  <= 5 &&
    Math.abs(featureDiff) <= 5;

  let recommendation = "Content mix is on target";
  if (!onTarget) {
    const parts: string[] = [];
    if (viralDiff < -5)   parts.push(`Increase viral clips by ${Math.abs(viralDiff)}%`);
    if (viralDiff > 5)    parts.push(`Reduce viral clips by ${viralDiff}%`);
    if (seriesDiff < -5)  parts.push(`Increase series posts by ${Math.abs(seriesDiff)}%`);
    if (seriesDiff > 5)   parts.push(`Reduce series posts by ${seriesDiff}%`);
    if (featureDiff < -5) parts.push(`Increase feature videos by ${Math.abs(featureDiff)}%`);
    if (featureDiff > 5)  parts.push(`Reduce feature videos by ${featureDiff}%`);
    recommendation = parts.join("; ");
  }

  return { period, viralClipsPct, seriesPct, featureVideoPct, onTarget, recommendation };
}

// Re-export todayStr for convenience
export { todayStr };
