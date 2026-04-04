# Pages Not Working — Bugfix Design

## Overview

Fifteen discrete defects span the PPP TV Command Center app. They fall into five categories:

1. **Dead feature** — `/clipper` page and its nav entry must be deleted entirely (defects 1.1, 1.2, 1.12)
2. **Wrong/dead endpoints** — `/status` calls a non-existent API route; `/queue` calls the wrong worker URL; `/composer` Cockpit calls the worker directly instead of the app's own route; `/dashboard` trigger call is missing its auth header (defects 1.3, 1.6, 1.7, 1.8)
3. **Field-name mismatch** — `/analytics` and `/content` use camelCase field names against a Supabase response that returns snake_case (defects 1.4, 1.5)
4. **Missing Shell wrapper / navigation** — `/status`, `/about`, `/privacy`, `/terms`, `/contact` render outside the Shell (defects 1.10, 1.11)
5. **UX gaps** — `/intelligence` missing `credentials`, `/composer` Cockpit has no post feedback toast, `/factory` has no per-item retry, `/competitors` fetches YouTube RSS directly from the browser (defects 1.9, 1.13, 1.14, 1.15)

The fix strategy is surgical: change only the lines that are wrong, add only the code that is missing, and delete only what must go.

---

## Glossary

- **Bug_Condition (C)**: The set of runtime conditions under which a defect manifests (wrong URL, missing header, field mismatch, etc.)
- **Property (P)**: The correct observable behaviour that must hold after the fix
- **Preservation**: All existing behaviour that must remain unchanged
- **Shell**: `src/app/shell.tsx` — the layout wrapper that provides sidebar, mobile nav, and auth-aware navigation
- **getPostLog**: `src/lib/supabase.ts` — returns `PostRecord[]` with snake_case fields (`ig_success`, `fb_success`, `posted_at`, `article_id`)
- **LogEntry (camelCase)**: The interface used in `/analytics` and `/content` pages — currently mismatched against `PostRecord`
- **WORKER**: `https://auto-ppp-tv.euginemicah.workers.dev` — the canonical Cloudflare Worker URL used everywhere except `/queue`
- **WORKER_AUTH**: `Authorization: Bearer ppptvWorker2024` — required header for worker mutation endpoints

---

## Bug Details

### Bug Condition

The bugs manifest across multiple files. Each has its own trigger condition:

**Formal Specification:**
```
FUNCTION isBugCondition(context)
  INPUT: context — { page, action, fieldAccessed }
  OUTPUT: boolean

  RETURN (
    // Group A — dead/wrong endpoints
    (context.page = "/status"   AND context.action = "healthCheck")
    OR (context.page = "/queue"    AND context.action = "fetchFeed")
    OR (context.page = "/composer" AND context.action = "loadCockpit")
    OR (context.page = "/dashboard" AND context.action = "triggerNow")

    // Group B — field name mismatch
    OR (context.page IN ["/analytics", "/content"]
        AND context.fieldAccessed IN ["instagram.success","facebook.success","postedAt","articleId"])

    // Group C — missing Shell wrapper
    OR (context.page IN ["/status","/about","/privacy","/terms","/contact"]
        AND context.action = "render")

    // Group D — deleted feature still present
    OR (context.page = "/clipper" AND context.action = "render")
    OR (context.component = "Shell" AND context.action = "renderNavItem"
        AND context.navItem = "/clipper")

    // Group E — UX / auth gaps
    OR (context.page = "/intelligence" AND context.action = "fetchPostLog"
        AND context.credentials = "omit")
    OR (context.page = "/competitors" AND context.action = "fetchYouTubeFeed"
        AND context.origin = "browser")
    OR (context.page = "/composer" AND context.action = "triggerAutoPost"
        AND context.feedbackShown = false)
    OR (context.page = "/factory" AND context.action = "retryFailedItem"
        AND context.retryButtonPresent = false)
  )
END FUNCTION
```

### Examples

