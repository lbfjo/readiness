from __future__ import annotations

import json
import statistics
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "readiness" / "data" / "readiness.sqlite"
SCHEMA = ROOT / "readiness" / "schema.sql"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(db_path: Path = DEFAULT_DB) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA.read_text())
    ensure_column(conn, "readiness_scores", "model_version", "TEXT NOT NULL DEFAULT 'v1'")
    ensure_column(conn, "sync_runs", "source", "TEXT NOT NULL DEFAULT 'cli'")
    conn.commit()


def ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def json_dumps(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def upsert_daily_metrics(conn: sqlite3.Connection, records: list[dict[str, Any]]) -> int:
    ts = now_iso()
    rows = []
    for item in records:
        rows.append((
            item.get("date"),
            item.get("avg_sleep_hrv"),
            item.get("baseline"),
            json_dumps(item.get("interval_list")),
            item.get("rhr"),
            item.get("training_load"),
            item.get("training_load_ratio"),
            item.get("tired_rate"),
            item.get("ati"),
            item.get("cti"),
            item.get("performance"),
            item.get("distance"),
            item.get("duration"),
            item.get("vo2max"),
            item.get("lthr"),
            item.get("ltsp"),
            item.get("stamina_level"),
            item.get("stamina_level_7d"),
            json_dumps(item),
            ts,
        ))

    conn.executemany(
        """
        INSERT INTO daily_metrics (
          date, avg_sleep_hrv, baseline, interval_list_json, rhr, training_load,
          training_load_ratio, tired_rate, ati, cti, performance, distance,
          duration, vo2max, lthr, ltsp, stamina_level, stamina_level_7d,
          raw_json, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          avg_sleep_hrv = excluded.avg_sleep_hrv,
          baseline = excluded.baseline,
          interval_list_json = excluded.interval_list_json,
          rhr = excluded.rhr,
          training_load = excluded.training_load,
          training_load_ratio = excluded.training_load_ratio,
          tired_rate = excluded.tired_rate,
          ati = excluded.ati,
          cti = excluded.cti,
          performance = excluded.performance,
          distance = excluded.distance,
          duration = excluded.duration,
          vo2max = excluded.vo2max,
          lthr = excluded.lthr,
          ltsp = excluded.ltsp,
          stamina_level = excluded.stamina_level,
          stamina_level_7d = excluded.stamina_level_7d,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at
        """,
        rows,
    )
    conn.commit()
    return len(rows)


def upsert_sleep_records(conn: sqlite3.Connection, records: list[dict[str, Any]]) -> int:
    ts = now_iso()
    rows = []
    for item in records:
        phases = item.get("phases") or {}
        rows.append((
            item.get("date"),
            item.get("total_duration_minutes"),
            phases.get("deep_minutes"),
            phases.get("light_minutes"),
            phases.get("rem_minutes"),
            phases.get("awake_minutes"),
            phases.get("nap_minutes"),
            item.get("avg_hr"),
            item.get("min_hr"),
            item.get("max_hr"),
            item.get("quality_score"),
            json_dumps(item),
            ts,
        ))

    conn.executemany(
        """
        INSERT INTO sleep_records (
          date, total_duration_minutes, deep_minutes, light_minutes, rem_minutes,
          awake_minutes, nap_minutes, avg_hr, min_hr, max_hr, quality_score,
          raw_json, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          total_duration_minutes = excluded.total_duration_minutes,
          deep_minutes = excluded.deep_minutes,
          light_minutes = excluded.light_minutes,
          rem_minutes = excluded.rem_minutes,
          awake_minutes = excluded.awake_minutes,
          nap_minutes = excluded.nap_minutes,
          avg_hr = excluded.avg_hr,
          min_hr = excluded.min_hr,
          max_hr = excluded.max_hr,
          quality_score = excluded.quality_score,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at
        """,
        rows,
    )
    conn.commit()
    return len(rows)


def upsert_activities(conn: sqlite3.Connection, records: list[dict[str, Any]]) -> int:
    ts = now_iso()
    rows = []
    for item in records:
        rows.append((
            item.get("activity_id"),
            item.get("name"),
            item.get("sport_type"),
            item.get("sport_name"),
            item.get("start_time"),
            item.get("end_time"),
            item.get("duration_seconds"),
            item.get("distance_meters"),
            item.get("avg_hr"),
            item.get("max_hr"),
            item.get("calories"),
            item.get("training_load"),
            item.get("avg_power"),
            item.get("normalized_power"),
            item.get("elevation_gain"),
            json_dumps(item),
            ts,
        ))

    conn.executemany(
        """
        INSERT INTO activities (
          activity_id, name, sport_type, sport_name, start_time, end_time,
          duration_seconds, distance_meters, avg_hr, max_hr, calories,
          training_load, avg_power, normalized_power, elevation_gain,
          raw_json, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(activity_id) DO UPDATE SET
          name = excluded.name,
          sport_type = excluded.sport_type,
          sport_name = excluded.sport_name,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          duration_seconds = excluded.duration_seconds,
          distance_meters = excluded.distance_meters,
          avg_hr = excluded.avg_hr,
          max_hr = excluded.max_hr,
          calories = excluded.calories,
          training_load = excluded.training_load,
          avg_power = excluded.avg_power,
          normalized_power = excluded.normalized_power,
          elevation_gain = excluded.elevation_gain,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at
        """,
        rows,
    )
    conn.commit()
    return len(rows)


def upsert_strava_activities(conn: sqlite3.Connection, records: list[dict[str, Any]]) -> int:
    from health_readiness.strava_client import local_day

    ts = now_iso()
    rows = []
    for item in records:
        rows.append((
            str(item.get("id")),
            item.get("name"),
            item.get("sport_type"),
            item.get("type"),
            item.get("start_date"),
            item.get("start_date_local"),
            local_day(item),
            item.get("moving_time"),
            item.get("elapsed_time"),
            item.get("distance"),
            item.get("total_elevation_gain"),
            item.get("average_heartrate"),
            item.get("max_heartrate"),
            item.get("average_watts"),
            item.get("weighted_average_watts"),
            item.get("suffer_score"),
            json_dumps(item),
            ts,
        ))

    conn.executemany(
        """
        INSERT INTO strava_activities (
          activity_id, name, sport_type, type, start_date, start_date_local,
          local_day, moving_time, elapsed_time, distance_meters, elevation_gain,
          average_hr, max_hr, average_watts, weighted_average_watts, suffer_score,
          raw_json, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(activity_id) DO UPDATE SET
          name = excluded.name,
          sport_type = excluded.sport_type,
          type = excluded.type,
          start_date = excluded.start_date,
          start_date_local = excluded.start_date_local,
          local_day = excluded.local_day,
          moving_time = excluded.moving_time,
          elapsed_time = excluded.elapsed_time,
          distance_meters = excluded.distance_meters,
          elevation_gain = excluded.elevation_gain,
          average_hr = excluded.average_hr,
          max_hr = excluded.max_hr,
          average_watts = excluded.average_watts,
          weighted_average_watts = excluded.weighted_average_watts,
          suffer_score = excluded.suffer_score,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at
        """,
        rows,
    )
    conn.commit()
    return len(rows)


def upsert_planned_sessions(conn: sqlite3.Connection, records: list[dict[str, Any]]) -> int:
    from health_readiness.intervals_client import local_day

    # Only persist real workouts — skip TARGET (weekly volume placeholders)
    # and NOTE (calendar labels). The "category" field from the Intervals.icu
    # API is the authoritative discriminator.
    records = [r for r in records if r.get("category") == "WORKOUT"]

    ts = now_iso()
    rows = []
    for item in records:
        start_date_local = item.get("start_date_local") or item.get("start_date")
        event_id = item.get("id")
        if not event_id:
            continue
        rows.append((
            str(event_id),
            local_day(start_date_local),
            start_date_local,
            item.get("type"),
            item.get("name") or "Planned session",
            item.get("description"),
            json_dumps(item),
            ts,
        ))

    conn.executemany(
        """
        INSERT INTO planned_sessions (
          event_id, date, start_date_local, type, name, description, raw_json, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
          date = excluded.date,
          start_date_local = excluded.start_date_local,
          type = excluded.type,
          name = excluded.name,
          description = excluded.description,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at
        """,
        rows,
    )
    conn.commit()
    return len(rows)


def _intervals_date(value: str | None) -> str | None:
    if not value:
        return None
    return value[:10].replace("-", "")


def _as_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def upsert_intervals_activities(conn: sqlite3.Connection, records: list[dict[str, Any]]) -> int:
    from health_readiness.intervals_client import local_day

    ts = now_iso()
    rows = []
    for item in records:
        activity_id = item.get("id")
        if not activity_id:
            continue
        start_date_local = item.get("start_date_local") or item.get("start_date")
        paired_event_id = item.get("paired_event_id")
        rows.append((
            str(activity_id),
            local_day(start_date_local),
            str(paired_event_id) if paired_event_id is not None else None,
            item.get("name"),
            item.get("type"),
            item.get("start_date"),
            start_date_local,
            _as_int(item.get("moving_time")),
            _as_int(item.get("elapsed_time")),
            _as_float(item.get("icu_distance") if item.get("icu_distance") is not None else item.get("distance")),
            _as_int(item.get("icu_training_load")),
            _as_float(item.get("icu_intensity")),
            _as_float(item.get("average_heartrate")),
            _as_float(item.get("max_heartrate")),
            _as_float(item.get("icu_average_watts") if item.get("icu_average_watts") is not None else item.get("average_watts")),
            _as_float(item.get("icu_weighted_avg_watts") if item.get("icu_weighted_avg_watts") is not None else item.get("weighted_average_watts")),
            item.get("source"),
            json_dumps(item),
            ts,
        ))

    conn.executemany(
        """
        INSERT INTO intervals_activities (
          activity_id, local_day, paired_event_id, name, type, start_date,
          start_date_local, moving_time, elapsed_time, distance_meters,
          training_load, intensity, average_hr, max_hr, average_watts,
          weighted_average_watts, source, raw_json, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(activity_id) DO UPDATE SET
          local_day = excluded.local_day,
          paired_event_id = excluded.paired_event_id,
          name = excluded.name,
          type = excluded.type,
          start_date = excluded.start_date,
          start_date_local = excluded.start_date_local,
          moving_time = excluded.moving_time,
          elapsed_time = excluded.elapsed_time,
          distance_meters = excluded.distance_meters,
          training_load = excluded.training_load,
          intensity = excluded.intensity,
          average_hr = excluded.average_hr,
          max_hr = excluded.max_hr,
          average_watts = excluded.average_watts,
          weighted_average_watts = excluded.weighted_average_watts,
          source = excluded.source,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at
        """,
        rows,
    )
    conn.commit()
    return len(rows)


def _intervals_load_ratio(atl: Any, ctl: Any) -> float | None:
    atl_f = _as_float(atl)
    ctl_f = _as_float(ctl)
    if atl_f is None or ctl_f is None or ctl_f == 0:
        return None
    return atl_f / ctl_f


def upsert_intervals_wellness(conn: sqlite3.Connection, records: list[dict[str, Any]]) -> dict[str, int]:
    """Map Intervals wellness rows into the current scoring tables.

    This is a transition adapter. Intervals is the hosted source, while the
    scoring engine still reads the older `daily_metrics` and `sleep_records`
    shapes. Raw Intervals rows are preserved in both tables for later remapping.
    """
    ts = now_iso()
    daily_rows = []
    sleep_rows = []

    for item in records:
        day = _intervals_date(item.get("id"))
        if not day:
            continue

        atl = item.get("atl")
        ctl = item.get("ctl")
        hrv = item.get("hrv") if item.get("hrv") is not None else item.get("hrvSDNN")
        sleep_secs = _as_int(item.get("sleepSecs"))
        sleep_minutes = sleep_secs // 60 if sleep_secs is not None else None
        tired_rate = None
        atl_f = _as_float(atl)
        ctl_f = _as_float(ctl)
        if atl_f is not None and ctl_f is not None:
            tired_rate = atl_f - ctl_f

        daily_rows.append((
            day,
            _as_float(hrv),
            None,
            json_dumps(item.get("sportInfo") or []),
            _as_int(item.get("restingHR")),
            _as_int(item.get("atlLoad") if item.get("atlLoad") is not None else item.get("ctlLoad")),
            _intervals_load_ratio(atl, ctl),
            tired_rate,
            _as_float(atl),
            _as_float(ctl),
            _as_int(item.get("readiness")),
            None,
            None,
            _as_int(item.get("vo2max")),
            None,
            None,
            None,
            None,
            json_dumps(item),
            ts,
        ))

        if any(item.get(k) is not None for k in ("sleepSecs", "avgSleepingHR", "sleepScore", "sleepQuality")):
            sleep_rows.append((
                day,
                sleep_minutes,
                None,
                None,
                None,
                None,
                None,
                _as_int(item.get("avgSleepingHR")),
                None,
                None,
                _as_int(item.get("sleepScore") if item.get("sleepScore") is not None else item.get("sleepQuality")),
                json_dumps(item),
                ts,
            ))

    conn.executemany(
        """
        INSERT INTO daily_metrics (
          date, avg_sleep_hrv, baseline, interval_list_json, rhr, training_load,
          training_load_ratio, tired_rate, ati, cti, performance, distance,
          duration, vo2max, lthr, ltsp, stamina_level, stamina_level_7d,
          raw_json, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          avg_sleep_hrv = COALESCE(excluded.avg_sleep_hrv, daily_metrics.avg_sleep_hrv),
          baseline = COALESCE(daily_metrics.baseline, excluded.baseline),
          interval_list_json = excluded.interval_list_json,
          rhr = COALESCE(excluded.rhr, daily_metrics.rhr),
          training_load = COALESCE(excluded.training_load, daily_metrics.training_load),
          training_load_ratio = COALESCE(excluded.training_load_ratio, daily_metrics.training_load_ratio),
          tired_rate = COALESCE(excluded.tired_rate, daily_metrics.tired_rate),
          ati = COALESCE(excluded.ati, daily_metrics.ati),
          cti = COALESCE(excluded.cti, daily_metrics.cti),
          performance = COALESCE(excluded.performance, daily_metrics.performance),
          distance = COALESCE(excluded.distance, daily_metrics.distance),
          duration = COALESCE(excluded.duration, daily_metrics.duration),
          vo2max = COALESCE(excluded.vo2max, daily_metrics.vo2max),
          lthr = COALESCE(excluded.lthr, daily_metrics.lthr),
          ltsp = COALESCE(excluded.ltsp, daily_metrics.ltsp),
          stamina_level = COALESCE(excluded.stamina_level, daily_metrics.stamina_level),
          stamina_level_7d = COALESCE(excluded.stamina_level_7d, daily_metrics.stamina_level_7d),
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at
        """,
        daily_rows,
    )

    conn.executemany(
        """
        INSERT INTO sleep_records (
          date, total_duration_minutes, deep_minutes, light_minutes, rem_minutes,
          awake_minutes, nap_minutes, avg_hr, min_hr, max_hr, quality_score,
          raw_json, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          total_duration_minutes = COALESCE(excluded.total_duration_minutes, sleep_records.total_duration_minutes),
          deep_minutes = COALESCE(excluded.deep_minutes, sleep_records.deep_minutes),
          light_minutes = COALESCE(excluded.light_minutes, sleep_records.light_minutes),
          rem_minutes = COALESCE(excluded.rem_minutes, sleep_records.rem_minutes),
          awake_minutes = COALESCE(excluded.awake_minutes, sleep_records.awake_minutes),
          nap_minutes = COALESCE(excluded.nap_minutes, sleep_records.nap_minutes),
          avg_hr = COALESCE(excluded.avg_hr, sleep_records.avg_hr),
          min_hr = COALESCE(excluded.min_hr, sleep_records.min_hr),
          max_hr = COALESCE(excluded.max_hr, sleep_records.max_hr),
          quality_score = COALESCE(excluded.quality_score, sleep_records.quality_score),
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at
        """,
        sleep_rows,
    )
    conn.commit()
    return {"daily": len(daily_rows), "sleep": len(sleep_rows)}


def planned_sessions_for_day(conn: sqlite3.Connection, day: str) -> list[sqlite3.Row]:
    return list(conn.execute(
        """
        SELECT *
        FROM planned_sessions
        WHERE date = ?
        ORDER BY start_date_local, name
        """,
        (day,),
    ))


def strava_daily_summary(conn: sqlite3.Connection, limit: int = 14) -> list[sqlite3.Row]:
    return list(conn.execute(
        """
        SELECT
          s.local_day,
          COUNT(*) AS strava_count,
          ROUND(SUM(COALESCE(s.distance_meters, 0)) / 1000.0, 2) AS strava_km,
          SUM(COALESCE(s.moving_time, 0)) AS strava_moving_seconds,
          GROUP_CONCAT(COALESCE(s.sport_type, s.type), ', ') AS strava_sports,
          d.training_load AS coros_training_load,
          d.training_load_ratio AS coros_load_ratio,
          d.tired_rate AS coros_tired_rate
        FROM strava_activities s
        LEFT JOIN daily_metrics d ON d.date = s.local_day
        WHERE s.local_day IS NOT NULL
        GROUP BY s.local_day
        ORDER BY s.local_day DESC
        LIMIT ?
        """,
        (limit,),
    ))


def create_sync_run(
    conn: sqlite3.Connection,
    start_day: str,
    end_day: str,
    source: str = "coros",
) -> int:
    cur = conn.execute(
        """
        INSERT INTO sync_runs (source, started_at, status, start_day, end_day)
        VALUES (?, ?, 'running', ?, ?)
        """,
        (source, now_iso(), start_day, end_day),
    )
    conn.commit()
    return int(cur.lastrowid)


def finish_sync_run(
    conn: sqlite3.Connection,
    sync_id: int,
    status: str,
    daily_count: int = 0,
    sleep_count: int = 0,
    activity_count: int = 0,
    error: str | None = None,
) -> None:
    conn.execute(
        """
        UPDATE sync_runs
        SET finished_at = ?, status = ?, daily_count = ?, sleep_count = ?,
            activity_count = ?, error = ?
        WHERE id = ?
        """,
        (now_iso(), status, daily_count, sleep_count, activity_count, error, sync_id),
    )
    conn.commit()


def load_scoring_rows(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return list(conn.execute(
        """
        SELECT
          d.*,
          s.total_duration_minutes,
          s.deep_minutes,
          s.light_minutes,
          s.rem_minutes,
          s.awake_minutes,
          s.nap_minutes,
          s.avg_hr AS sleep_avg_hr,
          c.energy,
          c.mood,
          c.soreness,
          c.stress,
          c.illness,
          c.notes
        FROM daily_metrics d
        LEFT JOIN sleep_records s ON s.date = d.date
        LEFT JOIN subjective_checkins c ON c.date = d.date
        ORDER BY d.date
        """
    ))


def save_readiness_scores(conn: sqlite3.Connection, scores: list[dict[str, Any]]) -> int:
    rows = [
        (
            item["date"],
            item.get("model_version", "v1"),
            item["score"],
            item["status"],
            item["recommendation"],
            item["confidence"],
            json_dumps(item["component_scores"]),
            json_dumps(item["positive_drivers"]),
            json_dumps(item["caution_drivers"]),
            now_iso(),
        )
        for item in scores
    ]
    conn.executemany(
        """
        INSERT INTO readiness_scores (
          date, model_version, score, status, recommendation, confidence,
          component_scores_json, positive_drivers_json, caution_drivers_json, computed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          model_version = excluded.model_version,
          score = excluded.score,
          status = excluded.status,
          recommendation = excluded.recommendation,
          confidence = excluded.confidence,
          component_scores_json = excluded.component_scores_json,
          positive_drivers_json = excluded.positive_drivers_json,
          caution_drivers_json = excluded.caution_drivers_json,
          computed_at = excluded.computed_at
        """,
        rows,
    )
    conn.commit()
    return len(rows)


def latest_readiness(conn: sqlite3.Connection) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT
          r.*,
          d.avg_sleep_hrv,
          d.baseline,
          d.rhr,
          d.training_load,
          d.training_load_ratio,
          d.tired_rate,
          s.total_duration_minutes,
          s.awake_minutes,
          sd.strava_count,
          sd.strava_km,
          ps.planned_count
        FROM readiness_scores r
        LEFT JOIN daily_metrics d ON d.date = r.date
        LEFT JOIN sleep_records s ON s.date = r.date
        LEFT JOIN (
          SELECT
            local_day,
            COUNT(*) AS strava_count,
            ROUND(SUM(COALESCE(distance_meters, 0)) / 1000.0, 2) AS strava_km
          FROM strava_activities
          WHERE local_day IS NOT NULL
          GROUP BY local_day
        ) sd ON sd.local_day = r.date
        LEFT JOIN (
          SELECT date, COUNT(*) AS planned_count
          FROM planned_sessions
          GROUP BY date
        ) ps ON ps.date = r.date
        ORDER BY r.date DESC
        LIMIT 1
        """
    ).fetchone()


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    return float(statistics.median(values))


def latest_baselines(conn: sqlite3.Connection, date: str, window: int = 14) -> dict[str, Any]:
    rows = list(conn.execute(
        """
        SELECT
          d.date,
          d.avg_sleep_hrv,
          d.baseline,
          d.rhr,
          d.training_load,
          d.training_load_ratio,
          d.tired_rate,
          s.total_duration_minutes,
          s.awake_minutes
        FROM daily_metrics d
        LEFT JOIN sleep_records s ON s.date = d.date
        WHERE d.date < ?
        ORDER BY d.date DESC
        LIMIT ?
        """,
        (date, window),
    ))
    def nums(key: str) -> list[float]:
        out = []
        for row in rows:
            value = row[key]
            if value is not None:
                out.append(float(value))
        return out

    def avg(key: str) -> float | None:
        values = nums(key)
        if not values:
            return None
        return sum(values) / len(values)

    return {
        "rhr_median": _median(nums("rhr")),
        "sleep_avg": avg("total_duration_minutes"),
        "hrv_avg": avg("avg_sleep_hrv"),
        "load_ratio_avg": avg("training_load_ratio"),
        "training_load_avg": avg("training_load"),
    }


def readiness_history(conn: sqlite3.Connection, limit: int = 30) -> list[sqlite3.Row]:
    return list(conn.execute(
        """
        WITH strava_daily AS (
          SELECT
            local_day,
            COUNT(*) AS strava_count,
            ROUND(SUM(COALESCE(distance_meters, 0)) / 1000.0, 2) AS strava_km
          FROM strava_activities
          WHERE local_day IS NOT NULL
          GROUP BY local_day
        )
        SELECT
          r.*,
          d.avg_sleep_hrv,
          d.baseline,
          d.rhr,
          d.training_load,
          d.training_load_ratio,
          d.tired_rate,
          s.total_duration_minutes,
          s.awake_minutes,
          sd.strava_count,
          sd.strava_km,
          ps.planned_count
        FROM readiness_scores r
        LEFT JOIN daily_metrics d ON d.date = r.date
        LEFT JOIN sleep_records s ON s.date = r.date
        LEFT JOIN strava_daily sd ON sd.local_day = r.date
        LEFT JOIN (
          SELECT date, COUNT(*) AS planned_count
          FROM planned_sessions
          GROUP BY date
        ) ps ON ps.date = r.date
        ORDER BY r.date DESC
        LIMIT ?
        """,
        (limit,),
    ))


def upsert_checkin(
    conn: sqlite3.Connection,
    date: str,
    energy: int | None,
    mood: int | None,
    soreness: int | None,
    stress: int | None,
    illness: int,
    notes: str | None,
) -> None:
    ts = now_iso()
    conn.execute(
        """
        INSERT INTO subjective_checkins (
          date, energy, mood, soreness, stress, illness, notes, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          energy = excluded.energy,
          mood = excluded.mood,
          soreness = excluded.soreness,
          stress = excluded.stress,
          illness = excluded.illness,
          notes = excluded.notes,
          updated_at = excluded.updated_at
        """,
        (date, energy, mood, soreness, stress, illness, notes, ts, ts),
    )
    conn.commit()
