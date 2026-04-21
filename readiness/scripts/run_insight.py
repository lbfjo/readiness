"""Smoke test for the AI insight pipeline.

Runs the Codex backend against a minimal fake context and stores the result in
`ai_insights`. Useful for verifying that the CLI session is reachable from
whatever runs this (your shell, `launchd`, etc.) before wiring the Today page.

    DATABASE_URL=postgresql://... \
        python readiness/scripts/run_insight.py --date 2026-04-21
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from readiness.health_readiness.insight import (  # noqa: E402
    CodexInsightBackend,
    generate_daily_insight,
)
from readiness.health_readiness.repos import make_repos  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", required=True, help="ISO date to generate for")
    args = parser.parse_args()

    bundle = make_repos()
    backend = CodexInsightBackend()

    result = generate_daily_insight(
        backend=backend,
        date=args.date,
        today_summary={"score": 70, "status": "ok", "confidence": "medium"},
        trend=[],
        planned_session=None,
        last_checkin=None,
        repo=bundle.ai_insights,
    )
    print(f"Stored insight for {args.date} ({result.model} · {result.prompt_version})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
