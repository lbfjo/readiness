import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buildDailyDecision } from "@/lib/decision-support/engine";
import {
  dailyDecisions,
  plannedSessions,
  readinessScores,
  subjectiveCheckins,
} from "@/lib/db/schema";
import { getActiveIssue, getIssueCheckin } from "./issue";
import type { DailyDecision } from "./types";

export async function getPersistedDecision(date: string): Promise<DailyDecision | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(dailyDecisions)
    .where(eq(dailyDecisions.date, date))
    .limit(1);
  const raw = rows[0]?.rawJson;
  return isDailyDecision(raw) ? raw : null;
}

export async function upsertDailyDecision(
  date: string,
  decision: DailyDecision,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .insert(dailyDecisions)
    .values({
      date,
      rulesVersion: decision.rulesVersion,
      readinessBand: decision.readinessBand,
      tissueBand: decision.tissueBand,
      primaryGoal: decision.primaryGoal,
      limiter: decision.limiter,
      priority: decision.priority,
      decision: decision.decision,
      reasonCodesJson: decision.reasonCodes,
      recommendedModificationJson: decision.recommendedModification,
      rehabPrescriptionJson: decision.rehabToday,
      redFlagsJson: decision.redFlags,
      rawJson: decision,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: dailyDecisions.date,
      set: {
        rulesVersion: decision.rulesVersion,
        readinessBand: decision.readinessBand,
        tissueBand: decision.tissueBand,
        primaryGoal: decision.primaryGoal,
        limiter: decision.limiter,
        priority: decision.priority,
        decision: decision.decision,
        reasonCodesJson: decision.reasonCodes,
        recommendedModificationJson: decision.recommendedModification,
        rehabPrescriptionJson: decision.rehabToday,
        redFlagsJson: decision.redFlags,
        rawJson: decision,
        updatedAt: now,
      },
    });
}

export async function computeAndPersistDailyDecision(
  date: string,
): Promise<DailyDecision | null> {
  const db = getDb();
  const [score, checkin, planned, activeIssue] = await Promise.all([
    db.select().from(readinessScores).where(eq(readinessScores.date, date)).limit(1),
    db.select().from(subjectiveCheckins).where(eq(subjectiveCheckins.date, date)).limit(1),
    db.select().from(plannedSessions).where(eq(plannedSessions.date, date)),
    safeGetActiveIssue(),
  ]);
  const issueCheckin = activeIssue ? await safeGetIssueCheckin(activeIssue.id, date) : null;
  const decision = buildDailyDecision({
    issue: activeIssue,
    issueCheckin,
    planned,
    score: score[0] ?? null,
    checkin: checkin[0] ?? null,
  });
  if (!decision) return null;
  await upsertDailyDecision(date, decision);
  return decision;
}

function isDailyDecision(value: unknown): value is DailyDecision {
  return Boolean(value && typeof value === "object" && "decision" in value);
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
