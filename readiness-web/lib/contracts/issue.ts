import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { activeIssues, issueCheckins, type ActiveIssue, type IssueCheckin } from "@/lib/db/schema";

export async function getActiveIssue(): Promise<ActiveIssue | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(activeIssues)
    .where(eq(activeIssues.status, "active"))
    .orderBy(desc(activeIssues.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getIssueCheckin(
  issueId: number,
  date: string,
): Promise<IssueCheckin | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(issueCheckins)
    .where(and(eq(issueCheckins.issueId, issueId), eq(issueCheckins.date, date)))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertIssueCheckin(payload: {
  issueId: number;
  date: string;
  firstStepPain?: number | null;
  painWalking?: number | null;
  painStairs?: number | null;
  morningStiffnessMinutes?: number | null;
  limp?: boolean;
  warmupResponse?: "better" | "same" | "worse" | null;
  notes?: string | null;
}): Promise<IssueCheckin> {
  const db = getDb();
  const now = new Date();

  const values = {
    issueId: payload.issueId,
    date: payload.date,
    firstStepPain: payload.firstStepPain ?? null,
    painWalking: payload.painWalking ?? null,
    painStairs: payload.painStairs ?? null,
    painDuringActivity: null,
    painAfterActivity: null,
    morningStiffnessMinutes: payload.morningStiffnessMinutes ?? null,
    limp: payload.limp ?? false,
    warmupResponse: payload.warmupResponse ?? null,
    mechanicsChanged: false,
    notes: payload.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const [row] = await db
    .insert(issueCheckins)
    .values(values)
    .onConflictDoUpdate({
      target: [issueCheckins.issueId, issueCheckins.date],
      set: {
        firstStepPain: values.firstStepPain,
        painWalking: values.painWalking,
        painStairs: values.painStairs,
        morningStiffnessMinutes: values.morningStiffnessMinutes,
        limp: values.limp,
        warmupResponse: values.warmupResponse,
        notes: values.notes,
        updatedAt: values.updatedAt,
      },
    })
    .returning();

  return row;
}
