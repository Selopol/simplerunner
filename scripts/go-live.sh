#!/usr/bin/env bash
# The CA switch. One command, retries built in: nothing to check by hand between the CA and live.
#   scripts/go-live.sh set <mint>    show the CA on the site
#   scripts/go-live.sh off           hide it again
#   scripts/go-live.sh status        print /api/config
# Env: SITE (default the production domain), KEY_FILE (default ~/.simplerunner/admin, chmod 600, holds ADMIN_KEY).
set -euo pipefail
SITE="${SITE:-https://simplerunner-production.up.railway.app}"
KEY_FILE="${KEY_FILE:-$HOME/.simplerunner/admin}"
cmd="${1:-status}"
case "$cmd" in
  status) curl -sS -m 15 "$SITE/api/config"; echo ;;
  set|off)
    [ -r "$KEY_FILE" ] || { echo "no admin key at $KEY_FILE" >&2; exit 1; }
    mint=""; [ "$cmd" = set ] && mint="${2:?usage: go-live.sh set <mint>}"
    for attempt in 1 2 3 4 5 6 7 8; do
      if out=$(curl -sS -m 20 --fail-with-body -X POST "$SITE/api/admin/config" \
            -H "x-admin-key: $(cat "$KEY_FILE")" -H 'content-type: application/json' --data "{\"mint\":\"$mint\"}"); then
        printf '%s  live at %s\n' "$out" "$(date -u +%H:%M:%SZ)"; exit 0
      fi
      echo "attempt $attempt failed: ${out:-no response}" >&2; sleep 3
    done
    exit 1 ;;
  *) echo "usage: go-live.sh set <mint> | off | status" >&2; exit 2 ;;
esac
