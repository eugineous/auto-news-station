-- ============================================================
-- Migration: 001_entertainment_reach_engine
-- Entertainment Reach Engine — Series Formats, Mix Budget, Post Log
-- ============================================================

-- ── series_formats ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS series_formats (
  id               TEXT PRIMARY KEY,                          -- kebab-case, e.g. "street-question-friday"
  name             TEXT NOT NULL,
  emoji            TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  cadence          TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly', 'biweekly')),
  day_of_week      INTEGER CHECK (day_of_week BETWEEN 0 AND 6), -- nullable; required for weekly
  time_eat         INTEGER NOT NULL CHECK (time_eat BETWEEN 0 AND 23),
  content_type     TEXT NOT NULL CHECK (content_type IN ('video', 'carousel', 'image')),
  category         TEXT NOT NULL,
  tone             TEXT NOT NULL CHECK (tone IN ('funny', 'informative', 'hype', 'debate', 'inspirational')),
  platforms        TEXT[] NOT NULL DEFAULT '{}',
  hashtag_set      TEXT[] NOT NULL DEFAULT '{}',
  template_prompt  TEXT NOT NULL DEFAULT '',
  cover_style      TEXT NOT NULL CHECK (cover_style IN ('bold', 'minimal', 'meme', 'countdown')),
  source_keywords  TEXT[] NOT NULL DEFAULT '{}',
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_posted_at   TIMESTAMPTZ,
  total_posts      INTEGER NOT NULL DEFAULT 0
);

