import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  dailyMetrics,
  readinessScores,
  sleepRecords,
  subjectiveCheckins,
} from "@/lib/db/schema";

/**
 * Daily row for trends/history. All fields may be null when a source is
 * missing for that day — the page renders gaps explicitly rather than
 * interpolating, which would hide real sync issues.
 */
export type TrendDay = {
  date: string;
  score: number | null;
  status: string | null;
  hrv: number | null;
  rhr: number | null;
  sleepMinutes: number | null;
  trainingLoad: number | null;
  trainingLoadRatio: number | null;
  checkedIn: boolean;
};

export type TrendRange = {
  days: TrendDay[];
  latest: {
    score: {
      score: number;
      status: string;
      recommendation: string;
      confidence: string;
      computedAt: Date;
    } | null;
    sleep: {
      totalDurationMinutes: number | null;
      qualityScore: number | null;
      updatedAt: Date;
    } | null;
    checkin: {
      date: string;
      energy: number | null;
      mood: number | null;
      soreness: number | null;
      stress: number | null;
      illness: number | null;
      updatedAt: Date;
    } | null;
  };
};

/**
 * Fetch all daily rows within [fromDate, toDate] (inclusive). Dates are
 * compact YYYYMMDD strings — Postgres `text` columns sort lexicographically
 * in that format, so range queries are fast and index-friendly.
 */
export async function getTrends(
  fromDate: string,
  toDate: string,
): Promise<TrendRange> {
  const db = getDb();

  const [scores, metrics, sleeps, checkins, latestScore, latestSleep, latestCheckin] =
    await Promise.all([
      db
        .select({
          date: readinessScores.date,
          score: readinessScores.score,
          status: readinessScores.status,
        })
        .from(readinessScores)
        .where(
          and(gte(readinessScores.date, fromDate), lte(readinessScores.date, toDate)),
        ),
      db
        .select({
          date: dailyMetrics.date,
          avgSleepHrv: dailyMetrics.avgSleepHrv,
          rhr: dailyMetrics.rhr,
          trainingLoad: dailyMetrics.trainingLoad,
          trainingLoadRatio: dailyMetrics.trainingLoadRatio,
        })
        .from(dailyMetrics)
        .where(and(gte(dailyMetrics.date, fromDate), lte(dailyMetrics.date, toDate))),
      db
        .select({
          date: sleepRecords.date,
          totalDurationMinutes: sleepRecords.totalDurationMinutes,
        })
        .from(sleepRecords)
        .where(and(gte(sleepRecords.date, fromDate), lte(sleepRecords.date, toDate))),
      db
        .select({ date: subjectiveCheckins.date })
        .from(subjectiveCheckins)
        .where(
          and(
            gte(subjectiveCheckins.date, fromDate),
            lte(subjectiveCheckins.date, toDate),
          ),
        ),
      db
        .select({
          score: readinessScores.score,
          status: readinessScores.status,
          recommendation: readinessScores.recommendation,
          confidence: readinessScores.confidence,
          computedAt: readinessScores.computedAt,
        })
        .from(readinessScores)
        .where(lte(readinessScores.date, toDate))
        .orderBy(desc(readinessScores.date))
        .limit(1),
      db
        .select({
          totalDurationMinutes: sleepRecords.totalDurationMinutes,
          qualityScore: sleepRecords.qualityScore,
          updatedAt: sleepRecords.updatedAt,
        })
        .from(sleepRecords)
        .where(lte(sleepRecords.date, toDate))
        .orderBy(desc(sleepRecords.date))
        .limit(1),
      db
        .select({
          date: subjectiveCheckins.date,
          energy: subjectiveCheckins.energy,
          mood: subjectiveCheckins.mood,
          soreness: subjectiveCheckins.soreness,
          stress: subjectiveCheckins.stress,
          illness: subjectiveCheckins.illness,
          updatedAt: subjectiveCheckins.updatedAt,
        })
        .from(subjectiveCheckins)
        .where(eq(subjectiveCheckins.date, toDate))
        .limit(1),
    ]);

  const byDate = new Map<string, TrendDay>();
  const ensure = (d: string): TrendDay => {
    let row = byDate.get(d);
    if (!row) {
      row = {
        date: d,
        score: null,
        status: null,
        hrv: null,
        rhr: null,
        sleepMinutes: null,
        trainingLoad: null,
        trainingLoadRatio: null,
        checkedIn: false,
      };
      byDate.set(d, row);
    }
    return row;
  };

  for (const r of scores) {
    const row = ensure(r.date);
    row.score = r.score;
    row.status = r.status;
  }
  for (const m of metrics) {
    const row = ensure(m.date);
    row.hrv = m.avgSleepHrv ?? null;
    row.rhr = m.rhr ?? null;
    row.trainingLoad = m.trainingLoad ?? null;
    row.trainingLoadRatio = m.trainingLoadRatio ?? null;
  }
  for (const s of sleeps) {
    const row = ensure(s.date);
    row.sleepMinutes = s.totalDurationMinutes ?? null;
  }
  for (const c of checkins) {
    ensure(c.date).checkedIn = true;
  }

  // Pad missing calendar days inside the range so the chart x-axis is even
  // and gaps (missed sync / missing sleep) render as breaks, not implicit
  // straight lines between the nearest samples.
  const filled: TrendDay[] = [];
  let cursor = fromDate;
  const guard = 400; // sanity bound on any single range we'd ever pass
  let i = 0;
  while (cursor <= toDate && i < guard) {
    filled.push(byDate.get(cursor) ?? ensure(cursor));
    cursor = addDaysIso(cursor, 1);
    i += 1;
  }

  return {
    days: filled,
    latest: {
      score: latestScore[0] ?? null,
      sleep: latestSleep[0] ?? null,
      checkin: latestCheckin[0] ?? null,
    },
  };
}

/**
 * YYYYMMDD string arithmetic. We keep using the compact format (inherited
 * from the legacy Python keys) everywhere, so this is the single helper that
 * understands how to move a day forward or backward.
 */
export function addDaysIso(compact: string, delta: number): string {
  const y = Number(compact.slice(0, 4));
  const m = Number(compact.slice(4, 6)) - 1;
  const d = Number(compact.slice(6, 8));
  const dt = new Date(Date.UTC(y, m, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear().toString().padStart(4, "0");
  const mm = (dt.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = dt.getUTCDate().toString().padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

export function formatShortDate(compact: string): string {
  const y = Number(compact.slice(0, 4));
  const m = Number(compact.slice(4, 6)) - 1;
  const d = Number(compact.slice(6, 8));
  const dt = new Date(Date.UTC(y, m, d));
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(dt);
}
