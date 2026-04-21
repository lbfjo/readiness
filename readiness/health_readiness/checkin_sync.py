"""Reverse-sync: pull subjective check-ins from Postgres into SQLite.

The web app writes directly to Neon (`POST /api/check-in` → Drizzle upsert),
but the scoring pipeline still reads from the local SQLite store. Before every
`cli.py score` we pull any check-ins that are newer in Postgres than in SQLite
and mirror them locally, so the next `score_rows` pass sees the web-submitted
values.

This is the inverse of `health_readiness.mirror` and disappears once the full
SQLAlchemy port of `db.py` lands and Postgres becomes the only primary store.
"""

from __future__ import annotations

import os
import sqlite3
import sys
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import MetaData, create_engine, select

from . import db as local_db
from .mirror import _promote_url


def pull_checkins_from_postgres(
    conn: sqlite3.Connection,
    *,
    database_url: str | None = None,
    verbose: bool = False,
) -> int:
    """Upsert Postgres check-ins into SQLite when Postgres is the newer copy.

    Returns the number of rows written locally. Missing `DATABASE_URL` or any
    Postgres-side failure degrades to 0 silently so the CLI keeps working
    offline.
    """
    url = database_url or os.environ.get("DATABASE_URL")
    if not url:
        return 0

    try:
        engine = create_engine(_promote_url(url), future=True)
        meta = MetaData()
        meta.reflect(bind=engine, only=["subjective_checkins"])
    except Exception as exc:  # noqa: BLE001 - best-effort pull
        if verbose:
            print(f"checkin-sync: could not connect ({exc})", file=sys.stderr)
        return 0

    table = meta.tables.get("subjective_checkins")
    if table is None:
        return 0

    try:
        with engine.connect() as pg:
            remote_rows = [dict(r._mapping) for r in pg.execute(select(table))]
    except Exception as exc:  # noqa: BLE001 - best-effort pull
        if verbose:
            print(f"checkin-sync: query failed ({exc})", file=sys.stderr)
        return 0

    if not remote_rows:
        return 0

    local_rows: dict[str, dict[str, Any]] = {}
    for row in conn.execute(
        "SELECT date, updated_at FROM subjective_checkins"
    ).fetchall():
        local_rows[row[0]] = {"updated_at": row[1]}

    written = 0
    for remote in remote_rows:
        date_key = str(remote.get("date") or "")
        if not date_key:
            continue

        if _should_skip(local_rows.get(date_key), remote.get("updated_at")):
            continue

        local_db.upsert_checkin(
            conn,
            date_key,
            _as_int(remote.get("energy")),
            _as_int(remote.get("mood")),
            _as_int(remote.get("soreness")),
            _as_int(remote.get("stress")),
            _as_int(remote.get("illness")) or 0,
            remote.get("notes"),
        )
        written += 1

    if written and verbose:
        print(f"checkin-sync: pulled {written} rows from Postgres")

    return written


def _should_skip(local: dict[str, Any] | None, remote_updated: Any) -> bool:
    """Skip the write if the local copy is already at least as fresh."""
    if local is None:
        return False
    if remote_updated is None:
        return True
    local_updated = _to_dt(local.get("updated_at"))
    remote_dt = _to_dt(remote_updated)
    if local_updated is None or remote_dt is None:
        return False
    return local_updated >= remote_dt


def _to_dt(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        if s.isdigit() or (s.startswith("-") and s[1:].isdigit()):
            return datetime.fromtimestamp(int(s), tz=timezone.utc)
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _as_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
