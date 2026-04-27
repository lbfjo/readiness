"""Build the context JSON fed to the AI insight prompt.

Pulled from SQLite (the local compute source-of-truth) so we don't have to
round-trip through Postgres just to assemble the prompt. The shape matches
`prompts/daily_insight_v1.md`.
"""

from __future__ import annotations

import json
import os
import sqlite3
from typing import Any

from . import db
from .mirror import _promote_url


def _decode(value: Any) -> Any:
    if isinstance(value, str):
        s = value.strip()
        if s and s[0] in "[{":
            try:
                return json.loads(s)
            except json.JSONDecodeError:
                return value
    return value


def build_today_summary(conn: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
    baselines = db.latest_baselines(conn, row["date"])
    summary = {
        "date": row["date"],
        "score": row["score"],
        "status": row["status"],
        "confidence": row["confidence"],
        "recommendation": row["recommendation"],
        "component_scores": _decode(row["component_scores_json"]),
        "positive_drivers": _decode(row["positive_drivers_json"]),
        "caution_drivers": _decode(row["caution_drivers_json"]),
        "metrics": {
            "avg_sleep_hrv": row["avg_sleep_hrv"],
            "hrv_baseline": row["baseline"],
            "rhr": row["rhr"],
            "rhr_median_14d": baselines.get("rhr_median"),
            "sleep_minutes": row["total_duration_minutes"],
            "sleep_avg_14d": baselines.get("sleep_avg"),
            "awake_minutes": row["awake_minutes"],
            "training_load": row["training_load"],
            "training_load_ratio": row["training_load_ratio"],
            "load_ratio_avg_14d": baselines.get("load_ratio_avg"),
            "tired_rate": row["tired_rate"],
            "strava_count": row["strava_count"],
            "strava_km": row["strava_km"],
            "planned_count": row["planned_count"],
        },
    }
    return summary


def build_trend(conn: sqlite3.Connection, limit: int = 14) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT r.date, r.score, r.status, d.avg_sleep_hrv, d.rhr,
               d.training_load, d.training_load_ratio,
               s.total_duration_minutes
        FROM readiness_scores r
        LEFT JOIN daily_metrics d ON d.date = r.date
        LEFT JOIN sleep_records s ON s.date = r.date
        ORDER BY r.date DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return [
        {
            "date": r["date"],
            "score": r["score"],
            "status": r["status"],
            "hrv": r["avg_sleep_hrv"],
            "rhr": r["rhr"],
            "sleep_minutes": r["total_duration_minutes"],
            "training_load": r["training_load"],
            "training_load_ratio": r["training_load_ratio"],
        }
        for r in rows
    ]


def build_planned_session(conn: sqlite3.Connection, date: str) -> dict[str, Any] | None:
    sessions = db.planned_sessions_for_day(conn, date)
    if not sessions:
        return None
    first = sessions[0]
    return {
        "type": first["type"],
        "name": first["name"],
        "description": (first["description"] or "").strip() or None,
    }


def build_last_checkin(conn: sqlite3.Connection, date: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM subjective_checkins WHERE date = ?",
        (date,),
    ).fetchone()
    if not row:
        return None
    return {
        "date": row["date"],
        "energy": row["energy"],
        "mood": row["mood"],
        "soreness": row["soreness"],
        "stress": row["stress"],
        "illness": bool(row["illness"]),
        "notes": row["notes"],
    }


def build_completed_today(
    conn: sqlite3.Connection, date: str
) -> list[dict[str, Any]]:
    """Workouts already done today. Pulled from the Strava mirror because it's
    the richest source (name, distance, suffer score). Coros duplicates are
    left to future work; surfacing Strava already fixes the common case.
    """
    try:
        rows = conn.execute(
            """
            SELECT activity_id, name, sport_type, type, start_date_local,
                   moving_time, distance_meters, average_hr, suffer_score
            FROM strava_activities
            WHERE local_day = ?
            ORDER BY start_date_local
            """,
            (date,),
        ).fetchall()
    except sqlite3.OperationalError:
        return []

    items: list[dict[str, Any]] = []
    for r in rows:
        items.append(
            {
                "activity_id": r["activity_id"],
                "name": r["name"],
                "sport": r["sport_type"] or r["type"],
                "start_local": r["start_date_local"],
                "duration_seconds": r["moving_time"],
                "distance_km": (
                    round((r["distance_meters"] or 0) / 1000, 2)
                    if r["distance_meters"]
                    else None
                ),
                "avg_hr": r["average_hr"],
                "suffer_score": r["suffer_score"],
            }
        )
    return items


def build_daily_decision(date: str) -> dict[str, Any] | None:
    """Read the persisted harness decision from Postgres when available."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        return None
    try:
        from sqlalchemy import create_engine, text

        engine = create_engine(_promote_url(url), future=True)
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT raw_json FROM daily_decisions WHERE date = :date"),
                {"date": date},
            ).first()
        raw = row[0] if row else None
        return raw if isinstance(raw, dict) else None
    except Exception:
        return None
