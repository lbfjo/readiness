from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import date
from pathlib import Path

from health_readiness import db
from health_readiness.insight import CodexInsightBackend, generate_daily_insight
from health_readiness.insight_context import (
    build_completed_today,
    build_last_checkin,
    build_planned_session,
    build_today_summary,
    build_trend,
)
from health_readiness.repos import make_repos
from health_readiness.scoring import decode_json_list, score_rows


# External API clients are imported lazily inside their commands so subcommands
# that don't need Coros / Strava / Intervals (e.g. `insight`, `today`) don't
# drag their transitive dependencies (keyring, cryptography, coros-mcp, etc.)
# into the import graph.

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / "readiness" / ".env"


def _load_env_file(path: Path = ENV_PATH) -> None:
    """Best-effort `.env` loader for direct CLI usage.

    `morning_job.sh` already exports `readiness/.env` before invoking the CLI,
    but direct calls like `python readiness/cli.py morning` previously skipped
    that step. We use `setdefault` so explicit shell env vars still override
    file-based values.
    """
    if not path.exists():
        return
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _mirror(conn, tables=None) -> None:
    """Push the given SQLite tables to Postgres if DATABASE_URL is set.

    Failures are logged but never block the CLI so offline runs degrade
    gracefully. See `health_readiness/mirror.py` for the contract.
    """
    try:
        from health_readiness.mirror import mirror_to_postgres

        mirror_to_postgres(conn, tables=tables)
    except Exception as exc:  # noqa: BLE001 - best-effort mirror
        print(f"mirror: push failed ({exc}); continuing.", file=sys.stderr)


def _pull_web_checkins(conn) -> None:
    """Reverse-sync web-submitted check-ins from Postgres into SQLite.

    Called before every score recompute so `/check-in` form submissions from
    the browser feed into the next `score_rows` pass without needing a
    separate job queue.
    """
    try:
        from health_readiness.checkin_sync import pull_checkins_from_postgres

        pulled = pull_checkins_from_postgres(conn, verbose=False)
        if pulled:
            print(f"checkin-sync: pulled {pulled} web check-in(s) from Postgres")
    except Exception as exc:  # noqa: BLE001 - best-effort pull
        print(f"checkin-sync: pull failed ({exc}); continuing.", file=sys.stderr)


def fmt_value(value, suffix: str = "") -> str:
    if value is None:
        return "N/A"
    if isinstance(value, float):
        text = f"{value:.2f}".rstrip("0").rstrip(".")
    else:
        text = str(value)
    return f"{text}{suffix}"


def fmt_sleep(minutes) -> str:
    if minutes is None:
        return "N/A"
    minutes = int(minutes)
    return f"{minutes // 60}h{minutes % 60:02d}m"


def fmt_delta(value, suffix: str = "") -> str:
    if value is None:
        return ""
    sign = "+" if value > 0 else ""
    if isinstance(value, float):
        text = f"{value:.1f}".rstrip("0").rstrip(".")
    else:
        text = str(value)
    return f" ({sign}{text}{suffix})"


