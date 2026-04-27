"""Mirror SQLite rows into Postgres after each sync/score run.

Rationale
---------
The legacy scoring pipeline (`health_readiness/db.py`) is SQLite-first and
relies on ~500 lines of hand-rolled queries. Porting it to SQLAlchemy in one
change is risky; the frontend needs Postgres-backed data today.

This module is the transitional bridge: after every `cli.py sync`/`score` it
upserts the affected tables into Postgres so the Vercel frontend sees fresh
data. Once every CLI command has been moved onto the `RepoBundle`, this file
can be deleted.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Iterable, Sequence

from sqlalchemy import DateTime, MetaData, create_engine
from sqlalchemy.dialects.postgresql import insert as pg_insert

from .schema_py import ALL_TABLES


DEFAULT_TABLES: tuple[str, ...] = (
    "daily_metrics",
    "sleep_records",
    "activities",
    "strava_activities",
    "planned_sessions",
    "intervals_activities",
    "subjective_checkins",
    "readiness_scores",
    "sync_runs",
)


def _promote_url(url: str) -> str:
    if url.startswith("postgresql://") and "+" not in url.split("://", 1)[0]:
        return "postgresql+psycopg://" + url.split("://", 1)[1]
    return url


def _maybe_json(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    s = value.strip()
    if not s or s[0] not in "[{":
        return value
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return value


def _coerce_datetime(value: Any, with_tz: bool) -> Any:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        dt = datetime.fromtimestamp(float(value), tz=timezone.utc)
        return dt if with_tz else dt.replace(tzinfo=None)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        if s.isdigit() or (s.startswith("-") and s[1:].isdigit()):
            dt = datetime.fromtimestamp(int(s), tz=timezone.utc)
            return dt if with_tz else dt.replace(tzinfo=None)
        return s
    return value


def _iter_rows(conn: sqlite3.Connection, table: str) -> Iterable[dict[str, Any]]:
    cur = conn.execute(f"SELECT * FROM {table}")
    cols = [c[0] for c in cur.description]
    for row in cur:
        yield dict(zip(cols, row))


def mirror_to_postgres(
    sqlite_conn: sqlite3.Connection,
    *,
    tables: Sequence[str] | None = None,
    database_url: str | None = None,
    verbose: bool = True,
) -> dict[str, int]:
    """Upsert rows from the given SQLite tables into Postgres.

    Returns a dict mapping table name -> rows pushed. A missing `DATABASE_URL`
    is treated as a no-op so offline runs keep working silently.
    """
    url = database_url or os.environ.get("DATABASE_URL")
    if not url:
        if verbose:
            print("mirror: DATABASE_URL not set, skipping Postgres push.")
        return {}

    table_names = set(tables) if tables is not None else set(DEFAULT_TABLES)
    engine = create_engine(_promote_url(url), future=True)

    # Only reflect what's actually in Postgres so missing-on-target tables are
    # skipped cleanly during migrations.
    reflected = MetaData()
    reflected.reflect(bind=engine)
    available = set(reflected.tables.keys())

    src_tables = {
        r[0]
        for r in sqlite_conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }

    pushed: dict[str, int] = {}
    with engine.begin() as pg:
        for table in ALL_TABLES:
            if table.name not in table_names:
                continue
            if table.name not in available:
                if verbose:
                    print(f"mirror: skip {table.name} (missing in Postgres)")
                continue
            if table.name not in src_tables:
                if verbose:
                    print(f"mirror: skip {table.name} (missing in SQLite)")
                continue

            rows = list(_iter_rows(sqlite_conn, table.name))
            if not rows:
                continue

            json_cols = {
                c.name
                for c in table.columns
                if c.name.endswith("_json") or c.name in {"payload", "value", "raw_json"}
            }
            dt_cols = {
                c.name: bool(getattr(c.type, "timezone", False))
                for c in table.columns
                if isinstance(c.type, DateTime)
            }

            def _coerce(col: str, v: Any) -> Any:
                if v is None:
                    return None
                if col in json_cols:
                    return _maybe_json(v)
                if col in dt_cols:
                    return _coerce_datetime(v, with_tz=dt_cols[col])
                return v

            cleaned: list[dict[str, Any]] = []
            for row in rows:
                record = {k: _coerce(k, v) for k, v in row.items() if k in table.c}

                # Fill NOT NULL columns that exist in Postgres but not SQLite.
                for c in table.columns:
                    if c.name in record:
                        continue
                    if c.nullable or c.default is not None or c.server_default is not None:
                        continue
                    if c.primary_key and c.autoincrement:
                        continue
                    if isinstance(c.type, DateTime):
                        tz = timezone.utc if getattr(c.type, "timezone", False) else None
                        record[c.name] = datetime.now(tz=tz)
                    elif c.name == "source":
                        record[c.name] = "cli"
                    else:
                        record[c.name] = ""

                cleaned.append(record)

            # Upsert on the primary key(s). If the source doesn't carry a PK
            # value (e.g. `sync_runs.id` autogen) we fall back to plain insert.
            pk_cols = [c.name for c in table.primary_key.columns]
            first_row_has_pk = bool(pk_cols) and all(
                cleaned[0].get(c) is not None for c in pk_cols
            )

            if not pk_cols or not first_row_has_pk:
                pg.execute(table.insert(), cleaned)
            else:
                stmt = pg_insert(table).values(cleaned)
                update_cols = {
                    c.name: stmt.excluded[c.name]
                    for c in table.columns
                    if c.name not in pk_cols
                }
                stmt = stmt.on_conflict_do_update(
                    index_elements=pk_cols, set_=update_cols
                )
                pg.execute(stmt)

            pushed[table.name] = len(cleaned)
            if verbose:
                print(f"mirror: {table.name} -> {len(cleaned)} rows")

    return pushed
