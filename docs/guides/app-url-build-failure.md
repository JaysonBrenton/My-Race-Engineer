# APP_URL build failure troubleshooting

## Summary
When `npm run build` (or `next build`) runs in production mode, it loads `src/lib/seo.ts` to compute the canonical site origin. Prior to the fix in October 2025, the helper threw an error if the `APP_URL` environment variable was not defined. That guard was meant to enforce correct SEO metadata, but it also caused builds on developer machines and ephemeral CI agents—where the variable is frequently unset—to crash before any pages compiled.

## Root cause
- `src/lib/seo.ts` cached the canonical origin by calling `new URL(process.env.APP_URL)` inside `computeAppUrl()`.
- If `APP_URL` was empty and `NODE_ENV === 'production'`, the helper threw: `APP_URL environment variable must be defined to generate absolute URLs.`
- The Next.js build pipeline loads this module at compile time. Because the VM did not define `APP_URL`, the exception bubbled up and stopped the entire build.

## Resolution
The helper now derives the origin in three steps and only warns when it must fall back:
1. Use `APP_URL` when it is set.
2. Otherwise, attempt `NEXT_PUBLIC_APP_URL` (commonly defined for client-side routing).
3. As a last resort, synthesize `http://localhost:<PORT-or-3001>` and emit a console warning in production builds so teams know to configure the real origin.

Additional regression coverage was added in `tests/seo.test.ts` to exercise each fallback path and to ensure the sitemap/robots helpers keep working across environment permutations.

## Recommended action
- For production deployments, define **both** `APP_URL` and `NEXT_PUBLIC_APP_URL` with the public site origin to avoid the warning and ensure canonical links are stable.
- For local builds, the fallback is sufficient, but you can set `APP_URL=http://localhost:3001` (or another port) to silence the warning during `npm run build` or CI smoke tests.
