/**
 * Supabase client — replaces Cloudflare KV for post logs, dedup, agent state, blacklist
 * Project: xptxfqxononfdjndjalx (eu-central-1)
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://xptxfqxononfdjndjalx.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwdHhmcXhvbm9uZmRqbmRqYWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNTUyMjgsImV4cCI6MjA5MDYzMTIyOH0.IJXZ00sJMaHe8iNOfd7TnG3Fsvcu_8WrfG7vNHppq-I";

// Server-side client (full access via service role — bypasses RLS)
// MUST use SUPABASE_SERVICE_KEY for writes to seen_articles and posts
export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

// Client-side client (read-only via anon key)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// ── Post log ──────────────────────────────────────────────────────────────────
export interface PostRecord {
  article_id?: string;
  title: string;
  url?: string;
  category?: string;
  source_name?: string;
  source_type?: string;
  thumbnail?: string;
  post_type?: "image" | "video" | "carousel";
  ig_success?: boolean;
  ig_post_id?: string;
  ig_error?: string;
  fb_success?: boolean;
  fb_post_id?: string;
  fb_error?: string;
  blocked?: boolean;
  block_reason?: string;
  ab_variant?: string;
  posted_at?: string;
}

export async function logPost(record: PostRecord): Promise<void> {
  try {
    if (record.article_id) {
      // Upsert on article_id — prevents duplicate rows if the same article is posted twice
      await supabaseAdmin
        .from("posts")
        .upsert({ ...record, posted_at: record.posted_at || new Date().toISOString() }, { onConflict: "article_id" });
    } else {
      await supabaseAdmin.from("posts").insert(record);
    }
  } catch (err) {
    console.warn("[supabase] logPost failed:", err);
  }
}

export async function getPostLog(limit = 50, daysBack = 7): Promise<PostRecord[]> {
  try {
    const since = new Date(Date.now() - daysBack * 86400000).toISOString();
    const { data } = await supabaseAdmin
      .from("posts")
      .select("*")
      .gte("posted_at", since)
      .order("posted_at", { ascending: false })
      .limit(limit * 3); // fetch extra to account for dedup
    if (!data) return [];

    // Deduplicate by article_id — keep only the most recent row per article
    const seen = new Set<string>();
    const deduped: PostRecord[] = [];
    for (const row of data) {
      const key = row.article_id || row.title?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
      if (deduped.length >= limit) break;
    }
    return deduped;
  } catch { return []; }
}

export async function getTodayPostCount(): Promise<number> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count } = await supabaseAdmin
      .from("posts")
      .select("*", { count: "exact", head: true })
      .gte("posted_at", today.toISOString())
      .eq("blocked", false);
    return count || 0;
  } catch { return 0; }
}

// ── Dedup ─────────────────────────────────────────────────────────────────────
export async function isArticleSeen(id: string, titleFp?: string): Promise<boolean> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    // Check by id
    const { data: byId } = await supabaseAdmin
      .from("seen_articles")
      .select("id")
      .eq("id", id)
      .gte("seen_at", thirtyDaysAgo)
      .maybeSingle();
    if (byId) return true;

    // Check by title fingerprint if provided
    if (titleFp) {
      const { data: byFp } = await supabaseAdmin
        .from("seen_articles")
        .select("id")
        .eq("title_fp", titleFp)
        .gte("seen_at", thirtyDaysAgo)
        .maybeSingle();
      if (byFp) return true;
    }
    return false;
  } catch {
    // Fall back to KV /seen/check endpoint if Supabase unavailable
    try {
      const workerUrl = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
      const workerSecret = process.env.WORKER_SECRET || "ppptvWorker2024";
      const res = await fetch(`${workerUrl}/seen/check?id=${encodeURIComponent(id)}`, {
        headers: { "Authorization": "Bearer " + workerSecret },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const d = await res.json() as { seen: boolean };
        return d.seen === true;
      }
    } catch { /* non-fatal */ }
    return false;
  }
}