- **Defect 1.3**: `/status` calls `GET /api/admin/health` → 404 → `data` stays `null` → all service dots show "—"
- **Defect 1.4/1.5**: `log[0].instagram.success` is `undefined` (field is `ig_success`) → `igOk` = 0, all KPIs show zero
- **Defect 1.6**: `fetch("https://ppp-tv-worker.euginemicah.workers.dev/feed")` → network error or wrong data → queue shows empty
- **Defect 1.7**: Cockpit fetches `WORKER + "/post-log"` with `WORKER_AUTH` → bypasses Next.js auth middleware
- **Defect 1.8**: `fetch("https://auto-ppp-tv.euginemicah.workers.dev/trigger")` with no `Authorization` header → worker rejects with 401
- **Defect 1.10**: `/status` renders a bare `<div>` with no nav → user is stranded
- **Defect 1.15**: `fetchYouTubeFeed` runs in the browser → YouTube returns CORS error → all competitor feeds fail silently

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Login flow: correct password sets session cookie and redirects to `/dashboard`
- Middleware: unprotected routes remain unprotected; protected routes still redirect to `/login` without a cookie
- `/composer` Compose tab: SSE streaming, progress panel, and video posting continue to work
- `/dashboard` KPI stats, live ticker, system alerts, and last-published-post panel continue to work
- `/trends`, `/calendar`, `/queue` (post action), `/settings`, `/accounts` continue to work as before
- Sidebar collapse/expand on desktop and mobile bottom nav continue to work
- All existing API routes remain unchanged

**Scope:**
All inputs that do NOT involve the fifteen identified bug conditions are completely unaffected by this fix.

---

## Hypothesized Root Cause

1. **Wrong worker URL in `/queue`** — The URL `ppp-tv-worker.euginemicah.workers.dev` is a stale/different worker. The canonical URL used everywhere else is `auto-ppp-tv.euginemicah.workers.dev`.

2. **Non-existent API route in `/status`** — `/api/admin/health` was never created. The page was written against a planned but unimplemented route. The existing `/api/post-log` can serve as a lightweight health proxy.

3. **camelCase vs snake_case mismatch in `/analytics` and `/content`** — The `LogEntry` interface was written before the migration from Cloudflare KV (which stored camelCase) to Supabase (which uses snake_case). The `getPostLog` function returns `PostRecord` with `ig_success`, `fb_success`, `posted_at`, `article_id`. The pages never got updated.

4. **Cockpit fetching worker directly** — The `CockpitTab` in `/composer` was written to call `WORKER + "/post-log"` directly, bypassing the app's own `/api/post-log` route. This is inconsistent with every other page and skips auth.

5. **Missing `Authorization` header on trigger** — The `triggerNow` function in `/dashboard` calls the worker's `/trigger` endpoint without the `WORKER_AUTH` header. The `clearCache` call in the same file correctly includes it, so this is an oversight.

6. **Missing Shell wrapper** — `/status`, `/about`, `/privacy`, `/terms`, and `/contact` were written as standalone pages. They were never wrapped in `<Shell>`, leaving users with no navigation.

7. **Clipper not removed** — The `/clipper` page file exists, the nav entry exists in `shell.tsx`, and the middleware matcher doesn't protect it. All three need to be addressed.

8. **Browser CORS on YouTube RSS** — `fetchYouTubeFeed` runs client-side and fetches `https://www.youtube.com/feeds/videos.xml` directly. YouTube does not set permissive CORS headers, so browsers block the request. The fix is a server-side proxy route.

9. **Missing credentials on `/intelligence`** — The `fetch("/api/post-log")` call already includes `credentials: "include"` in the current code, so this defect is already resolved in the file as read. No change needed.

10. **No feedback toast in Cockpit auto-post** — `triggerAutoPost` in `CockpitTab` calls `/api/automate-video` and then calls `load()` but never shows the user what was posted. A simple toast with the article title is needed.

11. **No per-item retry in `/factory`** — Failed items show an error string but no retry button. The existing `postItem`-style logic needs a retry button per failed item.

---

## Correctness Properties

Property 1: Bug Condition — All 15 Defects Produce Correct Output

_For any_ page load or user action where the bug condition holds (isBugCondition returns true), the fixed code SHALL produce the correct observable output: correct data displayed, correct endpoint called, correct auth header sent, Shell wrapper rendered, nav item absent, or CORS-safe proxy used — as specified per defect group.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15**