def component_label(name: str) -> str:
    return {
        "hrv": "HRV",
        "resting_hr": "Resting HR",
        "sleep": "Sleep",
        "training_load": "Training Load",
        "subjective": "Subjective",
    }.get(name, name.replace("_", " ").title())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Local Coros readiness sync and scoring")
    parser.add_argument("--db", type=Path, default=db.DEFAULT_DB, help="SQLite database path")

    sub = parser.add_subparsers(dest="command", required=True)

    sync = sub.add_parser("sync", help="Sync Coros data into SQLite")
    sync.add_argument("--weeks", type=int, default=4, help="Number of weeks to sync")

    morning = sub.add_parser("morning", help="Run Coros sync, Strava sync, scoring, report, and today")
    morning.add_argument("--weeks", type=int, default=4, help="Number of weeks to sync")
    morning.add_argument("--skip-strava", action="store_true", help="Skip Strava sync")
    morning.add_argument("--skip-intervals", action="store_true", help="Skip Intervals planned-session sync")
    morning.add_argument("--output", type=Path, default=Path("readiness/data/report.html"))

    sub.add_parser("score", help="Recompute readiness scores")
    sub.add_parser("today", help="Print latest readiness score")

    report = sub.add_parser("report", help="Generate a static HTML readiness dashboard")
    report.add_argument("--output", type=Path, default=Path("readiness/data/report.html"))

    strava_sync = sub.add_parser("strava-sync", help="Sync Strava activities into SQLite")
    strava_sync.add_argument("--weeks", type=int, default=4, help="Number of weeks to sync")

    strava_summary = sub.add_parser("strava-summary", help="Summarize Strava activity by day")
    strava_summary.add_argument("--limit", type=int, default=14, help="Number of days to show")

    intervals_sync = sub.add_parser("intervals-sync", help="Sync Intervals planned sessions into SQLite")
    intervals_sync.add_argument("--weeks", type=int, default=4, help="Number of future weeks to sync")

    intervals_import = sub.add_parser("intervals-import", help="Import planned sessions from a JSON file")
    intervals_import.add_argument("path", type=Path)

    planned_today = sub.add_parser("planned-today", help="Show planned sessions for a day")
    planned_today.add_argument("--date", default=date.today().strftime("%Y%m%d"), help="YYYYMMDD date")

    insight = sub.add_parser("insight", help="Generate the AI narrative for today's score")
    insight.add_argument("--date", default=None, help="YYYYMMDD date (defaults to latest score)")
    insight.add_argument("--model", default=None, help="Override the Codex model slug")
    insight.add_argument("--dry-run", action="store_true", help="Print context without calling Codex")

    checkin = sub.add_parser("checkin", help="Add or update a subjective daily check-in")
    checkin.add_argument("--date", default=date.today().strftime("%Y%m%d"), help="YYYYMMDD date")
    checkin.add_argument("--energy", type=int, choices=range(1, 6), metavar="1-5")
    checkin.add_argument("--mood", type=int, choices=range(1, 6), metavar="1-5")
    checkin.add_argument("--soreness", type=int, choices=range(1, 6), metavar="1-5")
    checkin.add_argument("--stress", type=int, choices=range(1, 6), metavar="1-5")
    checkin.add_argument("--illness", action="store_true")
    checkin.add_argument("--notes")

    poll = sub.add_parser(
        "poll",
        help="Claim and run jobs from the Postgres job_queue (sync/score/insight/refresh)",
    )
    poll.add_argument(
        "--once",
        action="store_true",
        help="Run a single claim+dispatch pass and exit (default behaviour).",
    )
    poll.add_argument(
        "--loop",
        action="store_true",
        help="Keep polling forever, sleeping `--interval` seconds between empty passes.",
    )
    poll.add_argument(
        "--interval",
        type=int,
        default=30,
        help="Seconds to sleep between empty polls when --loop is set (default 30).",
    )
    return parser.parse_args()


def command_sync(conn, weeks: int) -> None:
    from health_readiness.coros_client import fetch_coros_sample

    sample = asyncio.run(fetch_coros_sample(weeks))
    sync_id = db.create_sync_run(conn, sample["start_day"], sample["end_day"])
    try:
        daily_count = db.upsert_daily_metrics(conn, sample["daily"])
        sleep_count = db.upsert_sleep_records(conn, sample["sleep"])
        activity_count = db.upsert_activities(conn, sample["activities"])
        db.finish_sync_run(conn, sync_id, "success", daily_count, sleep_count, activity_count)
    except Exception as exc:
        db.finish_sync_run(conn, sync_id, "failed", error=str(exc))
        raise

    print(f"Synced {daily_count} daily metrics, {sleep_count} sleep records, {activity_count} activities.")
    print(f"Range: {sample['start_day']} to {sample['end_day']}")
    if sample["total_activities"] > activity_count:
        print(f"Note: Coros reported {sample['total_activities']} total activities; only first {activity_count} were stored.")

    _mirror(conn, tables=["daily_metrics", "sleep_records", "activities", "sync_runs"])


def command_score(conn) -> None:
    _pull_web_checkins(conn)
    scores = score_rows(db.load_scoring_rows(conn))
    count = db.save_readiness_scores(conn, scores)
    print(f"Computed {count} readiness scores.")
    _mirror(conn, tables=["subjective_checkins", "readiness_scores"])


