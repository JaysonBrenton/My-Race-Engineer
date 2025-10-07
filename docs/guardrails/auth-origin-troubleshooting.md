# Auth form origin guard failures

When every login or registration attempt immediately redirects back with the banner “Your session expired. Refresh the page and try again.”, the failure is not caused by the session layer. Instead, the post request is being rejected before it reaches the auth service because the [`guardAuthPostOrigin`](../../src/server/security/origin.ts) check determines the request originated from an unapproved host.

The guard delegates to [`getAllowedOrigins`](../../src/server/runtime.ts), which builds its allow-list from the comma-separated `ALLOWED_ORIGINS` environment variable. If that variable is missing, empty, or does not contain the exact origin (scheme + host + optional port) that the browser is using, the helper returns an empty array. Every origin validation then resolves to `mismatch`, triggering the early redirect with the generic “session expired” messaging that the forms historically displayed.

## How to fix
1. Decide which domains should be allowed to submit authentication forms.
2. Set the `ALLOWED_ORIGINS` environment variable to that comma-separated list, making sure each entry:
   - Uses the correct protocol (`http://` for local dev, `https://` for production).
   - Matches the host and port exactly (e.g., `http://localhost:3000`).
   - Omits any trailing slash (the guard normalises but will treat `https://example.com/` and `https://example.com` as distinct strings if misconfigured elsewhere).
3. Restart the application so the new configuration is loaded.

Once the active origin appears in `ALLOWED_ORIGINS`, the guard returns `ok`, the request proceeds to the CSRF token validation, and the banner disappears.
