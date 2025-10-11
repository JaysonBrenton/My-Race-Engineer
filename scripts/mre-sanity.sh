#!/usr/bin/env bash
# RC Race Engineer — Sanity Checker
# Author: Jayson + The Brainy One
# Created: 2025-09-16
# Purpose: Verify required packages/services are installed, configured, and running.
# License: MIT

set -u

pass(){ printf "PASS  %s\n" "$1"; }
warn(){ printf "WARN  %s\n" "$1"; }
fail(){ printf "FAIL  %s\n" "$1"; FAILED=1; }

FAILED=0

# 1) Node + npm
if command -v node >/dev/null 2>&1; then
  pass "node present ($(node -v))"
else
  fail "node missing"
fi
if command -v npm >/dev/null 2>&1; then
  pass "npm present ($(npm -v))"
else
  fail "npm missing"
fi

# 2) Next.js app service
if systemctl is-active --quiet rcraceengineer; then
  pass "systemd: rcraceengineer is active"
else
  fail "systemd: rcraceengineer not active"
fi

#   2a) Service points to a real Next.js project
WD="$(systemctl cat rcraceengineer 2>/dev/null | sed -n 's/^WorkingDirectory=//p' | head -n1)"
if [ -n "${WD:-}" ] && [ -f "$WD/package.json" ] && grep -q '"next"' "$WD/package.json"; then
  pass "WorkingDirectory is a Next.js repo ($WD)"
else
  fail "WorkingDirectory invalid or not Next.js ($WD)"
fi

#   2b) Env file exists
ENVF="/etc/rcraceengineer/app.env"
if [ -e "$ENVF" ]; then
  pass "Env file present ($ENVF)"
else
  fail "Env file missing or unreadable ($ENVF)"
fi

# 3) Listening port
PORT="3000"
if [ -e "$ENVF" ]; then
  PLINE="$(grep -E '^PORT=' "$ENVF" 2>/dev/null | head -n1 || true)"
  [ -n "$PLINE" ] && PORT="${PLINE#PORT=}"
fi
if ss -ltnp 2>/dev/null | grep -qE ":${PORT}\b"; then
  pass "Port ${PORT} is listening"
else
  fail "Port ${PORT} is not listening"
fi

# 4) HTTP check (local)
if command -v curl >/dev/null 2>&1; then
  CODE="$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}" || true)"
  case "$CODE" in
    2*|3*) pass "HTTP on 127.0.0.1:${PORT} returns ${CODE}" ;;
    *)     fail "HTTP on 127.0.0.1:${PORT} returned ${CODE:-no response}" ;;
  esac
else
  warn "curl not installed; skipping HTTP check"
fi

# 5) Firewalld check (active zone(s) or default zone)
if systemctl is-active --quiet firewalld; then
  ZONES="$(sudo firewall-cmd --get-active-zones 2>/dev/null | awk 'NR%2==1{print $1}')"
  [ -z "$ZONES" ] && ZONES="$(sudo firewall-cmd --get-default-zone 2>/dev/null)"
  OPEN=0
  FOUND_ZONE=""
  for Z in $ZONES; do
    if sudo firewall-cmd --zone="$Z" --query-port=${PORT}/tcp >/dev/null 2>&1; then
      OPEN=1; FOUND_ZONE="$Z"; break
    fi
  done
  if [ "$OPEN" -eq 1 ]; then
    pass "firewalld running and port ${PORT}/tcp allowed (zone: ${FOUND_ZONE})"
  else
    warn "firewalld running but port ${PORT}/tcp not open in active/default zones"
  fi
else
  warn "firewalld not running"
fi

# 6) SELinux
if command -v getenforce >/dev/null 2>&1; then
  pass "SELinux: $(getenforce)"
fi

# 7) cloudflared service + config + connectivity evidence
if systemctl is-active --quiet cloudflared; then
  pass "systemd: cloudflared is active"
else
  fail "systemd: cloudflared not active"
fi
CFCONF="/etc/cloudflared/config.yml"
if [ -r "$CFCONF" ]; then
  if grep -q "app.rcraceengineer.dev" "$CFCONF" && grep -q "admin.rcraceengineer.dev" "$CFCONF"; then
    pass "cloudflared config has expected hostnames"
  else
    warn "cloudflared config missing expected hostnames"
  fi
else
  fail "cloudflared config missing or unreadable ($CFCONF)"
fi
LOG_OK=0
journalctl -u cloudflared --since "-120 min" 2>/dev/null | grep -Eq "Registered tunnel connection|Connected to Cloudflare|protocol=quic" && LOG_OK=1
METRICS_OK=0
if ss -ltnp 2>/dev/null | grep -q "127.0.0.1:20241"; then
  curl -sS --max-time 2 127.0.0.1:20241/metrics >/dev/null 2>&1 && METRICS_OK=1
fi
if [ "$LOG_OK" -eq 1 ]; then
  pass "cloudflared recent connectivity evidence (logs)"
elif [ "$METRICS_OK" -eq 1 ]; then
  pass "cloudflared metrics endpoint reachable"
else
  warn "no recent tunnel connectivity evidence"
fi

echo
if [ "$FAILED" = "0" ]; then
  echo "Sanity: OK"
  exit 0
else
  echo "Sanity: ISSUES FOUND"
  exit 1
fi
