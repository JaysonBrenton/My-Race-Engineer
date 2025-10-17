<!--
Filename: docs/guides/liverc-live-smoke-test.md
Author: Jayson Brenton
Date: 2025-10-17
Purpose: Explain how to run the LiveRC live smoke test, interpret results, and troubleshoot.
License: MIT License
-->

# LiveRC Live Smoke Test Guide

This document explains how to opt in to the LiveRC live smoke test, what to expect when running it, and how to troubleshoot common issues. The smoke test is intentionally isolated and does **not** run in CI by default.

## When to run this test

Run this smoke test when you need to verify that `https://www.liverc.com/` is reachable from your environment or when debugging integration issues that might be caused by upstream availability. The test only performs a single GET request and has a 10-second network timeout.

## Prerequisites

1. **Dependencies installed:**
   ```bash
   npm ci
   ```
2. **Node.js 18 or 20:** Matches the engines specified in `package.json`.
3. **Internet access:** The test reaches out to `https://www.liverc.com/` unless you override the URL.

## Commands

### Skip-by-default execution (no env flag)

```bash
npx tsx --test tests/connectors/liverc/live-smoke.test.ts
```

Expected output:
- Test is reported as **skipped**, because `LIVERC_E2E` defaults to unset.
- Exit code is `0` (success), keeping CI deterministic.

### Opt-in execution

```bash
npm run test:e2e:liverc
```

This script expands to:

```bash
LIVERC_E2E=1 tsx --test tests/connectors/liverc/live-smoke.test.ts
```

Expected output when the LiveRC homepage is healthy:
- One test runs and passes.
- Diagnostics line similar to `Fetched https://www.liverc.com/ -> 200 text/html; charset=utf-8`.
- Exit code `0`.

### Override the target URL

Provide `LIVERC_SMOKE_URL` if you need to hit a different domain (for example, a staging mirror):

```bash
LIVERC_E2E=1 LIVERC_SMOKE_URL="https://staging.example.com/" tsx --test tests/connectors/liverc/live-smoke.test.ts
```

## Rerun safety

- The test only performs a single HTTP GET without mutating server state.
- It is safe to rerun multiple times; no caching or throttling headers are added beyond a descriptive User-Agent.

## Troubleshooting

| Symptom | Likely cause | Suggested action |
| --- | --- | --- |
| Test remains skipped | `LIVERC_E2E` not set to `1` | Run `LIVERC_E2E=1` in the same command or export it before invoking the test. |
| `TypeError: fetch is not a function` | Running on unsupported Node.js version | Use Node.js 18+ where `fetch` is globally available, or upgrade your runtime. |
| `AbortError` thrown | Network request exceeded the 10-second timeout | Check internet connectivity, VPN/firewall restrictions, or rerun to rule out transient outages. |
| Non-200 status or missing `text/html` | LiveRC may be degraded or returning unexpected content | Verify the URL is correct, and inspect the diagnostics or fetch the URL manually with `curl` for additional context. |

## Safe cleanup

No cleanup is required. The test does not create files or change application state. Simply close your terminal session when finished.
