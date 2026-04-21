"""
Python mirror of the Drizzle schema in `readiness-web/lib/db/schema.ts`.

The TypeScript Drizzle definition is the source of truth; this module only
re-declares the same tables so Python code has typed Core tables to work
against. A `check_schema_drift` utility compares live Postgres introspection
against both definitions to catch drift.

Only the shape needed by repos is declared here. Raw JSON columns are kept as
`JSONB` on Postgres and `TEXT` on SQLite through SQLAlchemy's native dialect
handling.
"""

from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    Index,
    Integer,
    MetaData,
    PrimaryKeyConstraint,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData()


def _json():
    return JSONB().with_variant(Text(), "sqlite")


daily_metrics = Table(
    "daily_metrics",
    metadata,
    Column("date", Text, primary_key=True),
    Column("avg_sleep_hrv", Float),
    Column("baseline", Float),
    Column("interval_list_json", _json()),
    Column("rhr", Integer),
    Column("training_load", Integer),
    Column("training_load_ratio", Float),
    Column("tired_rate", Float),
    Column("ati", Float),
    Column("cti", Float),
    Column("performance", Integer),
    Column("distance", Float),
    Column("duration", Integer),
    Column("vo2max", Integer),
    Column("lthr", Integer),
    Column("ltsp", Integer),
    Column("stamina_level", Float),
    Column("stamina_level_7d", Float),
    Column("raw_json", _json(), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

sleep_records = Table(
    "sleep_records",
    metadata,
    Column("date", Text, primary_key=True),
    Column("total_duration_minutes", Integer),
    Column("deep_minutes", Integer),
    Column("light_minutes", Integer),
    Column("rem_minutes", Integer),
    Column("awake_minutes", Integer),
    Column("nap_minutes", Integer),
    Column("avg_hr", Integer),
    Column("min_hr", Integer),
    Column("max_hr", Integer),
    Column("quality_score", Integer),
    Column("raw_json", _json(), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

activities = Table(
    "activities",
    metadata,
    Column("activity_id", Text, primary_key=True),
    Column("name", Text),
    Column("sport_type", Integer),
    Column("sport_name", Text),
    Column("start_time", DateTime(timezone=True)),
    Column("end_time", DateTime(timezone=True)),
    Column("duration_seconds", Integer),
    Column("distance_meters", Float),
    Column("avg_hr", Integer),
    Column("max_hr", Integer),
    Column("calories", Integer),
    Column("training_load", Integer),
    Column("avg_power", Integer),
    Column("normalized_power", Integer),
    Column("elevation_gain", Integer),
    Column("raw_json", _json(), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

strava_activities = Table(
    "strava_activities",
    metadata,
    Column("activity_id", Text, primary_key=True),
    Column("name", Text),
    Column("sport_type", Text),
    Column("type", Text),
    Column("start_date", DateTime(timezone=True)),
    Column("start_date_local", DateTime(timezone=False)),
    Column("local_day", Text),
    Column("moving_time", Integer),
    Column("elapsed_time", Integer),
    Column("distance_meters", Float),
    Column("elevation_gain", Float),
    Column("average_hr", Float),
    Column("max_hr", Float),
    Column("average_watts", Float),
    Column("weighted_average_watts", Float),
    Column("suffer_score", Float),
    Column("raw_json", _json(), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
    Index("strava_activities_local_day_idx", "local_day"),
)

planned_sessions = Table(
    "planned_sessions",
    metadata,
    Column("event_id", Text, primary_key=True),
    Column("date", Text, nullable=False),
    Column("start_date_local", DateTime(timezone=False)),
    Column("type", Text),
    Column("name", Text, nullable=False),
    Column("description", Text),
    Column("raw_json", _json(), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
    Index("planned_sessions_date_idx", "date"),
)

subjective_checkins = Table(
    "subjective_checkins",
    metadata,
    Column("date", Text, primary_key=True),
    Column("energy", Integer),
    Column("mood", Integer),
    Column("soreness", Integer),
    Column("stress", Integer),
    Column("illness", Integer, default=0),
    Column("notes", Text),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

readiness_scores = Table(
    "readiness_scores",
    metadata,
    Column("date", Text, primary_key=True),
    Column("model_version", Text, nullable=False, default="v1"),
    Column("score", Integer, nullable=False),
    Column("status", Text, nullable=False),
    Column("recommendation", Text, nullable=False),
    Column("confidence", Text, nullable=False),
    Column("component_scores_json", _json(), nullable=False),
    Column("positive_drivers_json", _json(), nullable=False),
    Column("caution_drivers_json", _json(), nullable=False),
    Column("computed_at", DateTime(timezone=True), nullable=False),
)

sync_runs = Table(
    "sync_runs",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("source", Text, nullable=False),
    Column("started_at", DateTime(timezone=True), nullable=False),
    Column("finished_at", DateTime(timezone=True)),
    Column("status", Text, nullable=False),
    Column("start_day", Text),
    Column("end_day", Text),
    Column("daily_count", Integer, default=0),
    Column("sleep_count", Integer, default=0),
    Column("activity_count", Integer, default=0),
    Column("error", Text),
)

ai_insights = Table(
    "ai_insights",
    metadata,
    Column("date", Text, nullable=False),
    Column("prompt_version", Text, nullable=False),
    Column("model", Text, nullable=False),
    Column("summary", Text),
    Column("talking_points_json", _json()),
    Column("session_advice", Text),
    Column("anomalies_json", _json()),
    Column("tokens_in", Integer),
    Column("tokens_out", Integer),
    Column("raw_json", _json(), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    PrimaryKeyConstraint("date", "prompt_version", "model"),
    Index("ai_insights_date_idx", "date"),
)

settings = Table(
    "settings",
    metadata,
    Column("key", Text, primary_key=True),
    Column("value", _json(), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

job_queue = Table(
    "job_queue",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("kind", Text, nullable=False),
    Column("payload", _json(), nullable=False, default=dict),
    Column("status", Text, nullable=False, default="pending"),
    Column("attempts", Integer, nullable=False, default=0),
    Column("last_error", Text),
    Column("requested_by", Text),
    Column("requested_at", DateTime(timezone=True), nullable=False),
    Column("started_at", DateTime(timezone=True)),
    Column("finished_at", DateTime(timezone=True)),
    Column("is_terminal", Boolean, nullable=False, default=False),
    Index("job_queue_status_idx", "status"),
)

ALL_TABLES = (
    daily_metrics,
    sleep_records,
    activities,
    strava_activities,
    planned_sessions,
    subjective_checkins,
    readiness_scores,
    sync_runs,
    ai_insights,
    settings,
    job_queue,
)
