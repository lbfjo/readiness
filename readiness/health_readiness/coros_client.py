from __future__ import annotations

import asyncio
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
COROS_REPO = ROOT / "coros-mcp"
if str(COROS_REPO) not in sys.path:
    sys.path.insert(0, str(COROS_REPO))

import coros_api  # type: ignore  # noqa: E402


def yyyymmdd(value: date) -> str:
    return value.strftime("%Y%m%d")


async def fetch_coros_sample(weeks: int) -> dict[str, Any]:
    auth = coros_api.get_stored_auth()
    if auth is None:
        auth = await coros_api.try_auto_login()
    if auth is None:
        raise RuntimeError(
            "Coros is not authenticated. Run coros-mcp auth first, or set "
            "COROS_EMAIL and COROS_PASSWORD in readiness/.env for automatic login."
        )

    weeks = max(1, min(weeks, 24))
    end = date.today()
    start = end - timedelta(weeks=weeks)
    start_day = yyyymmdd(start)
    end_day = yyyymmdd(end)

    daily, sleep, activities_result = await asyncio.gather(
        coros_api.fetch_daily_records(auth, start_day, end_day),
        coros_api.fetch_sleep(auth, start_day, end_day),
        coros_api.fetch_activities(auth, start_day, end_day, page=1, size=100),
    )
    activities, total_activities = activities_result

    return {
        "start_day": start_day,
        "end_day": end_day,
        "daily": [item.model_dump() for item in daily],
        "sleep": [item.model_dump() for item in sleep],
        "activities": [item.model_dump() for item in activities],
        "total_activities": total_activities,
    }
