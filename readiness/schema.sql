PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS daily_metrics (
  date TEXT PRIMARY KEY,
  avg_sleep_hrv REAL,
  baseline REAL,
  interval_list_json TEXT,
  rhr INTEGER,
  training_load INTEGER,
  training_load_ratio REAL,
  tired_rate REAL,
  ati REAL,
  cti REAL,
  performance INTEGER,
  distance REAL,
  duration INTEGER,
  vo2max INTEGER,
  lthr INTEGER,
  ltsp INTEGER,
  stamina_level REAL,
  stamina_level_7d REAL,
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sleep_records (
  date TEXT PRIMARY KEY,
  total_duration_minutes INTEGER,
  deep_minutes INTEGER,
  light_minutes INTEGER,
  rem_minutes INTEGER,
  awake_minutes INTEGER,
  nap_minutes INTEGER,
  avg_hr INTEGER,
  min_hr INTEGER,
  max_hr INTEGER,
  quality_score INTEGER,
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  activity_id TEXT PRIMARY KEY,
  name TEXT,
  sport_type INTEGER,
  sport_name TEXT,
  start_time TEXT,
  end_time TEXT,
  duration_seconds INTEGER,
  distance_meters REAL,
  avg_hr INTEGER,
  max_hr INTEGER,
  calories INTEGER,
  training_load INTEGER,
  avg_power INTEGER,
  normalized_power INTEGER,
  elevation_gain INTEGER,
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS strava_activities (
  activity_id TEXT PRIMARY KEY,
  name TEXT,
  sport_type TEXT,
  type TEXT,
  start_date TEXT,
  start_date_local TEXT,
  local_day TEXT,
  moving_time INTEGER,
  elapsed_time INTEGER,
  distance_meters REAL,
  elevation_gain REAL,
  average_hr REAL,
  max_hr REAL,
  average_watts REAL,
  weighted_average_watts REAL,
  suffer_score REAL,
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS planned_sessions (
  event_id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  start_date_local TEXT,
  type TEXT,
  name TEXT NOT NULL,
  description TEXT,
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subjective_checkins (
  date TEXT PRIMARY KEY,
  energy INTEGER,
  mood INTEGER,
  soreness INTEGER,
  stress INTEGER,
  illness INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS readiness_scores (
  date TEXT PRIMARY KEY,
  model_version TEXT NOT NULL DEFAULT 'v1',
  score INTEGER NOT NULL,
  status TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  confidence TEXT NOT NULL,
  component_scores_json TEXT NOT NULL,
  positive_drivers_json TEXT NOT NULL,
  caution_drivers_json TEXT NOT NULL,
  computed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  start_day TEXT,
  end_day TEXT,
  daily_count INTEGER DEFAULT 0,
  sleep_count INTEGER DEFAULT 0,
  activity_count INTEGER DEFAULT 0,
  error TEXT
);
