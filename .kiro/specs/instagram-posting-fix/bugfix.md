# Bugfix Requirements Document

## Introduction

When the automated posting pipeline runs, posts are successfully published to Facebook but not to Instagram. The system reports overall success (because Facebook succeeded), silently swallowing the Instagram failure. This means Instagram is consistently skipped without any visible error surfacing to operators, and the article is marked as "seen" so it will never be retried.

The bug affects all posting paths that go through `publish()` in `src/lib/publisher.ts`, including the automated cron pipeline (`/api/automate`), manual post-from-url (`/api/post-from-url`), and retry-post (`/api/retry-post`).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a post is submitted to both Instagram and Facebook AND the Instagram publish step fails (e.g. expired token, API error, container not ready) THEN the system marks the overall operation as successful because `facebook.success` is `true`

1.2 WHEN `publishToInstagram` returns `{ success: false }` AND `publishToFacebook` returns `{ success: true }` THEN the system logs the post as fully successful, increments the daily count, and marks the article as seen — with no indication that Instagram was skipped

1.3 WHEN the Instagram container status polling in `waitForIGContainer` times out after 24 attempts THEN the system attempts to publish anyway and may silently fail without surfacing the error to the caller

1.4 WHEN the Cloudflare Worker pipeline (`runPipeline`) posts to Instagram THEN it waits only a flat 3-second sleep before publishing the container, with no status polling, causing publish failures when the container is not yet ready

### Expected Behavior (Correct)

2.1 WHEN a post is submitted to both Instagram and Facebook AND Instagram fails THEN the system SHALL treat the result as a partial failure and surface the Instagram error distinctly in the response and logs

2.2 WHEN `publishToInstagram` returns `{ success: false }` AND `publishToFacebook` returns `{ success: true }` THEN the system SHALL log the post with `instagram.success: false` and SHALL NOT count the post as fully successful for reporting purposes

2.3 WHEN the Instagram container status polling times out THEN the system SHALL return a clear timeout error rather than attempting a blind publish

2.4 WHEN the Cloudflare Worker pipeline posts to Instagram THEN it SHALL poll the container status (checking for `FINISHED`) before attempting to publish, consistent with the Next.js publisher behavior

### Unchanged Behavior (Regression Prevention)

3.1 WHEN both Instagram and Facebook succeed THEN the system SHALL CONTINUE TO log the post as fully successful and mark the article as seen

3.2 WHEN only Instagram is targeted (Facebook skipped) AND Instagram succeeds THEN the system SHALL CONTINUE TO treat the result as successful

3.3 WHEN only Facebook is targeted (Instagram skipped) AND Facebook succeeds THEN the system SHALL CONTINUE TO treat the result as successful

3.4 WHEN a post fails on both platforms THEN the system SHALL CONTINUE TO return a failure result and not mark the article as seen

3.5 WHEN the retry-post endpoint targets a single platform THEN the system SHALL CONTINUE TO only post to that platform and return its result
