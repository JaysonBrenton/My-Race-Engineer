# Auth form origin guard failures

When every login or registration attempt immediately redirects back with the banner “Your session expired. Refresh the page and try again.”, the failure is not caused by the session layer. Instead, the post request is being rejected before it reaches the auth service because the [`guardAuthPostOrigin`](../../src/core/auth/guardAuthPostOrigin.ts) check determines the request originated from an unapproved host.

The guard delegates to [`getAllowedOrigins`](../../src/core/auth/getAllowedOrigins.ts), which prioritises the comma-separated `ALLOWED_ORIGINS` environment variable. When that variable is unset or empty the helper now falls back to the origin derived from `APP_URL`, ensuring single-origin environments continue to work out of the box. If neither source matches the exact origin (scheme + host + optional port) that the browser is using, the guard resolves to `mismatch`, triggering the early redirect with the generic “session expired” messaging that the forms historically displayed.

## How to fix
1. Confirm which domains should be allowed to submit authentication forms.
2. Either ensure `APP_URL` matches the browser origin exactly (for single-origin deployments) **or** set the `ALLOWED_ORIGINS` environment variable to the comma-separated list of permitted origins. Each entry must:
   - Uses the correct protocol (`http://` for local dev, `https://` for production).
   - Matches the host and port exactly (e.g., `http://localhost:3000`).
   - Omits any trailing slash (the guard normalises but will treat `https://example.com/` and `https://example.com` as distinct strings if misconfigured elsewhere).
3. Restart the application so the new configuration is loaded.

Once the active origin appears in `ALLOWED_ORIGINS`, the guard returns `ok`, the request proceeds to the CSRF token validation, and the banner disappears.
