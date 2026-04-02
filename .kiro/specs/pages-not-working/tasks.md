# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - All 15 Defects Produce Incorrect Output
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface counterexamples that demonstrate each defect manifests as described
  - **Scoped PBT Approach**: For deterministic defects, scope each property to the concrete failing case to ensure reproducibility
  - Test Group A — wrong/dead endpoints:
    - Render `StatusPage`, assert it calls `/api/admin/health` (will 404 → data stays null → all dots show "—")
    - Render `QueuePage`, assert fetch is called with `ppp-tv-worker.euginemicah.workers.dev` (wrong URL)
    - Render `CockpitTab`, assert `load()` calls `WORKER + "/post-log"` directly (bypasses auth)
    - Call `triggerNow` in `DashboardPage`, assert `Authorization` header is absent (worker rejects with 401)
  - Test Group B — field name mismatch:
    - Feed `{ log: [{ ig_success: true, fb_success: false, posted_at: "...", article_id: "x" }] }` to `AnalyticsPage`
    - Assert `igOk` stat shows 0 (will be 0 on unfixed code because it reads `instagram.success`)
    - Feed same mock to `ContentPage`, assert entries render broken/empty
  - Test Group C — missing Shell wrapper:
    - Render `StatusPage`, assert no `<Shell>` wrapper is present in output
    - Render `AboutPage`, `PrivacyPage`, `TermsPage`, `ContactPage`, assert no nav header present
  - Test Group D — deleted feature still present:
    - Render `Shell`, assert nav item with href `/clipper` IS present (will be on unfixed code)
    - Assert `src/app/clipper/page.tsx` file exists (will exist on unfixed code)
  - Test Group E — UX/CORS gaps:
    - Render `CompetitorsPage`, assert `fetchYouTubeFeed` calls `youtube.com` directly (CORS blocked)
    - Render `FactoryPage` with a failed item, assert no retry button is present
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the bugs exist)
  - Document counterexamples found (e.g., "AnalyticsPage igOk=0 despite ig_success=true in data")
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Unaffected Pages and Flows Remain Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (pages/actions not in isBugCondition):
    - Observe: login flow sets session cookie and redirects to `/dashboard`
    - Observe: middleware redirects unauthenticated users to `/login` for protected routes
    - Observe: `/composer` Compose tab SSE streaming and progress panel work
    - Observe: `/dashboard` KPI stats, ticker, alerts, and last-published-post panel render
    - Observe: `/trends`, `/calendar`, `/settings`, `/accounts` load without errors
    - Observe: sidebar collapse/expand and mobile bottom nav work
  - Write property-based tests capturing these observed behaviors:
    - For any valid session cookie, protected routes render without redirect
    - For any missing session cookie, protected routes redirect to `/login`
    - For any array of `PostRecord` objects, `CalendarPage` renders a dot for each record's `posted_at` date
    - For any `Shell` render, sidebar collapse state toggles correctly
  - Verify all tests PASS on UNFIXED code (confirms baseline to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12_

- [x] 3. Fix Group D — Delete clipper feature entirely

  - [x] 3.1 Delete `src/app/clipper/page.tsx`
    - Delete the file entirely — the feature is removed
    - _Bug_Condition: context.page = "/clipper" AND context.action = "render"_
    - _Expected_Behavior: visiting /clipper returns 404 (no page file = Next.js 404)_
    - _Preservation: all other nav items and pages unaffected_
    - _Requirements: 2.1, 2.12_

  - [x] 3.2 Remove clipper nav entry from `src/app/shell.tsx`
    - Remove `{ href: "/clipper", icon: "✂️", label: "Clipper" }` from the `NAV` array
    - Applies to both desktop sidebar and mobile bottom nav (single NAV array drives both)
    - _Bug_Condition: context.component = "Shell" AND context.navItem = "/clipper"_
    - _Expected_Behavior: Shell renders with no Clipper nav item_
    - _Preservation: all other nav items remain; sidebar collapse/expand unaffected_
    - _Requirements: 2.2, 2.12_

  - [x] 3.3 Verify bug condition exploration test now passes (Group D)
    - **Property 1: Expected Behavior** - Clipper Feature Deleted
    - **IMPORTANT**: Re-run the SAME test from task 1 scoped to Group D — do NOT write a new test
    - Assert `src/app/clipper/page.tsx` no longer exists
    - Assert Shell renders with no nav item href `/clipper`
    - **EXPECTED OUTCOME**: Tests PASS (confirms clipper is fully removed)
    - _Requirements: 2.1, 2.2, 2.12_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Other Nav Items Unaffected
    - Re-run preservation tests from task 2
    - **EXPECTED OUTCOME**: Tests PASS (no regressions in nav or other pages)

- [x] 4. Fix Group A — Wrong/dead endpoints

  - [x] 4.1 Fix `/status` page endpoint (`src/app/status/page.tsx`)
    - Replace `fetch("/api/admin/health", ...)` with `fetch("/api/post-log?limit=1", { credentials: "include" })`
    - Parse response: if fetch succeeds and returns `{ log: [...] }` → `status: "ok"`; if throws → `status: "error"`
    - Derive synthetic health object: `{ status, dependencies: { supabase: { ok: boolean, latencyMs: number } } }`
    - Remove `process.env.NEXT_PUBLIC_AUTOMATE_SECRET` reference from fetch headers
    - _Bug_Condition: context.page = "/status" AND context.action = "healthCheck"_
    - _Expected_Behavior: page calls /api/post-log, derives health from response, displays status_
    - _Preservation: other service dots showing "—" is acceptable; no other page affected_
    - _Requirements: 2.3_

  - [x] 4.2 Fix `/queue` worker URL (`src/app/queue/page.tsx`)
    - Replace `https://ppp-tv-worker.euginemicah.workers.dev/feed?limit=30` with `https://auto-ppp-tv.euginemicah.workers.dev/feed?limit=30`
    - _Bug_Condition: context.page = "/queue" AND context.action = "fetchFeed"_
    - _Expected_Behavior: queue fetches from correct worker URL and feed loads_
    - _Preservation: queue post action (/api/post-from-url) and per-item state unaffected_
    - _Requirements: 2.6_

  - [x] 4.3 Fix `/composer` Cockpit to use app's own `/api/post-log` (`src/app/composer/page.tsx`)
    - In `CockpitTab.load()`, replace `fetch(WORKER + "/post-log", { headers: WORKER_AUTH })` with `fetch("/api/post-log?limit=60", { credentials: "include" })`
    - Update sort to use `b.posted_at ?? b.postedAt` for compatibility
    - Update field references in Cockpit feed render: `p.postedAt` → `p.posted_at ?? p.postedAt`, `p.instagram?.success` → `p.ig_success ?? p.instagram?.success`, `p.facebook?.success` → `p.fb_success ?? p.facebook?.success`
    - _Bug_Condition: context.page = "/composer" AND context.action = "loadCockpit"_
    - _Expected_Behavior: Cockpit calls /api/post-log with credentials, auth middleware applies_
    - _Preservation: Compose tab SSE streaming and video posting unaffected_
    - _Requirements: 2.7_

  - [x] 4.4 Fix `/dashboard` trigger missing auth header (`src/app/dashboard/page.tsx`)
    - In `triggerNow`, replace bare `fetch("https://auto-ppp-tv.euginemicah.workers.dev/trigger")` with `fetch("https://auto-ppp-tv.euginemicah.workers.dev/trigger", { headers: { Authorization: "Bearer ppptvWorker2024" } })`
    - _Bug_Condition: context.page = "/dashboard" AND context.action = "triggerNow"_
    - _Expected_Behavior: trigger call includes Authorization header, worker accepts request_
    - _Preservation: dashboard KPI stats, ticker, alerts, last-published-post panel unaffected; clearCache call already has correct header_
    - _Requirements: 2.8_

  - [x] 4.5 Verify bug condition exploration test now passes (Group A)
    - **Property 1: Expected Behavior** - Correct Endpoints and Auth Headers
    - Re-run the SAME tests from task 1 scoped to Group A
    - Assert StatusPage calls `/api/post-log` not `/api/admin/health`
    - Assert QueuePage calls `auto-ppp-tv.euginemicah.workers.dev`
    - Assert CockpitTab calls `/api/post-log` not WORKER directly
    - Assert triggerNow includes `Authorization` header
    - **EXPECTED OUTCOME**: Tests PASS

  - [x] 4.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Dashboard, Queue, Composer Compose Tab Unaffected
    - Re-run preservation tests from task 2
    - **EXPECTED OUTCOME**: Tests PASS (no regressions)

- [x] 5. Fix Group B — Field name mismatch (snake_case)

  - [x] 5.1 Fix `/analytics` page field names (`src/app/analytics/page.tsx`)
    - Update `LogEntry` interface: replace camelCase fields with snake_case (`ig_success`, `fb_success`, `posted_at`, `article_id`)
    - Update all field references: `p.instagram.success` → `p.ig_success`, `p.facebook.success` → `p.fb_success`, `p.postedAt` → `p.posted_at`
    - _Bug_Condition: context.page = "/analytics" AND context.fieldAccessed IN ["instagram.success","facebook.success","postedAt","articleId"]_
    - _Expected_Behavior: for any PostRecord array, igOk = count of records where ig_success === true_
    - _Preservation: page layout, chart rendering, and date filtering logic unaffected_
    - _Requirements: 2.4_

  - [x] 5.2 Fix `/content` page field names (`src/app/content/page.tsx`)
    - Update `LogEntry` interface: same snake_case fields as analytics
    - Update all field references: `entry.instagram.success` → `entry.ig_success`, `entry.facebook.success` → `entry.fb_success`, `entry.postedAt` → `entry.posted_at`, `entry.articleId` → `entry.article_id`
    - _Bug_Condition: context.page = "/content" AND context.fieldAccessed IN ["instagram.success","facebook.success","postedAt","articleId"]_
    - _Expected_Behavior: for any PostRecord array, content library entry count equals input array length_
    - _Preservation: search/filter UI, entry card layout, and pagination unaffected_
    - _Requirements: 2.5_

  - [x] 5.3 Verify bug condition exploration test now passes (Group B)
    - **Property 1: Expected Behavior** - Correct Field Mapping
    - Re-run the SAME tests from task 1 scoped to Group B
    - Feed `{ log: [{ ig_success: true, fb_success: false, posted_at: "...", article_id: "x" }] }` to AnalyticsPage
    - Assert `igOk` stat shows 1 (not 0)
    - Assert ContentPage entry count equals input array length
    - **EXPECTED OUTCOME**: Tests PASS

  - [x] 5.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Analytics and Content Layout Unaffected
    - Re-run preservation tests from task 2
    - **EXPECTED OUTCOME**: Tests PASS (no regressions)

- [x] 6. Fix Group C — Missing Shell wrapper / navigation

  - [x] 6.1 Add Shell wrapper to `/status` page (`src/app/status/page.tsx`)
    - Wrap the entire return in `<Shell>` (already a client component — `"use client"` is present)
    - _Bug_Condition: context.page = "/status" AND context.action = "render"_
    - _Expected_Behavior: StatusPage renders inside Shell with full sidebar navigation_
    - _Preservation: status content and health-check logic unaffected_
    - _Requirements: 2.10_

  - [x] 6.2 Add nav header to `/about`, `/privacy`, `/terms`, `/contact` pages
    - These are server components — add a dark top bar with PPP TV logo and "← Dashboard" link above `<main>` in each file
    - Top bar: `background: "#0a0a0a"`, `borderBottom: "1px solid #1f1f1f"`, height 52px, flex row with logo left and link right
    - Logo: `PPP<span style={{ color: "#E50914" }}>TV</span>` in Bebas Neue 20px
    - Link: `← Dashboard` href `/dashboard`, 12px, color `#888`, fontWeight 600
    - Apply to: `src/app/about/page.tsx`, `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, `src/app/contact/page.tsx`
    - _Bug_Condition: context.page IN ["/about","/privacy","/terms","/contact"] AND context.action = "render"_
    - _Expected_Behavior: pages render with consistent dark top bar and back-to-dashboard link_
    - _Preservation: existing page content (text, layout) unaffected_
    - _Requirements: 2.11_

  - [x] 6.3 Verify bug condition exploration test now passes (Group C)
    - **Property 1: Expected Behavior** - Shell/Nav Present on All Pages
    - Re-run the SAME tests from task 1 scoped to Group C
    - Assert StatusPage output contains `<Shell>`
    - Assert About/Privacy/Terms/Contact pages contain top bar with "← Dashboard" link
    - **EXPECTED OUTCOME**: Tests PASS

  - [x] 6.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Page Content Unaffected
    - Re-run preservation tests from task 2
    - **EXPECTED OUTCOME**: Tests PASS (no regressions)

- [x] 7. Fix Group E — UX and CORS gaps

  - [x] 7.1 Create YouTube RSS proxy route (`src/app/api/competitors/feed/route.ts`)
    - New file: `src/app/api/competitors/feed/route.ts`
    - `GET` handler: read `channelId` query param, fetch `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}` server-side with `User-Agent: Mozilla/5.0 (compatible; PPPTVBot/2.0)` and 10s timeout
    - Return XML with `Content-Type: application/xml`; return 400 if no channelId, 502 on fetch error
    - _Bug_Condition: context.page = "/competitors" AND context.action = "fetchYouTubeFeed" AND context.origin = "browser"_
    - _Expected_Behavior: YouTube RSS is fetched server-side, no CORS error, feed data returned to client_
    - _Preservation: existing competitor page UI and channel list unaffected_
    - _Requirements: 2.15_

  - [x] 7.2 Update `/competitors` to use proxy route (`src/app/competitors/page.tsx`)
    - In `fetchYouTubeFeed`, replace `fetch("https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}", ...)` with `fetch(\`/api/competitors/feed?channelId=${channelId}\`)`
    - Remove client-side `User-Agent` header (now set server-side)
    - _Requirements: 2.15_

  - [x] 7.3 Add post feedback toast to `/composer` Cockpit (`src/app/composer/page.tsx`)
    - Add `toast` state: `useState<{ msg: string; type: "ok" | "err" } | null>(null)`
    - In `triggerAutoPost`: capture `prevIds` before calling `/api/automate-video`, call `load()` after, find first new post by comparing `article_id`/`articleId`, set toast with title (max 50 chars) or generic "Auto-post triggered ✓"
    - On error: set toast with error message, type `"err"`
    - Auto-dismiss toast after 4000ms via `setTimeout(() => setToast(null), 4000)`
    - Render toast at bottom of CockpitTab return, matching existing toast style from `/queue`
    - _Bug_Condition: context.page = "/composer" AND context.action = "triggerAutoPost" AND context.feedbackShown = false_
    - _Expected_Behavior: user sees success/failure toast with article title after auto-post_
    - _Preservation: Compose tab, video posting, and SSE streaming unaffected_
    - _Requirements: 2.13_

  - [x] 7.4 Add per-item retry button to `/factory` (`src/app/factory/page.tsx`)
    - In item render block, when `item.status === "error"`, render retry button alongside error message
    - Button style: `background: RED+"22"`, `border: 1px solid RED+"44"`, `color: RED`, borderRadius 5, padding `4px 10px`, fontSize 10, fontWeight 700, cursor pointer, label `↺ Retry`
    - Add `repostItem(i: number)` function: reset item status to `"ready"` then run the existing single-item post logic for index `i`
    - Disable retry button when `running` is true
    - _Bug_Condition: context.page = "/factory" AND context.action = "retryFailedItem" AND context.retryButtonPresent = false_
    - _Expected_Behavior: failed items show retry button; clicking re-attempts the post for that item only_
    - _Preservation: bulk post-all flow, progress tracking, and other item states unaffected_
    - _Requirements: 2.14_

  - [x] 7.5 Verify bug condition exploration test now passes (Group E)
    - **Property 1: Expected Behavior** - UX and CORS Gaps Resolved
    - Re-run the SAME tests from task 1 scoped to Group E
    - Assert CompetitorsPage calls `/api/competitors/feed?channelId=...` not youtube.com directly
    - Assert CockpitTab shows toast after triggerAutoPost
    - Assert FactoryPage failed item renders retry button
    - **EXPECTED OUTCOME**: Tests PASS

  - [x] 7.6 Verify preservation tests still pass
    - **Property 2: Preservation** - Composer, Factory, Competitors Unaffected
    - Re-run preservation tests from task 2
    - **EXPECTED OUTCOME**: Tests PASS (no regressions)

- [x] 8. Checkpoint — Ensure all tests pass
  - Re-run the full test suite (exploration + preservation)
  - All 15 defect fix-checking assertions must pass
  - All preservation property tests must pass
  - Manually verify in browser: `/status` loads with Shell nav, `/analytics` shows non-zero KPIs, `/queue` loads feed, `/competitors` loads YouTube feeds, `/factory` shows retry buttons on failed items, `/composer` Cockpit shows toast after auto-post
  - Confirm `/clipper` returns 404 and is absent from sidebar
  - Confirm `/about`, `/privacy`, `/terms`, `/contact` show the dark top bar with "← Dashboard"
  - Ask the user if any questions arise


- [x] 9. User flow improvements

  - [x] 9.1 Analytics — add date range filter (7d / 30d / 90d / All)
    - Add `range` state, filter `log` before all KPI/chart computations
    - Add pill toggle row above KPI grid
    - _Requirements: UF-1_

  - [x] 9.2 Content library — newest-first + platform filter pills
    - Remove `.reverse()` (data is already newest-first from Supabase)
    - Add `platformFilter` state and filter pills (All / IG ✓ / FB ✓ / Failed)
    - _Requirements: UF-2_

  - [x] 9.3 Queue — "Post All Visible" bulk action
    - Add `postAllVisible()` that iterates filtered items sequentially with 3s delay
    - Show "Post All (N)" button in header; show "Posting X of Y…" progress while running
    - _Requirements: UF-3_

  - [x] 9.4 Composer Cockpit — per-item retry for failed posts
    - In feed item render, show "↺ Retry" button when ig or fb failed
    - Call `/api/retry-post` with `article_id` and failed platform
    - _Requirements: UF-4_

  - [x] 9.5 Factory — always-visible summary bar
    - Move summary line outside `items.length > 0` conditional
    - Style as a sticky bar above the item list
    - _Requirements: UF-5_

  - [x] 9.6 Competitors — lazy load + Refresh All button
    - Replace `competitors.forEach(loadCompetitor)` with `loadCompetitor(competitors[0])` on mount
    - Add "↻ Refresh All" button in page header
    - _Requirements: UF-6_

  - [x] 9.7 Trends — disable "Post This" when trend has no URL
    - Disable button with `opacity: 0.4` and `title="No URL available"` when `!trend.url`
    - _Requirements: UF-8_

  - [x] 9.8 Dashboard — confirm before pipeline trigger
    - Add two-step confirm state to "Post Now" button (first click → "Confirm? (3s)", second click → trigger)
    - 3-second timeout resets confirm state
    - _Requirements: UF-9_

  - [x] 9.9 Login — redirect to `?from=` path after successful login
    - Use `useSearchParams()` to read `from` param
    - After login success, `router.push(from || "/dashboard")` — validate `from` starts with `/`
    - _Requirements: UF-11_

  - [x] 9.10 Settings — Test Worker Connection button
    - Convert to client component, add "Test Worker" button
    - Fetch worker root URL, show latency ms or error inline
    - _Requirements: UF-12_

  - [x] 9.11 Accounts — Verify Token button for IG and FB
    - Add "Verify" button next to Connected status for Instagram and Facebook
    - Call `/api/post-log?limit=1` as proxy health check, show "Token OK" or "Token Error"
    - _Requirements: UF-13_
