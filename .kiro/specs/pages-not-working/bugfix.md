# Bugfix Requirements Document

## Introduction

All pages in the PPP TV Next.js social media management app are broken or degraded. Issues span navigation (the `/clipper` page must be deleted and removed from nav), broken data flows (pages fetching from wrong/dead endpoints), missing auth protection, inconsistent user flows, and the `/status` page calling a non-existent API route. This fix addresses every page systematically, removes the clipper feature entirely, and improves user flow across the app.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user visits `/clipper` THEN the system renders a page that should not exist and is accessible from the sidebar nav

1.2 WHEN the sidebar renders THEN the system displays a "Clipper ✂️" nav item that links to the deleted page

1.3 WHEN the `/status` page loads THEN the system calls `/api/admin/health` which does not exist as a route in the codebase, causing the health check to always fail silently

1.4 WHEN the `/analytics` page fetches post data THEN the system uses a `LogEntry` interface with camelCase fields (`instagram.success`, `facebook.success`, `postedAt`, `articleId`) but the Supabase `getPostLog` returns snake_case fields (`ig_success`, `fb_success`, `posted_at`, `article_id`), causing all stats to show zero

1.5 WHEN the `/content` page fetches post data THEN the system uses the same mismatched camelCase `LogEntry` interface, causing the content library to render empty or broken entries

1.6 WHEN the `/queue` page fetches articles THEN the system calls `https://ppp-tv-worker.euginemicah.workers.dev/feed` which is a different worker URL from the one used everywhere else (`https://auto-ppp-tv.euginemicah.workers.dev`), causing the feed to fail to load

1.7 WHEN the `/composer` page's Cockpit tab fetches post logs THEN the system calls the Cloudflare Worker's `/post-log` endpoint directly instead of the app's own `/api/post-log`, bypassing auth and using a potentially stale data source

1.8 WHEN the `/dashboard` page calls `triggerNow` THEN the system calls the Cloudflare Worker's `/trigger` endpoint directly without the required `Authorization` header, causing the trigger to be rejected

1.9 WHEN the `/intelligence` page loads THEN the system fetches `/api/post-log` without `credentials: "include"` on some code paths, which may cause auth failures in production

1.10 WHEN the `/status` page is accessed THEN the system renders without the `Shell` navigation wrapper, making it visually disconnected from the rest of the app with no way to navigate back

1.11 WHEN the `/about`, `/privacy`, `/terms`, and `/contact` pages are accessed THEN the system renders them without the `Shell` navigation wrapper, leaving users stranded with only a plain back link

1.12 WHEN the middleware runs THEN the system does not protect `/clipper` in the `PROTECTED` routes list, meaning the clipper page is accessible without authentication

1.13 WHEN the `/composer` page's Cockpit tab auto-posts THEN the system calls `/api/automate-video` but the user flow provides no feedback on whether the auto-post succeeded or what was posted

1.14 WHEN the `/factory` page bulk-posts items THEN the system calls `/api/post-video` for each item but the factory page has no way to retry individual failed items

1.15 WHEN the `/competitors` page loads THEN the system fetches YouTube RSS feeds directly from the browser, which will be blocked by CORS on most browsers since YouTube does not set permissive CORS headers

### Expected Behavior (Correct)

2.1 WHEN a user visits `/clipper` THEN the system SHALL return a 404 (the page file shall be deleted)

2.2 WHEN the sidebar renders THEN the system SHALL NOT display the "Clipper" nav item in either desktop or mobile navigation

2.3 WHEN the `/status` page loads THEN the system SHALL call a valid health-check endpoint (either a new `/api/health` route or the existing `/api/post-log`) to determine system status

2.4 WHEN the `/analytics` page fetches post data THEN the system SHALL map Supabase snake_case fields to the expected shape so all KPI stats display correct non-zero values

2.5 WHEN the `/content` page fetches post data THEN the system SHALL correctly map `ig_success`/`fb_success`/`posted_at`/`article_id` fields so the content library renders all posts correctly

