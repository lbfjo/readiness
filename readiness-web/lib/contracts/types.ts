import type {
  AiInsight,
  PlannedSession,
  ReadinessScore,
  SleepRecord,
  StravaActivity,
  SubjectiveCheckin,
  SyncRun,
} from "@/lib/db/schema";

export type SourceFreshness = {
  source: "coros" | "strava" | "intervals";
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  latestImportedDate: string | null;
  lastError: string | null;
};

export type TodaySummary = {
  date: string;
  score: ReadinessScore | null;
  sleep: SleepRecord | null;
  checkin: SubjectiveCheckin | null;
  plannedSessions: PlannedSession[];
  stravaToday: StravaActivity[];
  freshness: SourceFreshness[];
  insight: AiInsight | null;
};

export type HistoryPoint = {
  date: string;
  score: number | null;
  status: string | null;
  hrv: number | null;
  rhr: number | null;
  sleepHours: number | null;
  trainingLoad: number | null;
  trainingLoadRatio: number | null;
};

export type HistorySummary = {
  range: "7d" | "30d" | "90d";
  points: HistoryPoint[];
};

export type IntegrationStatus = {
  sources: SourceFreshness[];
  recentRuns: SyncRun[];
};

export type CheckinPayload = {
  date: string;
  energy?: number;
  mood?: number;
  soreness?: number;
  stress?: number;
  illness?: number;
  notes?: string;
};

export type DailyInsight = AiInsight;
