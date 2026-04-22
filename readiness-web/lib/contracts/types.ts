import type {
  ActiveIssue,
  AiInsight,
  IssueCheckin,
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
  activeIssue: ActiveIssue | null;
  issueCheckin: IssueCheckin | null;
  plannedSessions: PlannedSession[];
  stravaToday: StravaActivity[];
  freshness: SourceFreshness[];
  insight: AiInsight | null;
  decision: DailyDecision | null;
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
  issueId?: number;
  firstStepPain?: number;
  painWalking?: number;
  painStairs?: number;
  morningStiffnessMinutes?: number;
  limp?: boolean;
  warmupResponse?: "better" | "same" | "worse";
  issueNotes?: string;
};

export type DailyInsight = AiInsight;

export type DailyDecision = {
  issueArea: string;
  issueLabel: string;
  readinessBand: "green" | "yellow" | "red";
  tissueBand: "green" | "yellow" | "red";
  decision: "go_as_planned" | "reduce_load" | "swap_session" | "rehab_only";
  priority: "protect_tissue" | "maintain_consistency" | "progress_training";
  title: string;
  summary: string;
  reasonCodes: string[];
  reasons: string[];
  recommendedModification?: {
    replaceWith: string;
    durationMinutes?: number;
    intensity?: string;
    constraints?: string[];
  } | null;
  rehabToday?: {
    title: string;
    items: string[];
    avoid: string[];
  } | null;
  redFlags: string[];
};
