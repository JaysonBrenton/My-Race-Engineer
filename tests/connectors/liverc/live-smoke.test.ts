/**
 * File: tests/connectors/liverc/live-smoke.test.ts
 * Author: Jayson Brenton
 * Created: 2025-10-17
 * Purpose: Opt-in live-URL smoke test for LiveRC, gated by LIVERC_E2E=1 to keep CI deterministic.
 * Notes: No new deps; uses Node's built-in test runner and global fetch.
 * License: MIT License
 */

/// <reference lib="dom" />

import assert from "node:assert/strict";
import test from "node:test";

/**
 * LIVERC_E2E opt-in instructions:
 *   - macOS/Linux shells: `LIVERC_E2E=1 npm test -- tests/connectors/liverc/live-smoke.test.ts`
 *   - Windows PowerShell: `$env:LIVERC_E2E = "1"; npm test -- tests/connectors/liverc/live-smoke.test.ts`
 *   - Windows cmd.exe: `set LIVERC_E2E=1 && npm test -- tests/connectors/liverc/live-smoke.test.ts`
 * Any other value (or unset) will skip the test. CI leaves it unset to avoid live calls by default.
 */
const isE2E = process.env.LIVERC_E2E === "1";
const url = process.env.LIVERC_SMOKE_URL ?? "https://www.liverc.com/";

// Helper to run or skip based on env flag
const run = isE2E ? test : (test.skip as typeof test);

run("LiveRC homepage responds with HTML (opt-in via LIVERC_E2E=1)", { timeout: 15_000 }, async (t) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        // A friendly UA can reduce the chance of bot challenges from some CDNs
        "User-Agent": "MRE-smoke/1.0 (+https://github.com/JaysonBrenton/My-Race-Engineer)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    // Basic availability assertions
    assert.ok(res.ok, `Expected OK response, got ${res.status}`);
    assert.equal(res.status, 200, `Expected HTTP 200, got ${res.status}`);

    const ct = res.headers.get("content-type") || "";
    assert.ok(ct.includes("text/html"), `Expected text/html content-type, got '${ct}'`);

    // Optional lightweight sanity check on body (bounded size to avoid huge reads)
    const text = await res.text();
    assert.ok(text.toLowerCase().includes("<html"), "Response body did not look like HTML");

    t.diagnostic(`Fetched ${url} -> ${res.status} ${ct}`);
  } finally {
    clearTimeout(timeout);
  }
});
