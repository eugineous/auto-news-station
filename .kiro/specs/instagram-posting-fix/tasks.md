# Instagram Posting Fix — Tasks

## Task List

- [x] 1. Fix success gate in `postOneArticle` (automate route)
  - [x] 1.1 Replace `anySuccess` with `allSucceeded` — only mark seen / increment count when all targeted platforms succeeded
  - [x] 1.2 Verify `instagram.error === "skipped"` is treated as non-failure (platform not targeted)
  - [x] 1.3 Return `{ success: false }` with combined error string when any targeted platform failed

- [x] 2. Fix success gate in `post-from-url` route
  - [x] 2.1 Replace `anySuccess` gate for `logPost` with `allSucceeded` using same logic as task 1
  - [x] 2.2 Return `success: allSucceeded` in the JSON response

- [x] 3. Fix `waitForIGContainer` timeout behavior in `publisher.ts`
  - [x] 3.1 Replace silent fall-through after 24 attempts with `throw new Error("IG container polling timed out after 120s")`

- [x] 4. Add container status polling to `postToInstagram` in `cloudflare/worker.js`
  - [x] 4.1 Extract a `waitForWorkerContainer(containerId, token)` helper that polls `/{containerId}?fields=status_code` every 5 seconds up to 24 attempts
  - [x] 4.2 Return `{ success: false, error: "Container timed out" }` if polling exhausts without `FINISHED`
  - [x] 4.3 Return `{ success: false, error: "Container failed: <status>" }` on `ERROR` or `EXPIRED` status
  - [x] 4.4 Replace `await sleep(3000)` in `postToInstagram` with `await waitForWorkerContainer(containerId, token)`

- [ ] 5. Write exploratory tests (run on unfixed code to confirm bug)
  - [ ] 5.1 Test: `postOneArticle` with IG fail + FB success → assert `markSeen` IS called (demonstrates Bug A)
  - [ ] 5.2 Test: worker `postToInstagram` with container returning `IN_PROGRESS` → assert `media_publish` called before `FINISHED` (demonstrates Bug B)

- [ ] 6. Write fix-checking tests (run on fixed code)
  - [ ] 6.1 Test: `postOneArticle` with IG fail + FB success → `markSeen` NOT called, returns `{ success: false }`
  - [ ] 6.2 Test: `postOneArticle` with both succeed → `markSeen` called, returns `{ success: true }`
  - [ ] 6.3 Test: `postOneArticle` with both fail → `markSeen` NOT called, returns `{ success: false }`
  - [ ] 6.4 Test: `waitForIGContainer` exhausts 24 attempts → throws timeout error
  - [ ] 6.5 Test: worker `postToInstagram` polls until `FINISHED` → `media_publish` called only after `FINISHED`
  - [ ] 6.6 Test: worker `postToInstagram` container returns `ERROR` → returns `{ success: false, error: "Container failed: ERROR" }`

- [ ] 7. Write preservation tests (verify unchanged behavior)
  - [ ] 7.1 Test: both platforms succeed → article marked seen, count incremented (unchanged)
  - [ ] 7.2 Test: IG only targeted and succeeds → article marked seen (unchanged)
  - [ ] 7.3 Test: FB only targeted and succeeds → article marked seen (unchanged)
  - [ ] 7.4 Test: both fail → article NOT marked seen (unchanged)
  - [ ] 7.5 Property test: for all combinations of `{ ig: success|fail|skipped, fb: success|fail|skipped }`, `markSeen` is called iff all targeted platforms succeeded
