import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { subjectiveCheckins, type SubjectiveCheckin } from "@/lib/db/schema";
import type { CheckinPayload } from "./types";

/**
 * Contract queries for `/check-in`. The write side upserts on `date` so the
 * same day can be edited repeatedly without creating duplicates. The Python
 * side reads this row back before the next rescore (see
 * `health_readiness/checkin_sync.py`).
 */

export async function getCheckin(date: string): Promise<SubjectiveCheckin | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(subjectiveCheckins)
    .where(eq(subjectiveCheckins.date, date))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Fetch all check-ins in [fromDate, toDate] (inclusive, compact YYYYMMDD).
 * Returned ascending by date so the heatmap can iterate left-to-right.
 * Missing days are *not* padded — the caller decides how to render gaps.
 */
export async function getCheckinHistory(
  fromDate: string,
  toDate: string,
): Promise<SubjectiveCheckin[]> {
  const db = getDb();
  return db
    .select()
    .from(subjectiveCheckins)
    .where(
      and(
        gte(subjectiveCheckins.date, fromDate),
        lte(subjectiveCheckins.date, toDate),
      ),
    )
    .orderBy(desc(subjectiveCheckins.date));
}

export async function upsertCheckin(payload: CheckinPayload): Promise<SubjectiveCheckin> {
  const db = getDb();
  const now = new Date();

  const values = {
    date: payload.date,
    energy: payload.energy ?? null,
    mood: payload.mood ?? null,
    soreness: payload.soreness ?? null,
    stress: payload.stress ?? null,
    illness: payload.illness ?? 0,
    notes: payload.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const [row] = await db
    .insert(subjectiveCheckins)
    .values(values)
    .onConflictDoUpdate({
      target: subjectiveCheckins.date,
      set: {
        energy: values.energy,
        mood: values.mood,
        soreness: values.soreness,
        stress: values.stress,
        illness: values.illness,
        notes: values.notes,
        updatedAt: values.updatedAt,
      },
    })
    .returning();

  return row;
}
