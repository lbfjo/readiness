"""One-shot backfill from SQLite into Postgres.

Thin wrapper around `health_readiness.mirror.mirror_to_postgres`. Kept as a
standalone entrypoint so `launchd` / CI can call it without needing to know the
module layout.

Usage:

    DATABASE_URL=postgresql://... \
        python readiness/scripts/backfill_sqlite_to_postgres.py \
        --sqlite readiness/data/readiness.sqlite
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

# Ensure the readiness package is importable when run from the repo root.
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from readiness.health_readiness.mirror import mirror_to_postgres  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", required=True, type=Path, help="Path to SQLite file")
    args = parser.parse_args()

    if not args.sqlite.exists():
        print(f"SQLite file not found: {args.sqlite}", file=sys.stderr)
        return 2

    src = sqlite3.connect(args.sqlite)
    src.row_factory = sqlite3.Row
    pushed = mirror_to_postgres(src)
    total = sum(pushed.values())
    print(f"Done. {total} rows copied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
