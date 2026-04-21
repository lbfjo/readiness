"""Repo factory.

Reads `DATABASE_URL` and returns a concrete `RepoBundle`. The POC defaults to
Postgres (Neon). Any `sqlite://` URL transparently falls back to the local
SQLite implementation that wraps the existing `db.py` code paths.
"""

from __future__ import annotations

import os
from urllib.parse import urlparse

from .base import RepoBundle


def make_repos(database_url: str | None = None) -> RepoBundle:
    url = database_url or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. Set it in readiness/.env (sqlite:/// or postgresql://)."
        )

    scheme = urlparse(url).scheme
    if scheme.startswith("sqlite"):
        from .sqlite_impl import build_sqlite_bundle

        return build_sqlite_bundle(url)

    if scheme.startswith("postgres"):
        from .postgres_impl import build_postgres_bundle

        # SQLAlchemy defaults to psycopg2 for the bare `postgresql://` scheme.
        # Promote to psycopg v3 which ships as a single binary wheel.
        if url.startswith("postgresql://") and "+" not in scheme:
            url = "postgresql+psycopg://" + url.split("://", 1)[1]
        return build_postgres_bundle(url)

    raise RuntimeError(f"Unsupported DATABASE_URL scheme: {scheme!r}")
