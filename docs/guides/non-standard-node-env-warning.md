# Resolving the Next.js non-standard `NODE_ENV` warning

## Summary
When you boot the Next.js dev server, you may see the following warning:

> ⚠ You are using a non-standard "NODE_ENV" value in your environment. This creates inconsistencies in the project and is strongly advised against.

Next.js only recognises three `NODE_ENV` values: `development`, `production`, and `test`. Any other value makes the framework fall back to its production assumptions while you think you are in a different mode. That mismatch can lead to confusing build behaviour, caching bugs, and incorrect feature flags inside `middleware.ts`, `instrumentation.ts`, or tooling that checks `process.env.NODE_ENV`.

## Recommended fix
1. Inspect your dev VM configuration (`/etc/environment`, shell profile, container runtime, or Procfile) and remove the custom `NODE_ENV` value. For local development it must be set to `development`.
2. If you need environment-specific feature flags, define your own variable (for example `APP_ENV=staging`) rather than overloading `NODE_ENV`.
3. After updating the configuration, restart the shell/session so the corrected `NODE_ENV` propagates, then re-run `npm run dev`.

## Verification
Run `node -p "process.env.NODE_ENV"` inside the dev VM. It should output `development`. If it does, the warning will no longer appear on subsequent Next.js runs.