Property 2: Preservation — Unaffected Pages and Flows Remain Unchanged

_For any_ page load or user action where the bug condition does NOT hold (isBugCondition returns false), the fixed code SHALL produce exactly the same result as the original code, preserving all existing login, posting, streaming, navigation, and data-fetching behaviour.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12**

---

## Fix Implementation

### Changes Required

#### Fix 1.1 + 1.2 + 1.12 — Delete clipper, remove from nav and middleware

**File**: `src/app/clipper/page.tsx`
**Change**: Delete the file entirely.

**File**: `src/app/shell.tsx`
**Change**: Remove the `{ href: "/clipper", icon: "✂️", label: "Clipper" }` entry from the `NAV` array.

**File**: `src/middleware.ts`
**Change**: No action needed — `/clipper` is not in `PROTECTED`, and the matcher already excludes it. Deleting the page file is sufficient.

---

#### Fix 1.3 + 1.10 — `/status` page: fix endpoint + add Shell

**File**: `src/app/status/page.tsx`
**Changes**:
1. Replace `fetch("/api/admin/health", ...)` with `fetch("/api/post-log?limit=1")`. Parse the response to derive a synthetic health object: if the fetch succeeds and returns `{ log: [...] }`, status is `"ok"`; if it throws, status is `"error"`.
2. Wrap the entire return in `<Shell>` and add `"use client"` is already present.
3. Remove the `process.env.NEXT_PUBLIC_AUTOMATE_SECRET` reference from the fetch headers (not needed for `/api/post-log`).

Synthetic health response shape:
```
{
  status: "ok" | "error",
  dependencies: {
    supabase: { ok: boolean, latencyMs: number },
  }
}
```
The existing service items (Meta Graph API, Gemini AI, etc.) will show `dep === undefined` → "—" which is acceptable since we cannot check them from the client. The key fix is that the page no longer calls a 404 route and is now wrapped in Shell.

---

#### Fix 1.4 + 1.5 — `/analytics` and `/content`: fix field name mismatch

**File**: `src/app/analytics/page.tsx`
**Change**: Update the `LogEntry` interface to use snake_case fields matching `PostRecord`:
```typescript
interface LogEntry {
  article_id: string;
  title: string;
  category: string;
  ig_success: boolean;
  fb_success: boolean;
  posted_at: string;
  manualPost?: boolean; // kept for backward compat, may be absent
}
```
Update all references: `p.instagram.success` → `p.ig_success`, `p.facebook.success` → `p.fb_success`, `p.postedAt` → `p.posted_at`.

**File**: `src/app/content/page.tsx`
**Change**: Same interface update. Update all references: `entry.instagram.success` → `entry.ig_success`, `entry.facebook.success` → `entry.fb_success`, `entry.postedAt` → `entry.posted_at`, `entry.articleId` → `entry.article_id`.

---

#### Fix 1.6 — `/queue`: fix worker URL

**File**: `src/app/queue/page.tsx`
**Change**: Replace:
```typescript
const r = await fetch(`https://ppp-tv-worker.euginemicah.workers.dev/feed?limit=30`);
```
with:
```typescript
const r = await fetch(`https://auto-ppp-tv.euginemicah.workers.dev/feed?limit=30`);
```

---

#### Fix 1.7 — `/composer` Cockpit: use app's own `/api/post-log`

**File**: `src/app/composer/page.tsx` — `CockpitTab` component, `load` function
**Change**: Replace:
```typescript
const r = await fetch(WORKER + "/post-log", { headers: WORKER_AUTH });
const d = await r.json() as any;
setPosts((d.log || []).sort(...));
```
with:
```typescript
const r = await fetch("/api/post-log?limit=60", { credentials: "include" });
const d = await r.json() as any;
setPosts((d.log || []).sort((a: any, b: any) =>
  new Date(b.posted_at ?? b.postedAt ?? 0).getTime() -
  new Date(a.posted_at ?? a.postedAt ?? 0).getTime()
));
```
Also update the field references inside the Cockpit feed render: `p.postedAt` → `p.posted_at ?? p.postedAt`, `p.instagram?.success` → `p.ig_success ?? p.instagram?.success`, `p.facebook?.success` → `p.fb_success ?? p.facebook?.success`.

---

#### Fix 1.8 — `/dashboard`: add auth header to trigger call

**File**: `src/app/dashboard/page.tsx` — `triggerNow` function
**Change**: Replace:
```typescript
await fetch("https://auto-ppp-tv.euginemicah.workers.dev/trigger");
```
with:
```typescript
await fetch("https://auto-ppp-tv.euginemicah.workers.dev/trigger", {
  headers: { Authorization: "Bearer ppptvWorker2024" },
});
```

---

#### Fix 1.9 — `/intelligence`: credentials already present

No change required. The current `src/app/intelligence/page.tsx` already includes `credentials: "include"` on the fetch call.

---

#### Fix 1.11 — `/about`, `/privacy`, `/terms`, `/contact`: add Shell wrapper

These are server components (no `"use client"`). They cannot use the client-side `Shell` directly. The fix is to add a consistent styled header with a back link that matches the app's dark design system, rather than converting them to client components.

**Files**: `src/app/about/page.tsx`, `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, `src/app/contact/page.tsx`

