"""Postgres/SQLAlchemy implementations of the repo protocols.

Week 0 scaffolding: only the repos needed for the morning job and the AI
insight path are fleshed out. Others raise NotImplementedError until their
feature lands.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

from sqlalchemy import create_engine, desc, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Engine

from ..schema_py import (
    ai_insights,
    job_queue,
    readiness_scores,
    settings,
    subjective_checkins,
    sync_runs,
)
from .base import (
    AiInsightsRepo,
    CheckinsRepo,
    JobQueueRepo,
    PlannedSessionsRepo,
    ReadinessRepo,
    RepoBundle,
    SettingsRepo,
    SyncRunsRepo,
)


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _engine(url: str) -> Engine:
    return create_engine(url, pool_pre_ping=True, future=True)


class _PgSyncRunsRepo(SyncRunsRepo):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def start_run(self, source: str, start_day: str | None, end_day: str | None) -> int:
        with self._engine.begin() as conn:
            result = conn.execute(
                sync_runs.insert()
                .values(
                    source=source,
                    started_at=_now(),
                    status="running",
                    start_day=start_day,
                    end_day=end_day,
                )
                .returning(sync_runs.c.id)
            )
            return int(result.scalar_one())

    def finish_run(
        self,
        run_id: int,
        status: str,
        daily_count: int = 0,
        sleep_count: int = 0,
        activity_count: int = 0,
        error: str | None = None,
    ) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                update(sync_runs)
                .where(sync_runs.c.id == run_id)
                .values(
                    finished_at=_now(),
                    status=status,
                    daily_count=daily_count,
                    sleep_count=sleep_count,
                    activity_count=activity_count,
                    error=error,
                )
            )

    def latest_per_source(self) -> dict[str, dict[str, Any]]:
        out: dict[str, dict[str, Any]] = {}
        with self._engine.connect() as conn:
            for source in ("coros", "strava", "intervals"):
                row = conn.execute(
                    select(sync_runs)
                    .where(sync_runs.c.source == source)
                    .order_by(desc(sync_runs.c.started_at))
                    .limit(1)
                ).mappings().first()
                out[source] = dict(row) if row else {}
        return out


class _PgAiInsightsRepo(AiInsightsRepo):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def upsert(
        self,
        date: str,
        prompt_version: str,
        model: str,
        payload: dict[str, Any],
    ) -> None:
        stmt = pg_insert(ai_insights).values(
            date=date,
            prompt_version=prompt_version,
            model=model,
            summary=payload.get("summary"),
            talking_points_json=payload.get("talking_points"),
            session_advice=payload.get("session_advice"),
            anomalies_json=payload.get("anomalies"),
            tokens_in=payload.get("tokens_in"),
            tokens_out=payload.get("tokens_out"),
            raw_json=payload,
            created_at=_now(),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[ai_insights.c.date, ai_insights.c.prompt_version, ai_insights.c.model],
            set_={
                "summary": stmt.excluded.summary,
                "talking_points_json": stmt.excluded.talking_points_json,
                "session_advice": stmt.excluded.session_advice,
                "anomalies_json": stmt.excluded.anomalies_json,
                "tokens_in": stmt.excluded.tokens_in,
                "tokens_out": stmt.excluded.tokens_out,
                "raw_json": stmt.excluded.raw_json,
                "created_at": stmt.excluded.created_at,
            },
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)

    def latest_for_date(self, date: str) -> dict[str, Any] | None:
        with self._engine.connect() as conn:
            row = conn.execute(
                select(ai_insights)
                .where(ai_insights.c.date == date)
                .order_by(desc(ai_insights.c.created_at))
                .limit(1)
            ).mappings().first()
            return dict(row) if row else None


class _PgSettingsRepo(SettingsRepo):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def get(self, key: str, default: Any = None) -> Any:
        with self._engine.connect() as conn:
            row = conn.execute(
                select(settings.c.value).where(settings.c.key == key)
            ).first()
            return row[0] if row else default

    def set(self, key: str, value: Any) -> None:
        stmt = pg_insert(settings).values(key=key, value=value, updated_at=_now())
        stmt = stmt.on_conflict_do_update(
            index_elements=[settings.c.key],
            set_={"value": stmt.excluded.value, "updated_at": stmt.excluded.updated_at},
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)


class _PgJobQueueRepo(JobQueueRepo):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def enqueue(self, kind: str, payload: dict[str, Any], requested_by: str | None = None) -> int:
        with self._engine.begin() as conn:
            result = conn.execute(
                job_queue.insert()
                .values(
                    kind=kind,
                    payload=payload,
                    status="pending",
                    requested_by=requested_by,
                    requested_at=_now(),
                )
                .returning(job_queue.c.id)
            )
            return int(result.scalar_one())

    def claim_next(self, now: datetime) -> dict[str, Any] | None:
        with self._engine.begin() as conn:
            row = conn.execute(
                select(job_queue)
                .where(job_queue.c.status == "pending")
                .order_by(job_queue.c.requested_at)
                .limit(1)
                .with_for_update(skip_locked=True)
            ).mappings().first()
            if not row:
                return None
            conn.execute(
                update(job_queue)
                .where(job_queue.c.id == row["id"])
                .values(status="running", started_at=now, attempts=row["attempts"] + 1)
            )
            return dict(row)

    def finish(self, job_id: int, ok: bool, error: str | None = None) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                update(job_queue)
                .where(job_queue.c.id == job_id)
                .values(
                    status="ok" if ok else "error",
                    finished_at=_now(),
                    is_terminal=True,
                    last_error=error,
                )
            )

    def pending(self) -> list[dict[str, Any]]:
        with self._engine.connect() as conn:
            rows = conn.execute(
                select(job_queue)
                .where(job_queue.c.status == "pending")
                .order_by(job_queue.c.requested_at)
            ).mappings().all()
            return [dict(r) for r in rows]


class _PgReadinessRepo(ReadinessRepo):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def upsert_score(self, payload: dict[str, Any]) -> None:
        stmt = pg_insert(readiness_scores).values(**payload)
        stmt = stmt.on_conflict_do_update(
            index_elements=[readiness_scores.c.date],
            set_={k: stmt.excluded[k] for k in payload if k != "date"},
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)

    def get_score(self, date: str) -> dict[str, Any] | None:
        with self._engine.connect() as conn:
            row = conn.execute(
                select(readiness_scores).where(readiness_scores.c.date == date)
            ).mappings().first()
            return dict(row) if row else None

    def recent_scores(self, limit: int = 30) -> list[dict[str, Any]]:
        with self._engine.connect() as conn:
            rows = conn.execute(
                select(readiness_scores)
                .order_by(desc(readiness_scores.c.date))
                .limit(limit)
            ).mappings().all()
            return [dict(r) for r in rows]


class _PgCheckinsRepo(CheckinsRepo):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def upsert(self, date: str, payload: dict[str, Any]) -> None:
        stmt = pg_insert(subjective_checkins).values(
            date=date,
            energy=payload.get("energy"),
            mood=payload.get("mood"),
            soreness=payload.get("soreness"),
            stress=payload.get("stress"),
            illness=payload.get("illness", 0),
            notes=payload.get("notes"),
            created_at=_now(),
            updated_at=_now(),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[subjective_checkins.c.date],
            set_={
                "energy": stmt.excluded.energy,
                "mood": stmt.excluded.mood,
                "soreness": stmt.excluded.soreness,
                "stress": stmt.excluded.stress,
                "illness": stmt.excluded.illness,
                "notes": stmt.excluded.notes,
                "updated_at": stmt.excluded.updated_at,
            },
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)

    def get(self, date: str) -> dict[str, Any] | None:
        with self._engine.connect() as conn:
            row = conn.execute(
                select(subjective_checkins).where(subjective_checkins.c.date == date)
            ).mappings().first()
            return dict(row) if row else None


class _PgPlannedSessionsRepo(PlannedSessionsRepo):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def upsert_many(self, rows: Iterable[dict[str, Any]]) -> int:
        # Filled in when the Intervals sync is moved to the repo layer.
        raise NotImplementedError

    def for_day(self, date: str) -> list[dict[str, Any]]:
        from ..schema_py import planned_sessions

        with self._engine.connect() as conn:
            rows = conn.execute(
                select(planned_sessions).where(planned_sessions.c.date == date)
            ).mappings().all()
            return [dict(r) for r in rows]


def build_postgres_bundle(url: str) -> RepoBundle:
    engine = _engine(url)
    return RepoBundle(
        sync_runs=_PgSyncRunsRepo(engine),
        readiness=_PgReadinessRepo(engine),
        checkins=_PgCheckinsRepo(engine),
        planned_sessions=_PgPlannedSessionsRepo(engine),
        ai_insights=_PgAiInsightsRepo(engine),
        settings=_PgSettingsRepo(engine),
        job_queue=_PgJobQueueRepo(engine),
    )
