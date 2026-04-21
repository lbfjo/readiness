#!/usr/bin/env bash
# Morning readiness job invoked by launchd (or manually).
#
# What it does:
#   1. Loads secrets + DATABASE_URL from readiness/.env
#   2. Runs `cli.py morning` which syncs Coros/Strava/Intervals,
#      computes the score, and mirrors everything to Postgres.
#   3. Runs `cli.py insight` which generates the AI narrative via the
#      Codex CLI and caches it in Postgres.
#
# Logs are appended to readiness/data/morning.log. launchd captures stderr
# separately via the plist's StandardErrorPath for easier inspection.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
ENV_FILE="$ROOT/.env"
LOG_FILE="$ROOT/data/morning.log"
PYTHON_BIN="${READINESS_PYTHON:-/opt/homebrew/bin/python3.13}"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG_FILE"
}

if [[ ! -f "$ENV_FILE" ]]; then
  log "ERROR: $ENV_FILE not found"
  exit 1
fi

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

# See poll_job.sh — codex / custom tools via READINESS_EXTRA_PATH in readiness/.env
export PATH="${READINESS_EXTRA_PATH:+$READINESS_EXTRA_PATH:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

log "starting morning job (python=$PYTHON_BIN)"

cd "$REPO_ROOT"

{
  "$PYTHON_BIN" readiness/cli.py morning "$@"
  "$PYTHON_BIN" readiness/cli.py insight
} >> "$LOG_FILE" 2>&1

log "morning job complete"
