"""SQLite-backed implementations of the repo protocols.

These wrap the existing `db.py` helpers so the legacy code path keeps working
while feature code migrates to the repo abstraction. Anything not yet wired
raises `NotImplementedError` and should be filled in as features move over.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

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


def _sqlite_path_from_url(url: str) -> Path:
    # Accept sqlite:///absolute/path.sqlite or sqlite:relative/path.sqlite
    prefix, _, path = url.partition(":")
    if not prefix.startswith("sqlite"):
        raise ValueError(f"Not a sqlite URL: {url}")
    path = path.lstrip("/")
    return Path(path).expanduser().resolve()


class _NotWired:
    """Placeholder for repos that haven't been ported off raw `db.py` yet."""

    def __getattr__(self, name: str):
        raise NotImplementedError(
            f"SQLite repo method {name!r} is not wired yet; use the Postgres bundle "
            "during the POC or port this method from db.py."
        )


def build_sqlite_bundle(url: str) -> RepoBundle:
    """Return a bundle where each repo is a NotImplemented stub.

    The legacy `db.py` functions continue to be used directly by the existing
    CLI flows. Once a feature migrates, replace the stub here with a thin
    wrapper over `db.py`.
    """

    _ = _sqlite_path_from_url(url)  # validate the URL shape
    stub = _NotWired()
    return RepoBundle(
        sync_runs=stub,  # type: ignore[arg-type]
        readiness=stub,  # type: ignore[arg-type]
        checkins=stub,  # type: ignore[arg-type]
        planned_sessions=stub,  # type: ignore[arg-type]
        ai_insights=stub,  # type: ignore[arg-type]
        settings=stub,  # type: ignore[arg-type]
        job_queue=stub,  # type: ignore[arg-type]
    )


__all__ = [
    "build_sqlite_bundle",
]
