from __future__ import annotations

import base64
import json
import os
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path
from typing import Any


BASE_URL = "https://intervals.icu/api/v1"
ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT / "readiness" / ".env"


def ymd(value: date) -> str:
    return value.isoformat()


def local_day(value: str | None) -> str | None:
    if not value:
        return None
    return value[:10].replace("-", "")


def load_env_file() -> None:
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def credentials() -> tuple[str, str]:
    load_env_file()
    athlete_id = os.environ.get("ATHLETE_ID") or os.environ.get("INTERVALS_ATHLETE_ID")
    api_key = os.environ.get("API_KEY") or os.environ.get("INTERVALS_API_KEY")
    if not athlete_id or not api_key:
        raise RuntimeError(
            "Intervals credentials not found. Set ATHLETE_ID and API_KEY, "
            "INTERVALS_ATHLETE_ID and INTERVALS_API_KEY, or add readiness/.env."
        )
    return athlete_id, api_key


def _request_json(path: str, params: dict[str, str] | None = None) -> Any:
    athlete_id, api_key = credentials()
    query = f"?{urllib.parse.urlencode(params)}" if params else ""
    auth = base64.b64encode(f"API_KEY:{api_key}".encode("utf-8")).decode("ascii")
    request = urllib.request.Request(
        f"{BASE_URL}/athlete/{athlete_id}/{path}{query}",
        headers={
            "Accept": "application/json",
            "Authorization": f"Basic {auth}",
            "User-Agent": "readiness-cli/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_events(start: date, end: date) -> list[dict[str, Any]]:
    body = _request_json("events", {"oldest": ymd(start), "newest": ymd(end)})
    return body if isinstance(body, list) else []


def fetch_activities(start: date, end: date) -> list[dict[str, Any]]:
    body = _request_json("activities", {"oldest": ymd(start), "newest": ymd(end)})
    return body if isinstance(body, list) else []


def fetch_events_for_weeks(weeks: int) -> list[dict[str, Any]]:
    today = date.today()
    end = today + timedelta(weeks=max(1, weeks))
    return fetch_events(today, end)


def fetch_wellness(start: date, end: date) -> list[dict[str, Any]]:
    body = _request_json("wellness", {"oldest": ymd(start), "newest": ymd(end)})
    return body if isinstance(body, list) else []


def fetch_wellness_for_weeks(weeks: int) -> list[dict[str, Any]]:
    end = date.today()
    start = end - timedelta(weeks=max(1, weeks))
    return fetch_wellness(start, end)
