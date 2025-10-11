# Review — scripts/post-pull-update.sh

## Summary
During review of `scripts/post-pull-update.sh`, two issues were identified that will cause the helper script to misbehave.

## Findings
1. **`env:doctor` detection is broken** — the script runs `npm run -s | grep -qE '^\s*env:doctor\b'` to determine whether the `env:doctor` task exists. With `-s` (silent) enabled, `npm run` prints nothing, so the `grep` never sees the script list even when `env:doctor` exists. As a result, `env:doctor` will never be executed. Using `npm run env:doctor --if-present --silent` would avoid the extra listing step while keeping the command optional.  
2. **`.env` parsing fails** — the sed expression `sed -E 's/^[[:space:]]*APP_URL=//; s/^["'\'']?([^"'\'']*)["'\'']?$/\1/'` is wrapped in single quotes while also containing single quotes, so the shell breaks the expression into two separate commands. The substitution therefore never runs, leaving `APP_URL_ENV` equal to the literal line (e.g. `APP_URL=https://...`). The subsequent health checks then request URLs such as `APP_URL=https://.../api/health`, which always fail. Switching to double quotes or escaping the single quotes (e.g. `sed -E "s/.../"`) fixes the issue.

Both issues should be addressed before landing the helper script.