def command_today(conn) -> None:
    row = db.latest_readiness(conn)
    if row is None:
        print("No readiness score found. Run sync and score first.")
        return

    positives = decode_json_list(row["positive_drivers_json"])
    cautions = decode_json_list(row["caution_drivers_json"])
    components = decode_json_list(row["component_scores_json"])
    if not components:
        import json
        components = json.loads(row["component_scores_json"])
    baselines = db.latest_baselines(conn, row["date"])
    rhr_delta = None
    if row["rhr"] is not None and baselines["rhr_median"] is not None:
        rhr_delta = float(row["rhr"]) - baselines["rhr_median"]
    sleep_delta = None
    if row["total_duration_minutes"] is not None and baselines["sleep_avg"] is not None:
        sleep_delta = float(row["total_duration_minutes"]) - baselines["sleep_avg"]
    hrv_delta = None
    if row["avg_sleep_hrv"] is not None and row["baseline"] is not None:
        hrv_delta = float(row["avg_sleep_hrv"]) - float(row["baseline"])
    load_ratio_delta = None
    if row["training_load_ratio"] is not None and baselines["load_ratio_avg"] is not None:
        load_ratio_delta = float(row["training_load_ratio"]) - baselines["load_ratio_avg"]

    print()
    print(f"Readiness for {row['date']}")
    print("=" * 34)
    print(f"Score          {row['score']}/100")
    print(f"Status         {row['status']}")
    print(f"Confidence     {row['confidence']}")
    print(f"Model          {row['model_version']}")
    print()
    print(row["recommendation"])
    print()
    print("Key Metrics")
    print("-" * 34)
    print(f"HRV            {fmt_value(row['avg_sleep_hrv'], ' ms')}  (base {fmt_value(row['baseline'], ' ms')}{fmt_delta(hrv_delta, ' ms')})")
    print(f"Resting HR     {fmt_value(row['rhr'], ' bpm')}{fmt_delta(rhr_delta, ' bpm vs 14d')}")
    print(f"Sleep          {fmt_sleep(row['total_duration_minutes'])}{fmt_delta(None if sleep_delta is None else round(sleep_delta), ' min vs 14d')}  (awake {fmt_value(row['awake_minutes'], ' min')})")
    print(f"Training load  {fmt_value(row['training_load'])}  (ratio {fmt_value(row['training_load_ratio'])}{fmt_delta(load_ratio_delta, ' vs 14d')}, tired {fmt_value(row['tired_rate'])})")
    print(f"Strava         {fmt_value(row['strava_count'])} activities, {fmt_value(row['strava_km'], ' km')}")
    print(f"Planned        {fmt_value(row['planned_count'])} sessions")
    print()
    print("Component Scores")
    print("-" * 34)
    for name, score in components.items():
        print(f"{component_label(name):<15}{score}/100")
    if positives:
        print()
        print("Positive drivers:")
        for item in positives:
            print(f"- {item}")
    if cautions:
        print()
        print("Caution drivers:")
        for item in cautions:
            print(f"- {item}")
    command_planned_today(conn, row["date"], compact=True)


def command_checkin(conn, args) -> None:
    db.upsert_checkin(
        conn,
        args.date,
        args.energy,
        args.mood,
        args.soreness,
        args.stress,
        1 if args.illness else 0,
        args.notes,
    )
    _mirror(conn, tables=["subjective_checkins"])
    command_score(conn)
    command_today(conn)


def command_report(conn, output: Path) -> None:
    from health_readiness.report import generate_report

    path = generate_report(conn, output)
    print(f"Generated {path}")


def command_strava_sync(conn, weeks: int) -> None:
    from health_readiness.strava_client import fetch_activities as fetch_strava_activities

    activities = fetch_strava_activities(weeks)
    count = db.upsert_strava_activities(conn, activities)
    print(f"Synced {count} Strava activities.")
    _mirror(conn, tables=["strava_activities"])


def command_intervals_sync(conn, weeks: int) -> None:
    from health_readiness.intervals_client import fetch_events_for_weeks

    events = fetch_events_for_weeks(weeks)
    count = db.upsert_planned_sessions(conn, events)
    print(f"Synced {count} planned Intervals sessions.")
    _mirror(conn, tables=["planned_sessions"])


def command_intervals_import(conn, path: Path) -> None:
    events = json.loads(path.read_text())
    if not isinstance(events, list):
        raise ValueError("Intervals import file must contain a JSON list.")
    count = db.upsert_planned_sessions(conn, events)
    print(f"Imported {count} planned sessions from {path}.")
    _mirror(conn, tables=["planned_sessions"])


def command_planned_today(conn, day: str, compact: bool = False) -> None:
    sessions = db.planned_sessions_for_day(conn, day)
    if not sessions:
        if not compact:
            print(f"No planned sessions found for {day}.")
        return

    print()
    print("Planned Sessions")
    print("-" * 34)
    for session in sessions:
        label = f"{session['type'] or 'Other'} - {session['name']}"
        print(label)
        description = (session["description"] or "").strip()
        if description:
            first_line = description.splitlines()[0]
            print(f"  {first_line}")


def command_morning(conn, weeks: int, skip_strava: bool, skip_intervals: bool, output: Path) -> None:
    print("Morning sync")
    print("=" * 34)
    command_sync(conn, weeks)
    if not skip_strava:
        try:
            command_strava_sync(conn, weeks)
        except Exception as exc:
            print(f"Strava sync skipped: {exc}", file=sys.stderr)
    if not skip_intervals:
        try:
            command_intervals_sync(conn, weeks)
        except Exception as exc:
            print(f"Intervals sync skipped: {exc}", file=sys.stderr)
    command_score(conn)
    command_report(conn, output)
    command_today(conn)


