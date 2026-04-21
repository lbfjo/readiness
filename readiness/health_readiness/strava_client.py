from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, time as dt_time, timedelta, timezone
from pathlib import Path
from typing import Any


CONFIG_FILE = Path.home() / ".config" / "strava-mcp" / "config.json"
TOKEN_URL = "https://www.strava.com/oauth/token"
ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"


def load_config() -> dict[str, Any]:
    if not CONFIG_FILE.exists():
        raise RuntimeError("Strava is not connected. Run the Strava MCP connect flow first.")
    return json.loads(CONFIG_FILE.read_text())


def save_config(config: dict[str, Any]) -> None:
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, indent=2))


def post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def access_token() -> str:
    config = load_config()
    token = config.get("accessToken")
    expires_at = int(config.get("expiresAt") or 0)
    if token and expires_at > int(time.time()) + 60:
        return str(token)

    client_id = config.get("clientId")
    client_secret = config.get("clientSecret")
    refresh_token = config.get("refreshToken")
    if not client_id or not client_secret or not refresh_token:
        raise RuntimeError("Strava config is missing client credentials or refresh token.")

    refreshed = post_json(TOKEN_URL, {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    })
    config.update({
        "accessToken": refreshed["access_token"],
        "refreshToken": refreshed["refresh_token"],
        "expiresAt": refreshed["expires_at"],
    })
    save_config(config)
    return str(refreshed["access_token"])


def epoch_for_day(value: date, *, end: bool = False) -> int:
    at = dt_time.max if end else dt_time.min
    return int(datetime.combine(value, at, tzinfo=timezone.utc).timestamp())


def fetch_activities(weeks: int, *, per_page: int = 100) -> list[dict[str, Any]]:
    token = access_token()
    today = date.today()
    start = today - timedelta(weeks=max(1, weeks))
    activities: list[dict[str, Any]] = []
    page = 1

    while True:
        params = urllib.parse.urlencode({
            "after": epoch_for_day(start),
            "before": epoch_for_day(today, end=True),
            "page": page,
            "per_page": per_page,
        })
        request = urllib.request.Request(
            f"{ACTIVITIES_URL}?{params}",
            headers={"Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            batch = json.loads(response.read().decode("utf-8"))
        if not batch:
            break
        activities.extend(batch)
        if len(batch) < per_page:
            break
        page += 1

    return activities


def local_day(activity: dict[str, Any]) -> str | None:
    raw = activity.get("start_date_local") or activity.get("start_date")
    if not raw:
        return None
    return str(raw)[:10].replace("-", "")