2.6 WHEN the `/queue` page fetches articles THEN the system SHALL call the correct worker URL (`https://auto-ppp-tv.euginemicah.workers.dev/feed`) so the news feed loads successfully

2.7 WHEN the `/composer` Cockpit tab fetches post logs THEN the system SHALL call `/api/post-log` (the app's own authenticated route) instead of the worker directly

2.8 WHEN the `/dashboard` page calls `triggerNow` THEN the system SHALL include the `Authorization: Bearer ppptvWorker2024` header so the trigger is accepted by the worker

2.9 WHEN the `/intelligence` page fetches post data THEN the system SHALL include `credentials: "include"` on all fetch calls to ensure auth cookies are sent

2.10 WHEN the `/status` page is accessed THEN the system SHALL render inside the `Shell` wrapper so users can navigate to other pages

2.11 WHEN the `/about`, `/privacy`, `/terms`, and `/contact` pages are accessed THEN the system SHALL render with a consistent navigation header or back-to-dashboard link that matches the app's design system

2.12 WHEN the middleware runs THEN the system SHALL NOT include `/clipper` in the protected routes list (since the page is deleted)

2.13 WHEN the `/composer` Cockpit tab auto-posts THEN the system SHALL display a visible success/failure toast with the title of the article that was posted

2.14 WHEN the `/factory` page has a failed item THEN the system SHALL show a per-item retry button so individual failures can be re-attempted without re-running the whole batch

2.15 WHEN the `/competitors` page fetches YouTube feeds THEN the system SHALL proxy the request through a Next.js API route (`/api/competitors/feed`) to avoid browser CORS restrictions

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user logs in with the correct password THEN the system SHALL CONTINUE TO set the session cookie and redirect to `/dashboard`

3.2 WHEN a user visits a protected route without a session cookie THEN the system SHALL CONTINUE TO redirect to `/login`

3.3 WHEN the `/composer` page posts a video THEN the system SHALL CONTINUE TO stream SSE progress events and show the progress panel

3.4 WHEN the `/dashboard` page loads THEN the system SHALL CONTINUE TO display KPI stats, the live ticker, system alerts, and the last published post

3.5 WHEN the `/trends` page loads THEN the system SHALL CONTINUE TO fetch from `/api/trends/youtube`, `/api/trends/reddit`, and `/api/trends/news` and display results

3.6 WHEN the `/calendar` page loads THEN the system SHALL CONTINUE TO fetch from `/api/post-log` and render the monthly calendar grid with post dots

3.7 WHEN the `/queue` page posts an article THEN the system SHALL CONTINUE TO call `/api/post-from-url` and show per-item success/error state

3.8 WHEN the `/settings` page loads THEN the system SHALL CONTINUE TO display the static configuration overview without any data fetching

3.9 WHEN the `/accounts` page loads THEN the system SHALL CONTINUE TO display the platform connection status list

3.10 WHEN the auto-poster pipeline runs THEN the system SHALL CONTINUE TO scrape articles, generate AI content, post to IG and FB, and log results to Supabase

3.11 WHEN the sidebar is collapsed on desktop THEN the system SHALL CONTINUE TO show only icons and expand on click

3.12 WHEN the app is viewed on mobile THEN the system SHALL CONTINUE TO show the top bar and bottom navigation instead of the sidebar


---

## User Flow Improvements

### Current UX Defects

**UF-1** WHEN the `/analytics` page loads THEN the system shows raw counts only with no date range filter, making it impossible to see performance for a specific period

**UF-2** WHEN the `/content` page renders entries THEN the system shows them oldest-first (reversed) and provides no way to filter by platform success/failure, making it hard to find recent posts

**UF-3** WHEN the `/queue` page loads THEN the system shows no count of how many items are already posted vs pending, and there is no "Post All" bulk action for posting multiple articles at once

**UF-4** WHEN the `/composer` Cockpit tab shows a failed post THEN the system provides no per-item retry button in the cockpit feed, only the global "Run Now" button

**UF-5** WHEN the `/factory` page finishes generating items THEN the system shows no summary of how many are ready vs failed, and the "Post All" button is only visible after items are generated (not obvious)

**UF-6** WHEN the `/competitors` page loads THEN the system loads all competitors simultaneously on mount, causing a flood of requests; there is no "Refresh All" button and no last-checked timestamp visible in the detail panel

**UF-7** WHEN the `/calendar` page is viewed on a day with no posts THEN the system shows "No posts on this day" but the "Create Post" link goes to `/composer` without pre-filling any date context

**UF-8** WHEN the `/trends` page has a trend with no URL THEN the "Post This" button navigates to `/composer?url=` with an empty URL, causing the composer to show a blank fetch state

**UF-9** WHEN the `/dashboard` page shows the "Post Now" button THEN the system provides no confirmation dialog before triggering the pipeline, making it easy to accidentally trigger

**UF-10** WHEN the `/status` page is loaded THEN the system shows all service dots as "—" (unknown) because the health endpoint doesn't exist — after the endpoint fix, the Supabase status should be derived from the post-log response latency

**UF-11** WHEN the `/login` page is accessed with a `?from=` query param THEN the system redirects to `/dashboard` after login instead of the originally requested page, breaking deep-link flows

**UF-12** WHEN the `/settings` page is viewed THEN the system shows only static config with no way to test the worker connection or verify API keys are working

**UF-13** WHEN the `/accounts` page is viewed THEN the system shows "Connected" for IG and FB with no way to verify the token is still valid or see when it expires

### Expected UX Behavior

**UF-1 Fix** WHEN the `/analytics` page loads THEN the system SHALL show a date range selector (7d / 30d / 90d / All) that filters all KPIs and charts

**UF-2 Fix** WHEN the `/content` page renders THEN the system SHALL show entries newest-first by default and add a platform filter (All / IG ✓ / FB ✓ / Failed)

**UF-3 Fix** WHEN the `/queue` page loads THEN the system SHALL show a "Post All Visible" button that posts all filtered items sequentially with a progress counter

**UF-4 Fix** WHEN the `/composer` Cockpit tab shows a post with a failure THEN the system SHALL show a per-item retry button for posts where `ig_success` or `fb_success` is false

**UF-5 Fix** WHEN the `/factory` page finishes generating THEN the system SHALL show a summary bar (X ready · Y failed · Z done) above the item list at all times

**UF-6 Fix** WHEN the `/competitors` page loads THEN the system SHALL load competitors lazily (only the selected one on mount) and show a "Refresh All" button in the header

**UF-7 Fix** WHEN the `/calendar` day panel shows no posts THEN the "Create Post" link SHALL remain as-is (no date pre-fill needed — composer doesn't support scheduled posts)

**UF-8 Fix** WHEN the `/trends` page has a trend with no URL THEN the "Post This" button SHALL be disabled (greyed out) with a tooltip "No URL available"

**UF-9 Fix** WHEN the `/dashboard` "Post Now" button is clicked THEN the system SHALL show an inline confirmation state (button changes to "Confirm?" for 3 seconds) before triggering

**UF-10 Fix** WHEN the `/status` page derives health from `/api/post-log` THEN the system SHALL show Supabase latency in ms and mark it "Operational" if the fetch succeeded

**UF-11 Fix** WHEN the `/login` page submits successfully THEN the system SHALL redirect to the `?from=` path if present, otherwise to `/dashboard`

**UF-12 Fix** WHEN the `/settings` page is viewed THEN the system SHALL add a "Test Worker Connection" button that pings the worker and shows latency

**UF-13 Fix** WHEN the `/accounts` page is viewed THEN the system SHALL add a "Verify Token" button for IG and FB that calls a lightweight check endpoint and shows token status
