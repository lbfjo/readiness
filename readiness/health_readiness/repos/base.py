"""Repository protocols.

Every feature in the Python engine talks to the DB through one of these
protocols, not raw SQL. A Postgres (SQLAlchemy) and a SQLite implementation
both satisfy them, and are chosen at startup based on DATABASE_URL.

The protocols intentionally start small and grow as features land. Feature
code should depend on the protocol, never on a concrete implementation.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable, Protocol, runtime_checkable


@runtime_checkable
class SyncRunsRepo(Protocol):
    def start_run(self, source: str, start_day: str | None, end_day: str | None) -> int: ...
    def finish_run(
        self,
        run_id: int,
        status: str,
        daily_count: int = 0,
        sleep_count: int = 0,
        activity_count: int = 0,
        error: str | None = None,
    ) -> None: ...
    def latest_per_source(self) -> dict[str, dict[str, Any]]: ...


@runtime_checkable
class ReadinessRepo(Protocol):
    def upsert_score(self, payload: dict[str, Any]) -> None: ...
    def get_score(self, date: str) -> dict[str, Any] | None: ...
    def recent_scores(self, limit: int = 30) -> list[dict[str, Any]]: ...


@runtime_checkable
class CheckinsRepo(Protocol):
    def upsert(self, date: str, payload: dict[str, Any]) -> None: ...
    def get(self, date: str) -> dict[str, Any] | None: ...


@runtime_checkable
class PlannedSessionsRepo(Protocol):
    def upsert_many(self, rows: Iterable[dict[str, Any]]) -> int: ...
    def for_day(self, date: str) -> list[dict[str, Any]]: ...


@runtime_checkable
class AiInsightsRepo(Protocol):
    def upsert(
        self,
        date: str,
        prompt_version: str,
        model: str,
        payload: dict[str, Any],
    ) -> None: ...
    def latest_for_date(self, date: str) -> dict[str, Any] | None: ...


@runtime_checkable
class SettingsRepo(Protocol):
    def get(self, key: str, default: Any = None) -> Any: ...
    def set(self, key: str, value: Any) -> None: ...


@runtime_checkable
class JobQueueRepo(Protocol):
    def enqueue(self, kind: str, payload: dict[str, Any], requested_by: str | None = None) -> int: ...
    def claim_next(self, now: datetime) -> dict[str, Any] | None: ...
    def finish(self, job_id: int, ok: bool, error: str | None = None) -> None: ...
    def pending(self) -> list[dict[str, Any]]: ...


@dataclass(frozen=True)
class RepoBundle:
    """Bundle of repositories handed around the app so feature code gets a
    single, consistent view of the persistence layer."""

    sync_runs: SyncRunsRepo
    readiness: ReadinessRepo
    checkins: CheckinsRepo
    planned_sessions: PlannedSessionsRepo
    ai_insights: AiInsightsRepo
    settings: SettingsRepo
    job_queue: JobQueueRepo
