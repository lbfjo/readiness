"""Job runner: consume the Postgres `job_queue` table from the laptop.

The web frontend enqueues rows via `POST /api/jobs`; this module claims the
next pending row (SKIP LOCKED so two pollers don't step on each other),
dispatches it by `kind`, and writes the final status back.

Dispatchers are thin wrappers that reuse the existing `command_*` functions
from `cli.py`. Keeping them separate from `cli.py` avoids a circular import
and keeps the job contract narrow.
"""

from __future__ import annotations

import os
import sys
import traceback
from datetime import datetime, timezone
from typing import Any, Callable

from sqlalchemy import MetaData, create_engine, text

from .mirror import _promote_url


JobPayload = dict[str, Any]
Dispatcher = Callable[[Any, JobPayload], None]


def _engine(url: str | None = None):
    url = url or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is required for the job runner")
    return create_engine(_promote_url(url), future=True)


def claim_pending_job(url: str | None = None) -> dict[str, Any] | None:
    """Atomically claim the next pending job.

    Uses Postgres `FOR UPDATE SKIP LOCKED` so multiple pollers (or retries)
    don't double-process the same row. Returns the claimed row as a dict, or
    `None` when the queue is empty.
    """
    engine = _engine(url)
    sql = text(
        """
        UPDATE job_queue
        SET status = 'running',
            attempts = attempts + 1,
            started_at = now()
        WHERE id = (
          SELECT id FROM job_queue
          WHERE status = 'pending'
          ORDER BY requested_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING id, kind, payload, attempts, requested_by, requested_at
        """
    )
    with engine.begin() as conn:
        row = conn.execute(sql).mappings().first()
    return dict(row) if row else None


def finish_job(
    job_id: int,
    status: str,
    *,
    error: str | None = None,
    url: str | None = None,
) -> None:
    """Mark a job as terminal. Always sets `finished_at` and `is_terminal`."""
    engine = _engine(url)
    sql = text(
        """
        UPDATE job_queue
        SET status = :status,
            last_error = :error,
            finished_at = now(),
            is_terminal = TRUE
        WHERE id = :id
        """
    )
    with engine.begin() as conn:
        conn.execute(
            sql,
            {"status": status, "error": error, "id": job_id},
        )


def _dispatch_sync(conn, payload: JobPayload) -> None:
    # Import lazily to avoid pulling Coros/Strava deps for `insight`/`score`
    # jobs, matching the convention in cli.py.
    from cli import command_sync, command_strava_sync, command_intervals_sync  # noqa: E402

    weeks = int(payload.get("weeks", 4))
    command_sync(conn, weeks)
    if not payload.get("skip_strava"):
        try:
            command_strava_sync(conn, weeks)
        except Exception as exc:  # noqa: BLE001 - best-effort
            print(f"poll: strava sync skipped ({exc})", file=sys.stderr)
    if not payload.get("skip_intervals"):
        try:
            command_intervals_sync(conn, weeks)
        except Exception as exc:  # noqa: BLE001 - best-effort
            print(f"poll: intervals sync skipped ({exc})", file=sys.stderr)


def _dispatch_score(conn, _payload: JobPayload) -> None:
    from cli import command_score  # noqa: E402

    command_score(conn)


def _dispatch_insight(conn, payload: JobPayload) -> None:
    from cli import command_insight  # noqa: E402

    command_insight(
        conn,
        target_date=payload.get("date"),
        model=payload.get("model"),
        dry_run=bool(payload.get("dry_run", False)),
    )


def _dispatch_refresh(conn, payload: JobPayload) -> None:
    """Full mid-day refresh: sync + score (picks up web check-ins) + insight.

    This is what the `/today` Refresh button enqueues. Order matters: we want
    the new activities and check-ins to land before scoring and before the AI
    narrative reasons over them.
    """
    _dispatch_sync(conn, payload)
    _dispatch_score(conn, payload)
    _dispatch_insight(conn, payload)


JOB_DISPATCH: dict[str, Dispatcher] = {
    "sync": _dispatch_sync,
    "score": _dispatch_score,
    "insight": _dispatch_insight,
    "refresh": _dispatch_refresh,
}


def run_once(conn) -> bool:
    """Claim and dispatch a single job. Returns `True` if one was processed."""
    if not os.environ.get("DATABASE_URL"):
        return False

    try:
        job = claim_pending_job()
    except Exception as exc:  # noqa: BLE001 - best-effort
        print(f"poll: claim failed ({exc})", file=sys.stderr)
        return False

    if job is None:
        return False

    job_id = int(job["id"])
    kind = str(job["kind"])
    payload: JobPayload = dict(job.get("payload") or {})
    print(
        f"poll: job {job_id} [{kind}] requested_by={job.get('requested_by')} "
        f"attempt={job.get('attempts')}"
    )

    dispatcher = JOB_DISPATCH.get(kind)
    if dispatcher is None:
        finish_job(job_id, "failed", error=f"unknown kind: {kind}")
        print(f"poll: job {job_id} failed (unknown kind {kind})", file=sys.stderr)
        return True

    started = datetime.now(tz=timezone.utc)
    try:
        dispatcher(conn, payload)
    except Exception as exc:  # noqa: BLE001 - best-effort
        tb = traceback.format_exc(limit=4)
        finish_job(job_id, "failed", error=f"{exc}\n{tb}")
        print(f"poll: job {job_id} failed: {exc}", file=sys.stderr)
        return True

    finish_job(job_id, "succeeded")
    elapsed = (datetime.now(tz=timezone.utc) - started).total_seconds()
    print(f"poll: job {job_id} succeeded in {elapsed:.1f}s")
    return True
