#!/usr/bin/env bash
# Poll the Postgres job_queue once and run any pending job. Invoked by
# launchd every 60s (see com.readiness.poller.plist) and safe to run
# manually for debugging.
#
# The command drains every currently-pending job then exits. If the queue
# is empty, the script prints a single status line and returns.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
ENV_FILE="$ROOT/.env"
LOG_FILE="$ROOT/data/poller.log"
PYTHON_BIN="${READINESS_PYTHON:-/opt/homebrew/bin/python3.13}"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG_FILE"
}

if [[ ! -f "$ENV_FILE" ]]; then
  log "ERROR: $ENV_FILE not found"
  exit 1
fi

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

# launchd has a minimal PATH. Prefer Homebrew + system dirs; prepend READINESS_EXTRA_PATH
# from readiness/.env (e.g. directory containing `codex` or a specific Node bin dir).
export PATH="${READINESS_EXTRA_PATH:+$READINESS_EXTRA_PATH:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

cd "$REPO_ROOT"

"$PYTHON_BIN" readiness/cli.py poll --once >> "$LOG_FILE" 2>&1