**Change**: Wrap the existing `<main>` content in a new outer `<div>` that adds a dark top bar with the PPP TV logo and a "← Dashboard" link. This avoids the complexity of making these server components into client components while still giving users a navigation path.

```tsx
// Top bar to add above <main> in each page:
<div style={{ background: "#0a0a0a", borderBottom: "1px solid #1f1f1f", padding: "0 24px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 2 }}>
    PPP<span style={{ color: "#E50914" }}>TV</span>
  </span>
  <a href="/dashboard" style={{ fontSize: 12, color: "#888", textDecoration: "none", fontWeight: 600 }}>← Dashboard</a>
</div>
```

---

#### Fix 1.13 — `/composer` Cockpit: add post feedback toast

**File**: `src/app/composer/page.tsx` — `CockpitTab` component
**Change**: Add a `toast` state. After `triggerAutoPost` completes, call `load()` and then set a toast with the title of the first new post (compare post list before and after). If no new post is detected, show a generic "Auto-post triggered" message.

```typescript
const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

async function triggerAutoPost() {
  setAutoPosting(true);
  const prevIds = new Set(posts.map((p: any) => p.article_id ?? p.articleId));
  try {
    const r = await fetch("/api/automate-video", { ...FETCH_OPTS, method: "POST", headers: { "Content-Type": "application/json" } });
    const d = await r.json() as any;
    await load();
    // Find newly added post
    const newPost = posts.find((p: any) => !prevIds.has(p.article_id ?? p.articleId));
    const msg = newPost?.title ? `Posted: ${newPost.title.slice(0, 50)}` : (d.error ? d.error : "Auto-post triggered ✓");
    setToast({ msg, type: d.error ? "err" : "ok" });
    setTimeout(() => setToast(null), 4000);
  } catch (e: any) {
    setToast({ msg: e.message || "Auto-post failed", type: "err" });
    setTimeout(() => setToast(null), 4000);
  }
  setAutoPosting(false);
}
```

Render the toast at the bottom of `CockpitTab`'s return, matching the existing toast style used in `/queue`.

---

#### Fix 1.14 — `/factory`: add per-item retry button

**File**: `src/app/factory/page.tsx`
**Change**: In the item render block, when `item.status === "error"`, add a retry button alongside the error message:

```tsx
{item.status === "error" && (
  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
    <span style={{ fontSize: 11, color: RED }}>{item.error}</span>
    <button
      onClick={() => repostItem(i)}
      disabled={running}
      style={{ background: RED + "22", border: `1px solid ${RED}44`, color: RED, borderRadius: 5, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
    >
      ↺ Retry
    </button>
  </div>
)}
```

Add a `repostItem(i: number)` function that resets the item to `"ready"` status and then calls the existing `postAll`-style logic for just that one item.

---

#### Fix 1.15 — `/competitors`: proxy YouTube RSS through Next.js API route

