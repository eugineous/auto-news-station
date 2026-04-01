# Instagram Posting Fix — Bugfix Design

## Overview

Posts are silently skipped on Instagram while Facebook succeeds. Two independent root causes:

1. **`src/lib/publisher.ts`** — callers treat `facebook.success` as overall success. The article gets marked as "seen" and the daily count incremented even when Instagram failed, preventing any retry.
2. **`cloudflare/worker.js`** — `postToInstagram` does a flat `sleep(3000)` instead of polling the container for `FINISHED` status, causing publish calls to race against an unready container.

The fix is minimal: surface Instagram failures distinctly in the result, and add container-status polling to the worker.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — Instagram fails but the caller treats the overall result as success because `facebook.success === true`
- **Property (P)**: The desired behavior — a partial failure (IG failed, FB succeeded) is reported as partial, not full success; the article is NOT marked seen; the daily count is NOT incremented
- **Preservation**: All existing behavior for the happy path (both succeed), FB-only posts, IG-only posts, and both-fail cases must remain unchanged
- **`publish()`**: The function in `src/lib/publisher.ts` that dispatches to both platforms and returns `{ instagram, facebook }`
- **`postOneArticle()`**: The function in `src/app/api/automate/route.ts` that calls `publish()` and decides whether to mark the article as seen
- **`anySuccess`**: The boolean `result.facebook.success || result.instagram.success` used in callers — this is the defective success gate
- **`postToInstagram()`**: The function in `cloudflare/worker.js` that creates an IG media container and publishes it
- **`waitForIGContainer()`**: The polling function in `src/lib/publisher.ts` that checks container `status_code` until `FINISHED`

## Bug Details

### Bug Condition

The bug manifests in two places:

**Bug A** — In `postOneArticle()` (automate) and the equivalent logic in `post-from-url/route.ts`: when `publish()` returns `{ instagram: { success: false }, facebook: { success: true } }`, the caller evaluates `anySuccess = result.facebook.success || result.instagram.success` which is `true`, and proceeds to mark the article as seen, increment the daily count, and log the post as successful — with no indication that Instagram was skipped.

**Bug B** — In `cloudflare/worker.js` `postToInstagram()`: after creating the media container, the code does `await sleep(3000)` and immediately attempts to publish. The Instagram API requires the container to reach `FINISHED` status before publishing; 3 seconds is insufficient for most images, causing the publish step to fail with a container-not-ready error.

**Formal Specification:**
```
FUNCTION isBugCondition(publishResult)
  INPUT: publishResult of type { instagram: PlatformResult, facebook: PlatformResult }
  OUTPUT: boolean

  -- Bug A: partial failure treated as full success
  RETURN publishResult.facebook.success === true
         AND publishResult.instagram.success === false
         AND publishResult.instagram.error !== "skipped"
END FUNCTION

FUNCTION isBugConditionB(containerId, elapsedMs)
  INPUT: containerId string, elapsedMs number
  OUTPUT: boolean

  -- Bug B: publish attempted before container is FINISHED
  RETURN elapsedMs < minimumReadyTime(containerId)
         AND publishAttempted === true
END FUNCTION
```

### Examples

- **Bug A**: `publish()` returns `{ instagram: { success: false, error: "Invalid token" }, facebook: { success: true, postId: "123" } }` → `anySuccess = true` → article marked seen, daily count incremented, Instagram failure silently swallowed
- **Bug A**: Same scenario in `post-from-url` — response returns `{ success: true }` even though Instagram was never posted
- **Bug B**: Container created, `sleep(3000)` elapses, publish called → Instagram API returns `"Media ID is not available"` or `"Container not ready"` error
- **Happy path (not a bug)**: Both succeed → `anySuccess = true` → mark seen, increment count ✓

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- When both Instagram and Facebook succeed, the post is logged as fully successful and the article is marked as seen
- When only Instagram is targeted (no `fb` post passed) and it succeeds, the result is treated as successful
- When only Facebook is targeted (no `ig` post passed) and it succeeds, the result is treated as successful
- When both platforms fail, the article is NOT marked as seen and the daily count is NOT incremented
- The retry-post endpoint targeting a single platform continues to work correctly
- The `publish()` function signature and return type are unchanged

