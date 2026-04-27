import {
  pgTable,
  text,
  integer,
  doublePrecision,
  timestamp,
  jsonb,
  boolean,
  bigserial,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

/**
 * Source of truth for the Readiness schema. Mirrors the historical SQLite
 * `schema.sql` plus three new POC-era tables (`ai_insights`, `settings`,
 * `job_queue`). Python reads/writes the same tables via SQLAlchemy.
 */

export const dailyMetrics = pgTable("daily_metrics", {
  date: text("date").primaryKey(),
  avgSleepHrv: doublePrecision("avg_sleep_hrv"),
  baseline: doublePrecision("baseline"),
  intervalListJson: jsonb("interval_list_json"),
  rhr: integer("rhr"),
  trainingLoad: integer("training_load"),
  trainingLoadRatio: doublePrecision("training_load_ratio"),
  tiredRate: doublePrecision("tired_rate"),
  ati: doublePrecision("ati"),
  cti: doublePrecision("cti"),
  performance: integer("performance"),
  distance: doublePrecision("distance"),
  duration: integer("duration"),
  vo2max: integer("vo2max"),
  lthr: integer("lthr"),
  ltsp: integer("ltsp"),
  staminaLevel: doublePrecision("stamina_level"),
  staminaLevel7d: doublePrecision("stamina_level_7d"),
  rawJson: jsonb("raw_json").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const sleepRecords = pgTable("sleep_records", {
  date: text("date").primaryKey(),
  totalDurationMinutes: integer("total_duration_minutes"),
  deepMinutes: integer("deep_minutes"),
  lightMinutes: integer("light_minutes"),
  remMinutes: integer("rem_minutes"),
  awakeMinutes: integer("awake_minutes"),
  napMinutes: integer("nap_minutes"),
  avgHr: integer("avg_hr"),
  minHr: integer("min_hr"),
  maxHr: integer("max_hr"),
  qualityScore: integer("quality_score"),
  rawJson: jsonb("raw_json").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const activities = pgTable("activities", {
  activityId: text("activity_id").primaryKey(),
  name: text("name"),
  sportType: integer("sport_type"),
  sportName: text("sport_name"),
  startTime: timestamp("start_time", { withTimezone: true }),
  endTime: timestamp("end_time", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
  distanceMeters: doublePrecision("distance_meters"),
  avgHr: integer("avg_hr"),
  maxHr: integer("max_hr"),
  calories: integer("calories"),
  trainingLoad: integer("training_load"),
  avgPower: integer("avg_power"),
  normalizedPower: integer("normalized_power"),
  elevationGain: integer("elevation_gain"),
  rawJson: jsonb("raw_json").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const stravaActivities = pgTable(
  "strava_activities",
  {
    activityId: text("activity_id").primaryKey(),
    name: text("name"),
    sportType: text("sport_type"),
    type: text("type"),
    startDate: timestamp("start_date", { withTimezone: true }),
    startDateLocal: timestamp("start_date_local", { withTimezone: false }),
    localDay: text("local_day"),
    movingTime: integer("moving_time"),
    elapsedTime: integer("elapsed_time"),
    distanceMeters: doublePrecision("distance_meters"),
    elevationGain: doublePrecision("elevation_gain"),
    averageHr: doublePrecision("average_hr"),
    maxHr: doublePrecision("max_hr"),
    averageWatts: doublePrecision("average_watts"),
    weightedAverageWatts: doublePrecision("weighted_average_watts"),
    sufferScore: doublePrecision("suffer_score"),
    rawJson: jsonb("raw_json").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    localDayIdx: index("strava_activities_local_day_idx").on(t.localDay),
  }),
);

export const plannedSessions = pgTable(
  "planned_sessions",
  {
    eventId: text("event_id").primaryKey(),
    date: text("date").notNull(),
    startDateLocal: timestamp("start_date_local", { withTimezone: false }),
    type: text("type"),
    name: text("name").notNull(),
    description: text("description"),
    rawJson: jsonb("raw_json").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    dateIdx: index("planned_sessions_date_idx").on(t.date),
  }),
);

export const intervalsActivities = pgTable(
  "intervals_activities",
  {
    activityId: text("activity_id").primaryKey(),
    localDay: text("local_day"),
    pairedEventId: text("paired_event_id"),
    name: text("name"),
    type: text("type"),
    startDate: timestamp("start_date", { withTimezone: true }),
    startDateLocal: timestamp("start_date_local", { withTimezone: false }),
    movingTime: integer("moving_time"),
    elapsedTime: integer("elapsed_time"),
    distanceMeters: doublePrecision("distance_meters"),
    trainingLoad: integer("training_load"),
    intensity: doublePrecision("intensity"),
    averageHr: doublePrecision("average_hr"),
    maxHr: doublePrecision("max_hr"),
    averageWatts: doublePrecision("average_watts"),
    weightedAverageWatts: doublePrecision("weighted_average_watts"),
    source: text("source"),
    rawJson: jsonb("raw_json").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    localDayIdx: index("intervals_activities_local_day_idx").on(t.localDay),
    pairedEventIdx: index("intervals_activities_paired_event_idx").on(t.pairedEventId),
  }),
);

export const subjectiveCheckins = pgTable("subjective_checkins", {
  date: text("date").primaryKey(),
  energy: integer("energy"),
  mood: integer("mood"),
  soreness: integer("soreness"),
  stress: integer("stress"),
  illness: integer("illness").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const activeIssues = pgTable(
  "active_issues",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    slug: text("slug"),
    area: text("area").notNull(),
    subtype: text("subtype"),
    label: text("label").notNull(),
    side: text("side"),
    status: text("status").notNull(),
    stage: text("stage").notNull(),
    suspectedIssue: text("suspected_issue"),
    triggerMovementsJson: jsonb("trigger_movements_json"),
    aggravatorsJson: jsonb("aggravators_json"),
    relieversJson: jsonb("relievers_json"),
    notes: text("notes"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    statusIdx: index("active_issues_status_idx").on(t.status),
    areaIdx: index("active_issues_area_idx").on(t.area),
  }),
);

export const issueCheckins = pgTable(
  "issue_checkins",
  {
    issueId: integer("issue_id").notNull(),
    date: text("date").notNull(),
    firstStepPain: integer("first_step_pain"),
    painWalking: integer("pain_walking"),
    painStairs: integer("pain_stairs"),
    painDuringActivity: integer("pain_during_activity"),
    painAfterActivity: integer("pain_after_activity"),
    morningStiffnessMinutes: integer("morning_stiffness_minutes"),
    limp: boolean("limp").default(false),
    warmupResponse: text("warmup_response"),
    mechanicsChanged: boolean("mechanics_changed").default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.issueId, t.date] }),
    dateIdx: index("issue_checkins_date_idx").on(t.date),
  }),
);

export const readinessScores = pgTable("readiness_scores", {
  date: text("date").primaryKey(),
  modelVersion: text("model_version").notNull().default("v1"),
  score: integer("score").notNull(),
  status: text("status").notNull(),
  recommendation: text("recommendation").notNull(),
  confidence: text("confidence").notNull(),
  componentScoresJson: jsonb("component_scores_json").notNull(),
  positiveDriversJson: jsonb("positive_drivers_json").notNull(),
  cautionDriversJson: jsonb("caution_drivers_json").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
});

export const dailyDecisions = pgTable("daily_decisions", {
  date: text("date").primaryKey(),
  rulesVersion: text("rules_version").notNull(),
  readinessBand: text("readiness_band"),
  tissueBand: text("tissue_band"),
  primaryGoal: text("primary_goal"),
  limiter: text("limiter"),
  priority: text("priority").notNull(),
  decision: text("decision").notNull(),
  reasonCodesJson: jsonb("reason_codes_json").notNull(),
  recommendedModificationJson: jsonb("recommended_modification_json"),
  rehabPrescriptionJson: jsonb("rehab_prescription_json"),
  redFlagsJson: jsonb("red_flags_json"),
  rawJson: jsonb("raw_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const syncRuns = pgTable("sync_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  source: text("source").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull(),
  startDay: text("start_day"),
  endDay: text("end_day"),
  dailyCount: integer("daily_count").default(0),
  sleepCount: integer("sleep_count").default(0),
  activityCount: integer("activity_count").default(0),
  error: text("error"),
});

export const aiInsights = pgTable(
  "ai_insights",
  {
    date: text("date").notNull(),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    summary: text("summary"),
    talkingPointsJson: jsonb("talking_points_json"),
    sessionAdvice: text("session_advice"),
    anomaliesJson: jsonb("anomalies_json"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    rawJson: jsonb("raw_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.date, t.promptVersion, t.model] }),
    dateIdx: index("ai_insights_date_idx").on(t.date),
  }),
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/**
 * Web-to-laptop command queue. The web app inserts a row; the local Python
 * poller consumes pending rows, runs the command, and updates status.
 */
export const jobQueue = pgTable(
  "job_queue",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    requestedBy: text("requested_by"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    isTerminal: boolean("is_terminal").notNull().default(false),
  },
  (t) => ({
    statusIdx: index("job_queue_status_idx").on(t.status),
  }),
);

export type DailyMetric = typeof dailyMetrics.$inferSelect;
export type SleepRecord = typeof sleepRecords.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type StravaActivity = typeof stravaActivities.$inferSelect;
export type PlannedSession = typeof plannedSessions.$inferSelect;
export type IntervalsActivity = typeof intervalsActivities.$inferSelect;
export type SubjectiveCheckin = typeof subjectiveCheckins.$inferSelect;
export type ActiveIssue = typeof activeIssues.$inferSelect;
export type IssueCheckin = typeof issueCheckins.$inferSelect;
export type ReadinessScore = typeof readinessScores.$inferSelect;
export type DailyDecisionRow = typeof dailyDecisions.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
export type AiInsight = typeof aiInsights.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type JobQueueRow = typeof jobQueue.$inferSelect;
