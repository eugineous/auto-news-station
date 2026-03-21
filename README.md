# PPP TV Auto Poster

Automated news-to-social pipeline for PPP TV Kenya. Scrapes the PPP TV RSS feed, generates branded 1080×1080 images, and posts to Instagram and Facebook — fully automated via a Cloudflare Worker cron.

---

## How it works

1. **Cloudflare Worker** fires every 30 minutes
2. Calls the Vercel `/api/automate` endpoint (authenticated with `AUTOMATE_SECRET`)
3. Vercel scrapes `ppptv-v2.vercel.app/api/rss` for new articles
4. Deduplication via **Cloudflare KV** — already-posted articles are skipped
5. For each new article: generates a branded image + formats captions
6. Posts to **Instagram** and **Facebook** via Graph API

---

## Stack

| Layer            | Tech                                  |
| ---------------- | ------------------------------------- |
| App / API        | Next.js 14 on Vercel                  |
| Cron trigger     | Cloudflare Worker                     |
| Deduplication    | Cloudflare KV (`SEEN_ARTICLES`)       |
| Image generation | Satori + Sharp (1080×1080 JPEG)       |
| Social posting   | Meta Graph API (Instagram + Facebook) |

---

## Image template

- 1080×1080 JPEG
- Full-bleed article thumbnail as background
- Gradient fade to solid black at the bottom
- White category pill (e.g. `CELEBRITY`, `TV & FILM`)
- Two-tone headline — orange for names/nouns, white for connectors
- Italic subtitle from article description
- PPP TV Kenya logo top-left

---

## Project structure

```
src/
  app/
    page.tsx                  # Dashboard UI
    api/
      automate/route.ts       # Main POST endpoint (called by CF Worker)
      dry-run/route.ts        # Test scraper + image gen without posting
      preview-image/route.ts  # Preview image template in browser
  lib/
    scraper.ts                # RSS parser (no external deps)
    image-gen.ts              # Satori + Sharp image generator
    formatter.ts              # Caption formatter with hashtags
    publisher.ts              # Instagram + Facebook Graph API
    dedup.ts                  # Cloudflare KV deduplication
    types.ts                  # Shared TypeScript interfaces
cloudflare/
  worker.js                   # Cloudflare Worker with cron
  wrangler.toml               # Worker config + KV binding
```

---

## Environment variables

Set these in Vercel project settings:

| Variable                 | Description                                |
| ------------------------ | ------------------------------------------ |
| `AUTOMATE_SECRET`        | Shared secret between CF Worker and Vercel |
| `INSTAGRAM_ACCESS_TOKEN` | Meta long-lived user access token          |
| `INSTAGRAM_ACCOUNT_ID`   | Instagram Business Account ID              |
| `FACEBOOK_ACCESS_TOKEN`  | Meta page access token                     |
| `FACEBOOK_PAGE_ID`       | Facebook Page ID                           |

---

## Cloudflare Worker secrets

Set via `wrangler secret put`:

| Secret            | Value                                  |
| ----------------- | -------------------------------------- |
| `VERCEL_APP_URL`  | `https://auto-news-station.vercel.app` |
| `AUTOMATE_SECRET` | Same value as Vercel env var           |

---

## Testing without social tokens

**Preview image template:**

```
GET /api/preview-image
GET /api/preview-image?title=YOUR+HEADLINE&category=CELEBRITY
```

**Dry run (scrape + image gen, no posting):**

```
GET /api/dry-run
```

Both endpoints are safe to call without any social API tokens configured.

---

## Dashboard

Live at `https://auto-news-station.vercel.app` — shows live article previews with generated images, caption lengths, and setup checklist.
