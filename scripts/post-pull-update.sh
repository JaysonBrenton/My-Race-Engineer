#!/usr/bin/env bash
# My Race Engineer — post-pull update helper
# Runs after: git pull
# Does: optional env doctor → npm install/ci → prisma → build → systemd restart → health probes

set -Eeuo pipefail

# Resolve repo root even if invoked via symlink; work when BASH_SOURCE is unset
SCRIPT="${BASH_SOURCE[0]:-$0}"
ROOT="$(cd "$(dirname "$SCRIPT")/.." && pwd -P)"
cd "$ROOT"

# Nice symbols with ASCII fallback for non-UTF8 / non-TTY
if [[ -t 1 ]] && locale | grep -qi 'UTF-8'; then
  WARN="⚠️"; OK="✅"; ERR="✖"; ARROW="→"
else
  WARN="[WARN]"; OK="[OK]"; ERR="[ERR]"; ARROW="=>"
fi

echo "== MRE: post-pull update =="
date +"%F %T %Z"
echo

# Heads-up if the template is newer than your local .env
if [[ -f .env.example && -f .env && .env.example -nt .env ]]; then
  echo "$WARN .env.example is newer than your .env. Consider syncing missing keys."
fi

# Optional: run env doctor if present
if node -e "const pkg=require('./package.json');process.exit(pkg?.scripts?.['env:doctor']?0:1);" >/dev/null 2>&1; then
  echo "$ARROW Checking environment (npm run env:doctor)…"
  if ! npm run env:doctor --if-present; then
    echo "$ERR Environment check failed. Fix .env (see output above) and re-run."
    exit 1
  fi
fi

# Install deps: prefer npm ci when a lockfile exists, else fallback to npm install
if [[ -f package-lock.json ]]; then
  echo "$ARROW Installing deps (npm ci)…"
  npm ci
else
  echo "$WARN No package-lock.json found; falling back to npm install"
  npm install
fi

# Prisma (only if schema exists)
if [[ -f prisma/schema.prisma ]]; then
  echo "$ARROW Prisma generate…"
  npx prisma generate
  echo "$ARROW Prisma migrate deploy…"
  npx prisma migrate deploy
fi

echo "$ARROW Running lint checks…"
if ! npm run lint; then
  echo "$ERR Lint checks failed. Fix issues and re-run this script."
  exit 1
fi

echo "$ARROW Building Next.js (production)…"
npm run build

# Restart systemd user service if available
if command -v systemctl >/dev/null 2>&1; then
  echo "$ARROW Restarting systemd user service (mre)…"
  systemctl --user restart mre
  sleep 0.5
  systemctl --user status mre --no-pager -l | sed -n '1,18p' || true
fi

# Probe health based on APP_URL in .env (fallback to localhost)
APP_URL_ENV=""
if [[ -f .env ]]; then
  # Parse APP_URL= value while handling whitespace, comments, and optional quotes
  APP_URL_ENV="$(python3 <<'PY'
import re

value = ""
try:
    with open('.env', 'r', encoding='utf-8') as env_file:
        for line in env_file:
            stripped = line.strip()
            if not stripped or stripped.startswith('#'):
                continue
            if stripped.startswith('export '):
                stripped = stripped[len('export '):].lstrip()
            if '=' not in stripped:
                continue
            key, raw_val = stripped.split('=', 1)
            if key.strip() != 'APP_URL':
                continue
            val = raw_val.strip()
            # Remove inline comments (supports APP_URL=foo # comment)
            val = re.split(r'\s+#', val, maxsplit=1)[0].rstrip()
            if val and val[0] == val[-1] and val[0] in ('"', "'"):
                val = val[1:-1]
            value = val
    print(value, end='')
except FileNotFoundError:
    pass
PY
)"
fi
BASE_URL="${APP_URL_ENV:-http://127.0.0.1:3001}"
HEALTH_URL="${BASE_URL%/}/api/health"
READY_URL="${BASE_URL%/}/api/ready"

echo "$ARROW Probing health endpoints at ${BASE_URL}…"
if curl -fsS "$HEALTH_URL" >/dev/null; then
  echo "   $OK /api/health OK"
else
  echo "   $ERR /api/health FAILED"
  exit 1
fi
if curl -fsS "$READY_URL" >/dev/null; then
  echo "   $OK /api/ready  OK"
else
  echo "   $ERR /api/ready  FAILED"
  exit 1
fi

echo
echo "$OK Done."