-- ── mix_budget ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mix_budget (
  date                 TEXT PRIMARY KEY,                      -- YYYY-MM-DD
  viral_clip_count     INTEGER NOT NULL DEFAULT 0,
  series_count         INTEGER NOT NULL DEFAULT 0,
  feature_video_count  INTEGER NOT NULL DEFAULT 0,
  daily_target         INTEGER NOT NULL DEFAULT 10,
  last_updated         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── series_post_log ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS series_post_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  format_id    TEXT NOT NULL REFERENCES series_formats(id) ON DELETE CASCADE,
  series_name  TEXT NOT NULL DEFAULT '',
  week_number  INTEGER NOT NULL DEFAULT 0,
  platforms    TEXT[] NOT NULL DEFAULT '{}',
  caption      TEXT NOT NULL DEFAULT '',
  result       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_series_formats_active_cadence
  ON series_formats (active, cadence);

CREATE INDEX IF NOT EXISTS idx_mix_budget_date
  ON mix_budget (date);

CREATE INDEX IF NOT EXISTS idx_series_post_log_format_id_created_at
  ON series_post_log (format_id, created_at DESC);

-- ── Seed: 10 default series formats ──────────────────────────────────────────
INSERT INTO series_formats (
  id, name, emoji, description, cadence, day_of_week, time_eat,
  content_type, category, tone, platforms, hashtag_set,
  template_prompt, cover_style, source_keywords, active
) VALUES
(
  'street-question-friday',
  'Street Question Friday',
  '🎤',
  'Weekly street interview series asking Kenyans relatable debate questions.',
  'weekly', 5, 18,
  'carousel', 'STREET_CONTENT', 'funny',
  ARRAY['instagram','facebook'],
  ARRAY['#StreetTalk','#NairobiStreets','#PPPTVKenya','#KenyaVibes','#WhatDoYouThink'],
  'Create an engaging street interview caption for PPP TV Kenya. Tone: funny. Ask a relatable question Kenyans debate.',
  'bold',
  ARRAY['street interview kenya','nairobi street','kenya opinions'],
  TRUE
),
(
  'best-dressed-week',
  'Best Dressed of the Week',
  '👗',
  'Weekly fashion series celebrating the best-dressed Kenyans.',
  'weekly', 0, 12,
  'carousel', 'FASHION', 'hype',
  ARRAY['instagram','facebook','tiktok'],
  ARRAY['#BestDressed','#KenyaFashion','#PPPTVKenya','#StyleKenya','#Drip'],
  'Write a hype fashion caption for PPP TV Kenya Best Dressed series. Celebrate the style.',
  'minimal',
  ARRAY['kenya fashion','nairobi style','best dressed kenya'],
  TRUE
),
(
  'top5-kenya-trends',
  'Top 5 Kenyan Trends',
  '🔥',
  'Weekly countdown of the top 5 trending topics in Kenya.',
  'weekly', 1, 8,
  'carousel', 'VIRAL_TRENDS', 'informative',
  ARRAY['instagram','facebook','tiktok','youtube'],
  ARRAY['#KenyaTrends','#Trending','#PPPTVKenya','#Kenya','#Viral'],
  'Write a punchy Top 5 trends caption for PPP TV Kenya. List format, informative tone.',
  'countdown',
  ARRAY['trending kenya','viral kenya','kenya twitter trends'],
  TRUE
),
(
  'comedy-skit-wednesday',
  'Comedy Skit Wednesday',
  '😂',
  'Weekly comedy skit series featuring relatable Kenyan humor.',
  'weekly', 3, 19,
  'video', 'COMEDY', 'funny',
  ARRAY['instagram','facebook','tiktok'],
  ARRAY['#KenyaComedy','#Funny','#PPPTVKenya','#NairobiHumor','#LOL'],
  'Write a funny comedy caption for PPP TV Kenya. Relatable Kenyan humor, make them tag a friend.',
  'meme',
  ARRAY['kenya comedy','nairobi funny','kenyan skit'],
  TRUE
),
(
  'music-drop-alert',
  'New Music Drop Alert',
  '🎵',
  'Daily alert for new music releases in Kenya and East Africa.',
  'daily', NULL, 10,
  'image', 'MUSIC', 'hype',
  ARRAY['instagram','facebook','tiktok','youtube'],
  ARRAY['#NewMusic','#KenyaMusic','#PPPTVKenya','#MusicAlert','#Banger'],
  'Write a hype new music alert caption for PPP TV Kenya. Get people excited about the drop.',
  'bold',
  ARRAY['new kenya music','afrobeats new','gengetone new release'],
  TRUE
),
(
  'sports-banter-monday',
  'Sports Banter Monday',
  '⚽',
  'Weekly sports debate series stirring football conversation in Kenya.',
  'weekly', 1, 20,
  'carousel', 'SPORTS_BANTER', 'debate',
  ARRAY['instagram','facebook'],
  ARRAY['#SportsBanter','#Football','#PPPTVKenya','#KenyaSports','#PremierLeague'],
  'Write a debate-starting sports banter caption for PPP TV Kenya. Stir the football conversation.',
  'bold',
  ARRAY['football kenya','premier league','sports banter africa'],
  TRUE
),
(
  'celeb-tea-thursday',
  'Celeb Tea Thursday',
  '☕',
  'Weekly celebrity news and gossip series for Kenyan entertainment.',
  'weekly', 4, 17,
  'image', 'CELEBRITY', 'informative',
  ARRAY['instagram','facebook'],
  ARRAY['#CelebTea','#KenyaCelebs','#PPPTVKenya','#Entertainment','#Tea'],
  'Write an engaging celebrity news caption for PPP TV Kenya. Informative but entertaining.',
  'minimal',
  ARRAY['kenya celebrity news','nairobi celebs','kenya entertainment news'],
  TRUE
),
(
  'meme-of-the-day',
  'Meme of the Day',
  '💀',
  'Daily meme series with relatable Kenyan humor.',
  'daily', NULL, 13,
  'image', 'MEMES', 'funny',
  ARRAY['instagram','facebook','tiktok'],
  ARRAY['#MemeOfTheDay','#KenyaMemes','#PPPTVKenya','#Funny','#Relatable'],
  'Write a funny meme caption for PPP TV Kenya. Short, punchy, relatable to Kenyans.',
  'meme',
  ARRAY['kenya memes','nairobi memes','funny kenya'],
  TRUE
),
(
  'east-africa-spotlight',
  'East Africa Spotlight',
  '🌍',
  'Weekly spotlight on entertainment and culture across East Africa.',
  'weekly', 6, 11,
  'carousel', 'EAST_AFRICA', 'informative',
  ARRAY['instagram','facebook','youtube'],
  ARRAY['#EastAfrica','#Africa','#PPPTVKenya','#EastAfricaVibes','#Spotlight'],
  'Write an informative East Africa spotlight caption for PPP TV Kenya. Celebrate the region.',
  'minimal',
  ARRAY['east africa entertainment','uganda tanzania entertainment','africa viral'],
  TRUE
),
(
  'throwback-tuesday',
  'Throwback Tuesday',
  '📼',
  'Weekly nostalgia series celebrating classic Kenyan entertainment moments.',
  'weekly', 2, 15,
  'image', 'POP_CULTURE', 'inspirational',
  ARRAY['instagram','facebook'],
  ARRAY['#ThrowbackTuesday','#TBT','#PPPTVKenya','#Nostalgia','#Kenya'],
  'Write a nostalgic throwback caption for PPP TV Kenya. Warm, inspirational tone about a classic moment.',
  'minimal',
  ARRAY['kenya throwback','classic kenya entertainment','nostalgia kenya'],
  TRUE
)
ON CONFLICT (id) DO NOTHING;