**New File**: `src/app/api/competitors/feed/route.ts`
```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const channelId = req.nextUrl.searchParams.get("channelId");
  if (!channelId) return NextResponse.json({ error: "Missing channelId" }, { status: 400 });
  try {
    const r = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; PPPTVBot/2.0)" }, signal: AbortSignal.timeout(10000) }
    );
    if (!r.ok) return NextResponse.json({ error: "Feed unavailable" }, { status: 502 });
    const xml = await r.text();
    return new NextResponse(xml, { headers: { "Content-Type": "application/xml" } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
```

**File**: `src/app/competitors/page.tsx` — `fetchYouTubeFeed` function
**Change**: Replace the direct `fetch("https://www.youtube.com/feeds/...")` call with:
```typescript
const r = await fetch(`/api/competitors/feed?channelId=${channelId}`);
```
Remove the `User-Agent` header from the client-side call (it's now set server-side).

---

## Testing Strategy

### Validation Approach

Two-phase: first run exploratory tests on the unfixed code to confirm each bug manifests as described, then run fix-checking and preservation tests after applying the fixes.

### Exploratory Bug Condition Checking

**Goal**: Confirm each defect is reproducible before fixing.

**Test Cases**:
1. **Status page health call** — Mock `fetch` in a test, render `StatusPage`, assert it calls `/api/admin/health` (will 404 on unfixed code)
2. **Analytics field mismatch** — Feed a mock `{ log: [{ ig_success: true, fb_success: false, posted_at: "...", article_id: "x" }] }` response to `AnalyticsPage`, assert `igOk` stat shows 1 (will show 0 on unfixed code)
3. **Queue wrong URL** — Mock `fetch`, render `QueuePage`, assert it calls the correct worker URL (will call wrong URL on unfixed code)
4. **Dashboard trigger missing header** — Spy on `fetch`, call `triggerNow`, assert the `Authorization` header is present (will be absent on unfixed code)
5. **Competitors CORS** — Render `CompetitorsPage`, assert `fetchYouTubeFeed` calls `/api/competitors/feed` not `youtube.com` directly (will call youtube.com on unfixed code)

**Expected Counterexamples**:
- Analytics KPIs all show 0 despite data being present
- Queue shows "Feed unavailable" error
- Dashboard trigger returns 401 from worker
- Competitor feeds silently return empty arrays

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed code produces the expected output.

**Pseudocode:**
```
FOR ALL context WHERE isBugCondition(context) DO
  result := fixedCode(context)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed code produces the same result as the original.

**Pseudocode:**
```
FOR ALL context WHERE NOT isBugCondition(context) DO
  ASSERT originalCode(context) = fixedCode(context)
END FOR
```

**Testing Approach**: Property-based testing is recommended for the field-mapping fixes (defects 1.4, 1.5) because the mapping must hold for any arbitrary `PostRecord` shape. For the endpoint and header fixes, unit tests with fetch mocks are sufficient.

### Unit Tests

- Render `StatusPage` after fix → assert it calls `/api/post-log` not `/api/admin/health`
- Render `StatusPage` after fix → assert `<Shell>` is present in the output
- Feed snake_case mock data to `AnalyticsPage` → assert all KPI values are non-zero
- Feed snake_case mock data to `ContentPage` → assert entries render with correct titles
- Render `QueuePage` → assert fetch is called with `auto-ppp-tv.euginemicah.workers.dev`
- Call `triggerNow` in `Dashboard` → assert `Authorization` header is present
- Render `CompetitorsPage` → assert `fetchYouTubeFeed` calls `/api/competitors/feed`
- Render `Shell` → assert no nav item with href `/clipper` is present
- Render `AboutPage`, `PrivacyPage`, `TermsPage`, `ContactPage` → assert top bar with "← Dashboard" link is present

### Property-Based Tests

- For any array of `PostRecord` objects with arbitrary `ig_success`/`fb_success` values, the `AnalyticsPage` KPI for "Instagram" must equal the count of records where `ig_success === true`
- For any array of `PostRecord` objects, the `ContentPage` entry list length must equal the input array length (no entries dropped due to field mismatch)
- For any `BulkItem` with `status === "error"`, the factory item render must include a retry button

### Integration Tests

- Full render of `/status` after fix: page loads, shows Shell nav, calls `/api/post-log`, displays status
- Full render of `/analytics` after fix: page loads, fetches post log, displays non-zero KPIs when data is present
- Full render of `/competitors` after fix: page loads, calls `/api/competitors/feed?channelId=...` for each competitor
- `/composer` Cockpit after fix: `triggerAutoPost` shows a toast after completion
- `/factory` after fix: failed item shows retry button; clicking it re-attempts the post


---

## User Flow Improvement Designs

### UF-1 — Analytics date range filter

**File**: `src/app/analytics/page.tsx`
**Change**: Add `range` state (`"7d" | "30d" | "90d" | "all"`). Filter `log` array before computing all KPIs and charts. Add a pill toggle row above the KPI grid: `7D · 30D · 90D · All`.

---

### UF-2 — Content library: newest-first + platform filter

**File**: `src/app/content/page.tsx`
**Change**: Remove the `.reverse()` call (data from `/api/post-log` is already newest-first from Supabase). Add `platformFilter` state (`"all" | "ig" | "fb" | "failed"`). Apply filter before rendering. Add filter pills next to the search input.

---

### UF-3 — Queue: "Post All Visible" bulk action

**File**: `src/app/queue/page.tsx`
**Change**: Add `postingAll` state and `postAllVisible()` function that iterates `filtered` items sequentially (skipping already-posted ones), calling `postItem` for each with a 3s delay between. Show a "Post All (N)" button in the header when `filtered.length > 0` and not all are posted. Show a progress counter "Posting X of Y…" while running.

---

### UF-4 — Cockpit: per-item retry for failed posts

**File**: `src/app/composer/page.tsx` — `CockpitTab`
**Change**: In the feed item render, when `!(p.ig_success ?? p.instagram?.success) || !(p.fb_success ?? p.facebook?.success)`, show a small "↺ Retry" button that calls `/api/retry-post` with the post's `article_id` and failed platform.

---

### UF-5 — Factory: always-visible summary bar

**File**: `src/app/factory/page.tsx`
**Change**: Move the summary line (`X items · Y posted · Z ready`) outside the `items.length > 0` conditional so it's always visible once items exist. Style it as a sticky bar at the top of the item list.

---

### UF-6 — Competitors: lazy load + Refresh All

**File**: `src/app/competitors/page.tsx`
**Change**: Replace `competitors.forEach(c => loadCompetitor(c))` in `useEffect` with `loadCompetitor(competitors[0])` (load only the first/selected on mount). Add a "↻ Refresh All" button in the page header that calls `loadCompetitor` for all competitors sequentially.

---

### UF-8 — Trends: disable "Post This" when no URL

**File**: `src/app/trends/page.tsx`
**Change**: In the trend card, disable the "Post This" button when `!trend.url`. Add `title="No URL available"` and `opacity: 0.4` styling when disabled.

---

### UF-9 — Dashboard: confirm before trigger

**File**: `src/app/dashboard/page.tsx` — `EmergencyPost` component
**Change**: Add `confirm` state. First click sets `confirm = true` and changes button label to "Confirm? (3s)". A 3-second timeout resets `confirm` to false. Second click within 3s calls `onTrigger`. This prevents accidental pipeline triggers.

---

### UF-11 — Login: redirect to `?from=` after success

**File**: `src/app/login/page.tsx`
**Change**: Read `searchParams.get("from")` using `useSearchParams()`. After successful login, `router.push(from || "/dashboard")`. Validate `from` starts with `/` to prevent open redirect.

---

### UF-12 — Settings: Test Worker Connection button

**File**: `src/app/settings/page.tsx`
**Change**: Convert to client component (`"use client"`). Add a "Test Worker" button that fetches `https://auto-ppp-tv.euginemicah.workers.dev/` (GET, no auth) and shows latency in ms or an error. Display result inline next to the Worker row.

---

### UF-13 — Accounts: Verify Token button

**File**: `src/app/accounts/page.tsx`
**Change**: Add a `verifyToken(platform)` function that calls `/api/auth?check=platform` (or a lightweight existing endpoint). For now, call `/api/post-log?limit=1` as a proxy health check and show "Token OK" or "Token Error" inline next to the Connected status for IG and FB.
