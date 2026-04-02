/**
 * Supabase client — replaces Cloudflare KV for post logs, dedup, agent state, blacklist
 * Project: xptxfqxononfdjndjalx (eu-central-1)
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://xptxfqxononfdjndjalx.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwdHhmcXhvbm9uZmRqbmRqYWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNTUyMjgsImV4cCI6MjA5MDYzMTIyOH0.IJXZ00sJMaHe8iNOfd7TnG3Fsvcu_8WrfG7vNHppq-I";

// Server-side client (full access via service role)
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
    await supabaseAdmin.from("posts").insert(record);
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
      .limit(limit);
    return data || [];
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
export async function isArticleSeen(id: string): Promise<boolean> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data } = await supabaseAdmin
      .from("seen_articles")
      .select("id")
      .eq("id", id)
      .gte("seen_at", thirtyDaysAgo)
      .maybeSingle();
    return !!data;
  } catch { return false; }
}

export async function markArticleSeen(id: string, title?: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("seen_articles")
      .upsert({ id, title, seen_at: new Date().toISOString() }, { onConflict: "id" });
  } catch { /* non-fatal */ }
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
