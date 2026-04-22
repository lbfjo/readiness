#!/usr/bin/env bash
# Daily readiness entrypoint for manual use.
#
# Default behavior:
#   1. Load readiness/.env
#   2. Run the full morning pipeline (sync + score + report + insight)
#   3. Print the latest local summary
#   4. Start the web app locally if it is not already running

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
ENV_FILE="$ROOT/.env"
DATA_DIR="$ROOT/data"
LOG_FILE="$DATA_DIR/day-start.log"
WEB_LOG_FILE="$DATA_DIR/web-dev.log"
WEB_PID_FILE="$DATA_DIR/web-dev.pid"

RUN_REFRESH=1
START_WEB=1
WEEKS=4
WEB_PORT="${READINESS_WEB_PORT:-3000}"

mkdir -p "$DATA_DIR"

usage() {
  cat <<EOF
Usage: readiness/scripts/day_start.sh [options]

Default behavior runs the morning pipeline and starts the local web app.

Options:
  --refresh-only   Run sync/score/report/insight, but do not start the web app
  --no-refresh     Start the web app only
  --no-web         Run the refresh pipeline only
  --weeks N        Number of weeks to sync (default: 4)
  --port N         Local web-app port (default: 3000 or READINESS_WEB_PORT)
  -h, --help       Show this help text
EOF
}

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG_FILE"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --refresh-only)
      RUN_REFRESH=1
      START_WEB=0
      shift
      ;;
    --no-refresh)
      RUN_REFRESH=0
      START_WEB=1
      shift
      ;;
    --no-web)
      START_WEB=0
      shift
      ;;
    --weeks)
      WEEKS="${2:?missing value for --weeks}"
      shift 2
      ;;
    --port)
      WEB_PORT="${2:?missing value for --port}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  log "ERROR: $ENV_FILE not found"
  exit 1
fi

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

export PATH="${READINESS_EXTRA_PATH:+$READINESS_EXTRA_PATH:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

resolve_python() {
  if [[ -n "${READINESS_PYTHON:-}" ]]; then
    printf '%s\n' "$READINESS_PYTHON"
    return
  fi
  if [[ -x "$REPO_ROOT/coros-mcp/.venv/bin/python" ]]; then
    printf '%s\n' "$REPO_ROOT/coros-mcp/.venv/bin/python"
    return
  fi
  if [[ -x /opt/homebrew/bin/python3.13 ]]; then
    printf '%s\n' /opt/homebrew/bin/python3.13
    return
  fi
  command -v python3
}

PYTHON_BIN="$(resolve_python)"
MORNING_SCRIPT="$ROOT/scripts/morning_job.sh"
WEB_DIR="$REPO_ROOT/readiness-web"
TODAY_DATE="$("$PYTHON_BIN" - <<'PY'
from datetime import date
print(date.today().strftime("%Y%m%d"))
PY
)"

ensure_web_dir() {
  if [[ ! -d "$WEB_DIR" ]]; then
    log "ERROR: $WEB_DIR not found"
    exit 1
  fi
}

port_is_listening() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

cleanup_stale_web_pid() {
  if [[ -f "$WEB_PID_FILE" ]]; then
    local pid
    pid="$(cat "$WEB_PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && ! kill -0 "$pid" >/dev/null 2>&1; then
      rm -f "$WEB_PID_FILE"
    fi
  fi
}

start_web() {
  ensure_web_dir
  cleanup_stale_web_pid

  if port_is_listening "$WEB_PORT"; then
    log "web app already listening on http://localhost:$WEB_PORT/today"
    return
  fi

  log "starting web app on http://localhost:$WEB_PORT/today"
  (
    cd "$WEB_DIR"
    nohup npm run dev -- --port "$WEB_PORT" >> "$WEB_LOG_FILE" 2>&1 &
    echo $! > "$WEB_PID_FILE"
  )

  sleep 2
  if port_is_listening "$WEB_PORT"; then
    log "web app started (pid $(cat "$WEB_PID_FILE"))"
  else
    log "web app launch requested; check $WEB_LOG_FILE if it does not come up"
  fi
}

show_summary() {
  log "today summary"
  (
    cd "$REPO_ROOT"
    "$PYTHON_BIN" readiness/cli.py today
    "$PYTHON_BIN" readiness/cli.py planned-today --date "$TODAY_DATE"
  ) | tee -a "$LOG_FILE"
}

log "starting day-start (python=$PYTHON_BIN, weeks=$WEEKS, web_port=$WEB_PORT)"

if [[ "$RUN_REFRESH" -eq 1 ]]; then
  log "running morning pipeline"
  (
    cd "$REPO_ROOT"
    "$MORNING_SCRIPT" --weeks "$WEEKS"
  )
fi

show_summary

if [[ "$START_WEB" -eq 1 ]]; then
  start_web
fi

log "day-start complete"