**Scope:**
All inputs where `isBugCondition` returns false must be completely unaffected. This includes:
- Both platforms succeed
- Only one platform targeted and it succeeds
- Both platforms fail (already handled correctly)
- `instagram.error === "skipped"` (platform not targeted)

## Hypothesized Root Cause

### Bug A — Incorrect Success Gate in Callers

The `anySuccess` expression `result.facebook.success || result.instagram.success` is semantically wrong for the "mark as seen" decision. Marking an article as seen should require that ALL targeted platforms succeeded, not just any one. The current logic was likely written assuming both platforms always succeed or fail together.

Affected callers:
- `src/app/api/automate/route.ts` — `postOneArticle()` uses `anySuccess` to gate `markSeen`, `incrementDailyCount`, and `setLastCategory`
- `src/app/api/post-from-url/route.ts` — uses `anySuccess` to gate `logPost` and the response `success` field

### Bug B — Flat Sleep Instead of Status Polling in Worker

The Next.js publisher (`src/lib/publisher.ts`) correctly implements `waitForIGContainer()` which polls `/{containerId}?fields=status_code` up to 24 times with 5-second intervals. The Cloudflare worker's `postToInstagram()` was written independently and uses a naive `sleep(3000)` instead. Instagram containers for images typically take 5–20 seconds to reach `FINISHED`; 3 seconds is almost always too short.

### Secondary Issue — Timeout Behavior in `waitForIGContainer`

After 24 polling attempts (120 seconds total), `waitForIGContainer` logs a warning and falls through, attempting to publish anyway. This should throw an explicit timeout error instead of silently proceeding.

## Correctness Properties

Property 1: Bug Condition — Partial Failure Is Not Overall Success

_For any_ `publishResult` where `isBugCondition` holds (Instagram failed with a real error, Facebook succeeded), the fixed callers SHALL treat the result as a partial failure: the article SHALL NOT be marked as seen, the daily count SHALL NOT be incremented, and the response/log SHALL reflect `instagram.success: false`.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Happy Path and Single-Platform Behavior Unchanged

_For any_ `publishResult` where `isBugCondition` does NOT hold (both succeed, or only one platform targeted and it succeeded, or both failed), the fixed callers SHALL produce exactly the same behavior as the original callers — marking seen on full success, not marking seen on full failure, single-platform results unchanged.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

Property 3: Bug Condition B — Container Polling Before Publish

_For any_ Instagram post attempt in `cloudflare/worker.js`, the fixed `postToInstagram` SHALL poll the container status until `FINISHED` (or error/timeout) before calling `media_publish`, consistent with the Next.js publisher behavior.

**Validates: Requirements 2.4**

## Fix Implementation

### Changes Required

**File 1: `src/app/api/automate/route.ts`**

**Function**: `postOneArticle()`

**Specific Changes**:
1. Replace `anySuccess` gate for `markSeen`/`incrementDailyCount`/`setLastCategory` with `bothTargetedSucceeded` — only mark seen when all targeted platforms succeeded
2. Define "targeted" as: `ig` was passed AND `result.instagram.success`, `fb` was passed AND `result.facebook.success`
3. Keep returning `{ success: true }` only when all targeted platforms succeeded

```
// Before
const anySuccess = result.facebook.success || result.instagram.success;
if (anySuccess) { markSeen, incrementDailyCount, setLastCategory }

// After
const igOk = result.instagram.success || result.instagram.error === "skipped";
const fbOk = result.facebook.success || result.facebook.error === "skipped";
const allSucceeded = igOk && fbOk;
if (allSucceeded) { markSeen, incrementDailyCount, setLastCategory }
```

---

**File 2: `src/app/api/post-from-url/route.ts`**

**Function**: `POST` handler

**Specific Changes**:
1. Replace `anySuccess` gate for `logPost` with `allSucceeded` using the same logic
2. Return `success: allSucceeded` in the response (not `anySuccess`)

---

**File 3: `cloudflare/worker.js`**

**Function**: `postToInstagram()`

**Specific Changes**:
1. Replace `await sleep(3000)` with a polling loop that checks `/{containerId}?fields=status_code` every 5 seconds, up to 24 attempts
2. Return `{ success: false, error: "Container timed out" }` if polling exhausts without `FINISHED`
3. Throw (and catch) on `ERROR` or `EXPIRED` container status

