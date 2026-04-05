import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { KB_DEFAULTS } from "@/lib/gemini";

// Ensure the knowledge_base table exists (idempotent)
async function ensureTable() {
  try {
    await supabaseAdmin.rpc("exec_sql", {
      sql: `CREATE TABLE IF NOT EXISTS knowledge_base (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`,
    });
  } catch {
    // rpc might not exist — table was likely created via migration, ignore
  }
}

const SECTION_TITLES: Record<string, string> = {
  brand_voice:       "Brand Voice & Identity",
  headline_guide:    "Headline Writing Guide",
  caption_guide:     "Caption Writing Guide",
  kenya_knowledge:   "Kenya Knowledge Base",
  gen_z_guide:       "Gen Z Audience Guide",
  video_topics:      "Video Scraping Topics",
  hashtag_strategy:  "Hashtag Strategy",
};

export async function GET(req: NextRequest) {
  const wantsDefaults = req.nextUrl.searchParams.get("defaults") === "1";

  // Return raw hardcoded defaults (no DB merge) for the reset-to-default feature
  if (wantsDefaults) {
    const defaults = Object.entries(KB_DEFAULTS).map(([id, content]) => ({
      id, title: SECTION_TITLES[id] || id, content,
    }));
    return NextResponse.json({ defaults });
  }

  try {
    await ensureTable();
    const { data, error } = await supabaseAdmin
      .from("knowledge_base")
      .select("id, title, content, updated_at")
      .order("id");

    if (error) throw error;

    const merged: Record<string, { id: string; title: string; content: string; updated_at?: string }> = {};

    // Start with defaults
    for (const [id, content] of Object.entries(KB_DEFAULTS)) {
      merged[id] = { id, title: SECTION_TITLES[id] || id, content };
    }

    // Override with DB values
    for (const row of (data || [])) {
      if (merged[row.id]) {
        merged[row.id] = { ...merged[row.id], ...row };
      } else {
        merged[row.id] = { id: row.id, title: row.title || SECTION_TITLES[row.id] || row.id, content: row.content, updated_at: row.updated_at };
      }
    }

    return NextResponse.json({ sections: Object.values(merged) });
  } catch (err: any) {
    console.error("[knowledge-base GET]", err);
    const sections = Object.entries(KB_DEFAULTS).map(([id, content]) => ({
      id, title: SECTION_TITLES[id] || id, content, updated_at: null,
    }));
    return NextResponse.json({ sections, fallback: true });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { id, title, content } = await req.json();
    if (!id || typeof content !== "string") {
      return NextResponse.json({ error: "id and content required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("knowledge_base")
      .upsert({ id, title: title || id, content, updated_at: new Date().toISOString() }, { onConflict: "id" });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[knowledge-base POST]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await supabaseAdmin.from("knowledge_base").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
