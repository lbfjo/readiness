import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buildDailyDecision } from "@/lib/decision-support/engine";
import { getActiveIssue, getIssueCheckin } from "@/lib/contracts/issue";
import {
  aiInsights,
  plannedSessions,
  readinessScores,
  sleepRecords,
  stravaActivities,
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

  const [score, sleep, checkin, planned, strava, activeIssue] = await Promise.all([
    db.select().from(readinessScores).where(eq(readinessScores.date, date)).limit(1),
    db.select().from(sleepRecords).where(eq(sleepRecords.date, date)).limit(1),
    db.select().from(subjectiveCheckins).where(eq(subjectiveCheckins.date, date)).limit(1),
    db.select().from(plannedSessions).where(eq(plannedSessions.date, date)),
    db.select().from(stravaActivities).where(eq(stravaActivities.localDay, date)),
    safeGetActiveIssue(),
  ]);

  const insight = await db
    .select()
    .from(aiInsights)
    .where(eq(aiInsights.date, date))
    .orderBy(desc(aiInsights.createdAt))
    .limit(1);

  const freshness = await loadFreshness();
  const issueCheckin = activeIssue ? await safeGetIssueCheckin(activeIssue.id, date) : null;
  const decision = buildDailyDecision({
    issue: activeIssue,
    issueCheckin,
    planned,
    score: score[0] ?? null,
    checkin: checkin[0] ?? null,
  });

  return {
    date,
    score: score[0] ?? null,
    sleep: sleep[0] ?? null,
    checkin: checkin[0] ?? null,
    activeIssue,
    issueCheckin,
    plannedSessions: planned,
    stravaToday: strava,
    freshness,
    insight: insight[0] ?? null,
    decision,
  };
}

async function safeGetActiveIssue() {
  try {
    return await getActiveIssue();
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

  for (const source of sources) {
    const rows = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.source, source))
      .orderBy(desc(syncRuns.startedAt))
      .limit(10);

    const lastRun = rows[0] ?? null;
    const lastSuccess = rows.find((r) => r.status === "ok") ?? null;

    results.push({
      source,
      lastRunAt: lastRun?.startedAt ? new Date(lastRun.startedAt).toISOString() : null,
      lastSuccessAt: lastSuccess?.finishedAt
        ? new Date(lastSuccess.finishedAt).toISOString()
        : null,
      latestImportedDate: lastSuccess?.endDay ?? null,
      lastError: lastRun && lastRun.status !== "ok" ? (lastRun.error ?? null) : null,
    });
  }

  return results;
}