```
// Before
await sleep(3000);

// After
await waitForContainer(containerId, token);  // polls for FINISHED
```

---

**File 4: `src/lib/publisher.ts`** (minor)

**Function**: `waitForIGContainer()`

**Specific Changes**:
1. Replace the silent fall-through after 24 attempts with `throw new Error("IG container polling timed out after 120s")`
2. This surfaces the timeout as a real error rather than attempting a blind publish

## Testing Strategy

### Validation Approach

Two-phase: first run exploratory tests on unfixed code to confirm the bug manifests as expected, then verify the fix and preservation.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples demonstrating Bug A and Bug B on unfixed code. Confirm root cause analysis.

**Test Plan**: Write unit tests that mock `publish()` to return `{ instagram: { success: false, error: "token expired" }, facebook: { success: true } }` and assert that `markSeen` is called — this should pass on unfixed code (demonstrating the bug) and fail after the fix.

**Test Cases**:
1. **Bug A — automate path**: Mock `publish()` returning IG failure + FB success → assert `markSeen` IS called on unfixed code (counterexample)
2. **Bug A — post-from-url path**: Same mock → assert response `success: true` on unfixed code (counterexample)
3. **Bug B — worker container**: Mock IG container API to return `IN_PROGRESS` for first 3 polls → assert publish is called before `FINISHED` on unfixed code (counterexample)
4. **Timeout fall-through**: Exhaust 24 polling attempts → assert unfixed code attempts publish anyway (counterexample)

**Expected Counterexamples**:
- `markSeen` called when Instagram failed
- Response `{ success: true }` returned when Instagram failed
- `media_publish` called when container status is not `FINISHED`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed code produces the expected behavior.

**Pseudocode:**
```
FOR ALL publishResult WHERE isBugCondition(publishResult) DO
  result := postOneArticle_fixed(article)
  ASSERT markSeen NOT called
  ASSERT incrementDailyCount NOT called
  ASSERT result.success === false
END FOR

FOR ALL containerState WHERE containerState !== "FINISHED" DO
  result := postToInstagram_fixed(imageUrl, caption, env)
  ASSERT media_publish NOT called before FINISHED
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, behavior is unchanged.

**Pseudocode:**
```
FOR ALL publishResult WHERE NOT isBugCondition(publishResult) DO
  ASSERT postOneArticle_original(article) behavior = postOneArticle_fixed(article) behavior
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because the input space (combinations of IG/FB success/failure/skipped) is small but the interaction with side effects (markSeen, incrementDailyCount) makes exhaustive manual testing error-prone.

**Test Cases**:
1. **Both succeed**: `{ ig: success, fb: success }` → article marked seen, count incremented (unchanged)
2. **IG only, succeeds**: `{ ig: success, fb: skipped }` → article marked seen (unchanged)
3. **FB only, succeeds**: `{ ig: skipped, fb: success }` → article marked seen (unchanged)
4. **Both fail**: `{ ig: fail, fb: fail }` → article NOT marked seen (unchanged)

### Unit Tests

- `postOneArticle` with IG fail + FB success → `markSeen` not called, returns `{ success: false }`
- `postOneArticle` with both succeed → `markSeen` called, returns `{ success: true }`
- `postOneArticle` with both fail → `markSeen` not called, returns `{ success: false }`
- `waitForIGContainer` timeout → throws error (not silent fall-through)
- Worker `postToInstagram` with container polling → `media_publish` only called after `FINISHED`

### Property-Based Tests

- Generate random combinations of `{ ig: success|fail|skipped, fb: success|fail|skipped }` and verify `markSeen` is called iff all targeted platforms succeeded
- Generate random container poll sequences (varying number of `IN_PROGRESS` responses before `FINISHED`) and verify publish is never called before `FINISHED`

### Integration Tests

- Full automate pipeline with mocked IG token failure → verify article remains unseen and can be retried
- Full post-from-url with mocked IG failure → verify response correctly reports partial failure
- Worker pipeline with slow container (multiple `IN_PROGRESS` polls) → verify eventual success after `FINISHED`
