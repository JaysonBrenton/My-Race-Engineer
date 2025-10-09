# Dev VM update & restart playbook

This playbook covers the steps to pull new application code (for example, changes to authentication flows), apply any pending Prisma migrations, rebuild the Next.js app, and restart the **My Race Engineer** service on the development VM (`10.211.55.13`).

## 1. Pull the latest code
```
git pull --ff-only
```
Using `--ff-only` keeps the branch history linear and fails fast if you forgot to push local commits.

Immediately check whether any new environment keys are required:
```
npm run env:doctor
```
`env:doctor` will warn (not fail) when it applies safe defaults (for example, `MAILER_DRIVER=console` or `NEXT_PUBLIC_APP_ORIGIN` matching `APP_URL`). Optional feature keys stay optional until their feature is enabled.

If it reports missing keys, append them safely and then populate real values:
```
npm run env:sync
```
Add `-- --all` when you want every placeholder from `.env.example` instead of only the always-required and feature-enabled keys.
> Pulling code does **not** update your local `.env`. `env:sync` only adds new keys and never overwrites existing values—open `.env` afterwards to provide the real secrets.

## 2. Refresh Node dependencies
```
npm ci
```
- `npm ci` guarantees a clean install that matches `package-lock.json`.
- If you need devDependencies on the VM for tooling, keep them by omitting `--omit=dev`. Otherwise add `--omit=dev` for a lean runtime footprint.

## 3. Regenerate Prisma client
```
npx prisma generate
```
This regenerates the Prisma client in case the schema changed.

## 4. Apply database migrations (if any)
```
npx prisma migrate deploy
```
- The command is **idempotent**—it does nothing when there are no new migrations.
- To preview status without applying, run `npx prisma migrate status`.

If `migrate deploy` reports an error, stop and resolve it before continuing. The service should **not** be restarted on an incomplete schema.

## 5. Build the production bundle
```
npm run build
```
This compiles the Next.js production build used by the systemd service.

## 6. Restart the systemd user service
```
systemctl --user restart mre
systemctl --user status mre
```
- `restart` picks up the new build.
- `status` confirms that the service is healthy (look for `Active: active (running)`).

## 7. (Optional) Tail logs for verification
```
journalctl --user -fu mre
```
Use this to watch the service logs in real time after a restart.

## Quick reference
The minimal update sequence you listed is correct and maps to Steps 2–6 above:
```
npm install            # Prefer `npm ci` for reproducibility
npx prisma generate
npx prisma migrate deploy
npm run build
systemctl --user restart mre
systemctl --user status mre
```
Switching `npm install` to `npm ci` is the only recommended change for deterministic installs.


## Troubleshooting

### Next.js build error: “A 'use server' file can only export async functions”
This usually means a `route.ts` file includes a `'use server'` directive alongside constant or object exports. Remove `'use server'` from route handlers and keep only async handlers plus static route config exports.
