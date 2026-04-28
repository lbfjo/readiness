import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getPersistedDecision } from "@/lib/contracts/daily-decision";
import { getActiveIssue, getIssueCheckin } from "@/lib/contracts/issue";
import {
  aiInsights,
  intervalsActivities,
  plannedSessions,
  readinessScores,
  sleepRecords,
  subjectiveCheckins,
  syncRuns,
} from "@/lib/db/schema";
import type { SourceFreshness, TodaySummary } from "./types";

/**
 * Contract query for `/today`. Reads are all scoped to a single date so the
 * page stays fast and the caller can swap the "today" date for a historical
 * drilldown without rewriting anything.
 */
export async function getTodaySummary(date: string): Promise<TodaySummary> {
  const db = getDb();

  const [score, sleep, checkin, planned, intervalsTodayRows, activeIssue] = await Promise.all([
    db.select().from(readinessScores).where(eq(readinessScores.date, date)).limit(1),
    db.select().from(sleepRecords).where(eq(sleepRecords.date, date)).limit(1),
    db.select().from(subjectiveCheckins).where(eq(subjectiveCheckins.date, date)).limit(1),
    db.select().from(plannedSessions).where(eq(plannedSessions.date, date)),
    db
      .select({
        activityId: intervalsActivities.activityId,
        localDay: intervalsActivities.localDay,
        pairedEventId: intervalsActivities.pairedEventId,
        name: intervalsActivities.name,
        type: intervalsActivities.type,
        startDate: intervalsActivities.startDate,
        startDateLocal: intervalsActivities.startDateLocal,
        movingTime: intervalsActivities.movingTime,
        elapsedTime: intervalsActivities.elapsedTime,
        distanceMeters: intervalsActivities.distanceMeters,
        trainingLoad: intervalsActivities.trainingLoad,
        intensity: intervalsActivities.intensity,
        averageHr: intervalsActivities.averageHr,
        maxHr: intervalsActivities.maxHr,
        averageWatts: intervalsActivities.averageWatts,
        weightedAverageWatts: intervalsActivities.weightedAverageWatts,
        source: intervalsActivities.source,
      })
      .from(intervalsActivities)
      .where(eq(intervalsActivities.localDay, date)),
    safeGetActiveIssue(),
  ]);

  const intervalsToday = intervalsTodayRows.filter(isDisplayableIntervalsActivity);

  const insight = await db
    .select()
    .from(aiInsights)
    .where(eq(aiInsights.date, date))
    .orderBy(desc(aiInsights.createdAt))
    .limit(1);

  const freshness = await loadFreshness();
  const issueCheckin = activeIssue ? await safeGetIssueCheckin(activeIssue.id, date) : null;
  const decision = await safeGetPersistedDecision(date);

  return {
    date,
    score: score[0] ?? null,
    sleep: sleep[0] ?? null,
    checkin: checkin[0] ?? null,
    activeIssue,
    issueCheckin,
    plannedSessions: planned,
    intervalsToday,
    freshness,
    insight: insight[0] ?? null,
    decision,
  };
}

function isDisplayableIntervalsActivity(activity: {
  name: string | null;
  type: string | null;
  movingTime: number | null;
  elapsedTime: number | null;
  distanceMeters: number | null;
  trainingLoad: number | null;
  averageHr: number | null;
  source: string | null;
}) {
  const hasWorkoutData = Boolean(
    activity.name ||
      activity.type ||
      activity.movingTime ||
      activity.elapsedTime ||
      activity.distanceMeters ||
      activity.trainingLoad ||
      activity.averageHr,
  );

  // Intervals can emit placeholder STRAVA rows when detailed Strava activity
  // data is unavailable. Those are source markers, not completed workouts.
  if (!hasWorkoutData && activity.source?.toUpperCase() === "STRAVA") {
    return false;
  }

  return hasWorkoutData;
}

async function safeGetActiveIssue() {
  try {
    return await getActiveIssue();
  } catch {
    return null;
  }
}

async function safeGetPersistedDecision(date: string) {
  try {
    return await getPersistedDecision(date);
  } catch {
    return null;
  }
}

async function safeGetIssueCheckin(issueId: number, date: string) {
  try {
    return await getIssueCheckin(issueId, date);
  } catch {
    return null;
  }
}

async function loadFreshness(): Promise<SourceFreshness[]> {
  const db = getDb();
  const sources: SourceFreshness["source"][] = ["coros", "strava", "intervals"];
  const results: SourceFreshness[] = [];
  const isSuccess = (status: string) => ["ok", "success", "succeeded"].includes(status);

  for (const source of sources) {
    let rows = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.source, source))
      .orderBy(desc(syncRuns.startedAt))
      .limit(10);

    if (rows.length === 0) {
      rows = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(10);
    }

    const lastRun = rows[0] ?? null;
    const lastSuccess = rows.find((r) => isSuccess(r.status)) ?? null;

    results.push({
      source,
      lastRunAt: lastRun?.startedAt ? new Date(lastRun.startedAt).toISOString() : null,
      lastSuccessAt: lastSuccess?.finishedAt
        ? new Date(lastSuccess.finishedAt).toISOString()
        : null,
      latestImportedDate: lastSuccess?.endDay ?? null,
      lastError: lastRun && !isSuccess(lastRun.status) ? (lastRun.error ?? null) : null,
    });
  }

  return results;
}
