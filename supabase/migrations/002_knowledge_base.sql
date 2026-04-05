-- ============================================================
-- Migration: 002_knowledge_base
-- PPP TV AI Knowledge Base — editable sections for AI prompts
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_base (
  id          TEXT PRIMARY KEY,           -- e.g. "brand_voice", "headline_guide"
  title       TEXT NOT NULL DEFAULT '',   -- human-readable section title
  content     TEXT NOT NULL DEFAULT '',   -- the actual KB content (free text)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_knowledge_base_updated
  ON knowledge_base (updated_at DESC);

-- Comment
COMMENT ON TABLE knowledge_base IS 'Editable AI prompt sections for PPP TV Kenya — headline guide, caption guide, brand voice, Kenya knowledge, Gen Z guide, video topics, hashtag strategy';