def command_insight(conn, target_date: str | None, model: str | None, dry_run: bool) -> None:
    if target_date:
        row = conn.execute(
            "SELECT r.*, d.avg_sleep_hrv, d.baseline, d.rhr, d.training_load, "
            "d.training_load_ratio, d.tired_rate, s.total_duration_minutes, "
            "s.awake_minutes, 0 as strava_count, 0 as strava_km, 0 as planned_count "
            "FROM readiness_scores r "
            "LEFT JOIN daily_metrics d ON d.date = r.date "
            "LEFT JOIN sleep_records s ON s.date = r.date "
            "WHERE r.date = ?",
            (target_date,),
        ).fetchone()
    else:
        row = db.latest_readiness(conn)

    if row is None:
        print("No readiness score found. Run `cli.py score` first.", file=sys.stderr)
        return

    today_summary = build_today_summary(conn, row)
    trend = build_trend(conn)
    planned = build_planned_session(conn, row["date"])
    last_checkin = build_last_checkin(conn, row["date"])
    completed_today = build_completed_today(conn, row["date"])

    context = {
        "date": row["date"],
        "today_summary": today_summary,
        "trend": trend,
        "planned_session": planned,
        "last_checkin": last_checkin,
        "completed_today": completed_today,
    }

    if dry_run:
        print(json.dumps(context, indent=2, default=str))
        return

    repos = make_repos()
    backend = CodexInsightBackend(model=model)
    print(f"Generating insight for {row['date']} via Codex CLI ...")
    result = generate_daily_insight(
        backend=backend,
        date=row["date"],
        today_summary=today_summary,
        trend=trend,
        planned_session=planned,
        last_checkin=last_checkin,
        completed_today=completed_today,
        repo=repos.ai_insights,
    )

    print()
    print(f"Insight for {row['date']} ({result.model}/{result.prompt_version})")
    print("=" * 48)
    payload = result.payload
    if payload.get("summary"):
        print(payload["summary"])
    for bullet in payload.get("talking_points") or []:
        print(f"- {bullet}")
    if payload.get("session_advice"):
        print()
        print(f"Session: {payload['session_advice']}")
    anomalies = payload.get("anomalies") or []
    if anomalies:
        print()
        print("Anomalies:")
        for item in anomalies:
            metric = item.get("metric", "?")
            note = item.get("note", "")
            print(f"- {metric}: {note}")


def command_poll(conn, *, loop: bool, interval: int) -> None:
    """Claim and dispatch jobs from Postgres `job_queue`.

    Default mode drains every currently-pending job then exits (suits a
    launchd `StartInterval` plist running every minute). `--loop` keeps the
    process alive for long-running shells.
    """
    import time

    from health_readiness.job_runner import run_once

    if not os.environ.get("DATABASE_URL"):
        print("poll: DATABASE_URL not set, nothing to do.", file=sys.stderr)
        return

    drained = 0
    while True:
        processed = run_once(conn)
        if processed:
            drained += 1
            continue
        if not loop:
            if drained == 0:
                print("poll: no pending jobs.")
            return
        time.sleep(max(1, interval))


def command_strava_summary(conn, limit: int) -> None:
    rows = db.strava_daily_summary(conn, limit)
    if not rows:
        print("No Strava activities found. Run strava-sync first.")
        return

    for row in rows:
        moving = int(row["strava_moving_seconds"] or 0)
        hours = moving // 3600
        minutes = (moving % 3600) // 60
        duration = f"{hours}h{minutes:02d}m" if hours else f"{minutes}m"
        load = row["coros_training_load"]
        load_text = f", Coros load {load}" if load is not None else ""
        print(
            f"{row['local_day']}: {row['strava_count']} Strava activities, "
            f"{row['strava_km']} km, {duration}{load_text}"
        )
        print(f"  Sports: {row['strava_sports']}")


def main() -> None:
    _load_env_file()
    args = parse_args()
    conn = db.connect(args.db)
    db.init_db(conn)

    if args.command == "sync":
        command_sync(conn, args.weeks)
        command_score(conn)
        command_today(conn)
    elif args.command == "morning":
        command_morning(conn, args.weeks, args.skip_strava, args.skip_intervals, args.output)
    elif args.command == "score":
        command_score(conn)
    elif args.command == "today":
        command_today(conn)
    elif args.command == "checkin":
        command_checkin(conn, args)
    elif args.command == "report":
        command_report(conn, args.output)
    elif args.command == "strava-sync":
        command_strava_sync(conn, args.weeks)
    elif args.command == "strava-summary":
        command_strava_summary(conn, args.limit)
    elif args.command == "intervals-sync":
        command_intervals_sync(conn, args.weeks)
    elif args.command == "intervals-import":
        command_intervals_import(conn, args.path)
    elif args.command == "planned-today":
        command_planned_today(conn, args.date)
    elif args.command == "insight":
        command_insight(conn, args.date, args.model, args.dry_run)
    elif args.command == "poll":
        command_poll(conn, loop=args.loop, interval=args.interval)


if __name__ == "__main__":
    main()