export async function markArticleSeen(id: string, title?: string): Promise<void> {
  const titleFp = title
    ? title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60)
    : undefined;
  try {
    await supabaseAdmin
      .from("seen_articles")
      .upsert(
        { id, title, title_fp: titleFp, seen_at: new Date().toISOString() },
        { onConflict: "id" }
      );
  } catch (err) {
    console.warn("[dedup] markSeen failed:", err);
    // Fall back to KV /seen endpoint
    try {
      const workerUrl = process.env.CLOUDFLARE_WORKER_URL || "https://auto-ppp-tv.euginemicah.workers.dev";
      const workerSecret = process.env.WORKER_SECRET || "ppptvWorker2024";
      await fetch(`${workerUrl}/seen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + workerSecret },
        body: JSON.stringify({ id, titleFp }),
        signal: AbortSignal.timeout(5000),
      });
    } catch { /* non-fatal */ }
  }
}

// ── Agent state ───────────────────────────────────────────────────────────────
export async function getAgentState(key: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("agent_state")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    return data?.value ?? null;
  } catch { return null; }
}

export async function setAgentState(key: string, value: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("agent_state")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  } catch { /* non-fatal */ }
}

// ── Blacklist ─────────────────────────────────────────────────────────────────
export interface BlacklistEntry { type: string; value: string; }

export async function getBlacklist(): Promise<BlacklistEntry[]> {
  try {
    const { data } = await supabaseAdmin.from("blacklist").select("type, value");
    return data || [];
  } catch { return []; }
}

export async function addToBlacklist(type: string, value: string): Promise<void> {
  try {
    await supabaseAdmin.from("blacklist").upsert({ type, value }, { onConflict: "type,value" });
  } catch { /* non-fatal */ }
}

export async function removeFromBlacklist(type: string, value: string): Promise<void> {
  try {
    await supabaseAdmin.from("blacklist").delete().eq("type", type).eq("value", value);
  } catch { /* non-fatal */ }
}

// ── Analytics helpers ─────────────────────────────────────────────────────────
export async function getPostsByDay(days = 30): Promise<{ date: string; count: number; ig: number; fb: number }[]> {
  try {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data } = await supabaseAdmin
      .from("posts")
      .select("posted_at, ig_success, fb_success")
      .gte("posted_at", since)
      .eq("blocked", false)
      .order("posted_at", { ascending: true });
    if (!data) return [];

    const byDay: Record<string, { count: number; ig: number; fb: number }> = {};
    for (const p of data) {
      const day = p.posted_at.slice(0, 10);
      if (!byDay[day]) byDay[day] = { count: 0, ig: 0, fb: 0 };
      byDay[day].count++;
      if (p.ig_success) byDay[day].ig++;
      if (p.fb_success) byDay[day].fb++;
    }
    return Object.entries(byDay).map(([date, v]) => ({ date, ...v }));
  } catch { return []; }
}

export async function getCategoryBreakdown(days = 7): Promise<{ category: string; count: number }[]> {
  try {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data } = await supabaseAdmin
      .from("posts")
      .select("category")
      .gte("posted_at", since)
      .eq("blocked", false);
    if (!data) return [];

    const counts: Record<string, number> = {};
    for (const p of data) {
      const cat = p.category || "GENERAL";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  } catch { return []; }
}

// ── Entertainment Reach Engine ────────────────────────────────────────────────

export type EntertainmentCategory =
  | "COMEDY"
  | "MUSIC"
  | "DANCE"
  | "FASHION"
  | "SPORTS_BANTER"
  | "POP_CULTURE"
  | "STREET_CONTENT"
  | "CELEBRITY"
  | "MEMES"
  | "VIRAL_TRENDS"
  | "TV_FILM"
  | "INFLUENCERS"
  | "EAST_AFRICA";

export interface SeriesFormat {
  id: string;
  name: string;
  emoji: string;
  description: string;
  cadence: "daily" | "weekly" | "biweekly";
  day_of_week?: number | null;
  time_eat: number;
  content_type: "video" | "carousel" | "image";
  category: EntertainmentCategory;
  tone: "funny" | "informative" | "hype" | "debate" | "inspirational";
  platforms: string[];
  hashtag_set: string[];
  template_prompt: string;
  cover_style: "bold" | "minimal" | "meme" | "countdown";
  source_keywords: string[];
  active: boolean;
  created_at: string;
  last_posted_at?: string | null;
  total_posts: number;
}

export interface MixBudgetRow {
  date: string;
  viral_clip_count: number;
  series_count: number;
  feature_video_count: number;
  daily_target: number;
  last_updated: string;
}

export interface SeriesPostLogEntry {
  id?: string;
  format_id: string;
  series_name: string;
  week_number: number;
  platforms: string[];
  caption: string;
  result?: Record<string, unknown> | null;
  created_at?: string;
}

// ── series_formats CRUD ───────────────────────────────────────────────────────

export async function getSeriesFormats(): Promise<SeriesFormat[]> {
  try {
    const { data } = await supabaseAdmin
      .from("series_formats")
      .select("*")
      .order("name", { ascending: true });
    return (data as SeriesFormat[]) || [];
  } catch { return []; }
}

export async function getSeriesFormatById(id: string): Promise<SeriesFormat | null> {
  try {
    const { data } = await supabaseAdmin
      .from("series_formats")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return (data as SeriesFormat) ?? null;
  } catch { return null; }
}

export async function upsertSeriesFormat(format: Partial<SeriesFormat>): Promise<void> {
  try {
    await supabaseAdmin
      .from("series_formats")
      .upsert(format, { onConflict: "id" });
  } catch (err) {
    console.warn("[supabase] upsertSeriesFormat failed:", err);
  }
}

export async function updateSeriesFormatStatus(id: string, active: boolean): Promise<void> {
  try {
    await supabaseAdmin
      .from("series_formats")
      .update({ active })
      .eq("id", id);
  } catch (err) {
    console.warn("[supabase] updateSeriesFormatStatus failed:", err);
  }
}

// ── mix_budget CRUD ───────────────────────────────────────────────────────────

export async function getMixBudgetRow(date: string): Promise<MixBudgetRow | null> {
  try {
    const { data } = await supabaseAdmin
      .from("mix_budget")
      .select("*")
      .eq("date", date)
      .maybeSingle();
    return (data as MixBudgetRow) ?? null;
  } catch { return null; }
}

export async function upsertMixBudget(row: Partial<MixBudgetRow>): Promise<void> {
  try {
    await supabaseAdmin
      .from("mix_budget")
      .upsert({ ...row, last_updated: new Date().toISOString() }, { onConflict: "date" });
  } catch (err) {
    console.warn("[supabase] upsertMixBudget failed:", err);
  }
}

// ── series_post_log CRUD ──────────────────────────────────────────────────────

export async function logSeriesPost(entry: SeriesPostLogEntry): Promise<void> {
  try {
    await supabaseAdmin.from("series_post_log").insert({
      format_id: entry.format_id,
      series_name: entry.series_name,
      week_number: entry.week_number,
      platforms: entry.platforms,
      caption: entry.caption,
      result: entry.result ?? null,
    });
  } catch (err) {
    console.warn("[supabase] logSeriesPost failed:", err);
  }
}

export async function getSeriesPostLog(
  formatId: string,
  limit = 20,
): Promise<SeriesPostLogEntry[]> {
  try {
    const { data } = await supabaseAdmin
      .from("series_post_log")
      .select("*")
      .eq("format_id", formatId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data as SeriesPostLogEntry[]) || [];
  } catch { return []; }
}
