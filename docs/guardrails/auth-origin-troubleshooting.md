# Auth form origin guard failures

When every login or registration attempt immediately redirects back with an error banner (for example, “Your request came from an unapproved origin. Check that APP_URL or ALLOWED_ORIGINS includes this host and try again.”) and the form fields are cleared, the failure is not caused by the session layer. Instead, the post request is being rejected before it reaches the auth service because the [`guardAuthPostOrigin`](../../src/core/security/origin.ts) check determines the request originated from an unapproved host.

This behaviour also explains why no entries appear in the auth log files: the middleware short-circuits the request before the register/login server actions execute, so the auth logger never receives the event.

The guard delegates to [`parseAllowedOrigins`](../../src/core/security/origin.ts), which prioritises the comma-separated `ALLOWED_ORIGINS` environment variable. When that variable is unset or empty the helper now falls back to the origin derived from `APP_URL` and, when `DEV_TRUST_LOCAL_ORIGINS=true`, appends trusted localhost entries for development. If neither source matches the exact origin (scheme + host + optional port) that the browser is using, the guard resolves to `mismatch`, triggering the early redirect with the generic “session expired” messaging that the forms historically displayed.

## How to fix
1. Confirm which domains should be allowed to submit authentication forms.
2. Either ensure `APP_URL` matches the browser origin exactly (for single-origin deployments) **or** set the `ALLOWED_ORIGINS` environment variable to the comma-separated list of permitted origins. Each entry must:
   - Uses the correct protocol (`http://` for local dev, `https://` for production).
   - Matches the host and port exactly (e.g., `http://localhost:3001`).
   - Omits any trailing slash (the guard normalises but will treat `https://example.com/` and `https://example.com` as distinct strings if misconfigured elsewhere).
3. Restart the application so the new configuration is loaded. After a successful registration you should be redirected either to `/dashboard` (when a session is issued immediately) or back to `/auth/login` with a status query string (for email verification or manual approval flows).

Once the active origin appears in `ALLOWED_ORIGINS`, the guard returns `ok`, the request proceeds to the CSRF token validation, and the banner disappears.
