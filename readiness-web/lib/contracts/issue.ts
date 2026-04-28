import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { activeIssues, issueCheckins, type ActiveIssue, type IssueCheckin } from "@/lib/db/schema";

export async function getIssues(limit = 20): Promise<ActiveIssue[]> {
  const db = getDb();
  return db
    .select()
    .from(activeIssues)
    .orderBy(desc(activeIssues.updatedAt))
    .limit(limit);
}

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

export async function createActiveIssue(payload: {
  area: string;
  subtype?: string | null;
  label: string;
  side?: string | null;
  suspectedIssue?: string | null;
  triggerMovements?: string[] | null;
  aggravators?: string[] | null;
  relievers?: string[] | null;
  notes?: string | null;
  startedAt?: Date | null;
}): Promise<ActiveIssue> {
  const db = getDb();
  const now = new Date();
  const area = normalizeKey(payload.area);
  const label = payload.label.trim();

  await db
    .update(activeIssues)
    .set({ status: "monitoring", updatedAt: now })
    .where(eq(activeIssues.status, "active"));

  const [row] = await db
    .insert(activeIssues)
    .values({
      slug: `${slugify(label)}-${Date.now()}`,
      area,
      subtype: normalizeNullable(payload.subtype),
      label,
      side: normalizeNullable(payload.side),
      status: "active",
      stage: "monitoring",
      suspectedIssue: normalizeNullable(payload.suspectedIssue),
      triggerMovementsJson: payload.triggerMovements ?? defaultTriggerMovements(area),
      aggravatorsJson: payload.aggravators ?? defaultAggravators(area),
      relieversJson: payload.relievers ?? [],
      notes: normalizeNullable(payload.notes),
      startedAt: payload.startedAt ?? now,
      resolvedAt: null,
      updatedAt: now,
    })
    .returning();

  return row;
}

export async function markIssueRecovered(issueId: number, notes?: string | null): Promise<ActiveIssue> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .update(activeIssues)
    .set({
      status: "recovered",
      stage: "recovered",
      resolvedAt: now,
      notes: normalizeNullable(notes),
      updatedAt: now,
    })
    .where(eq(activeIssues.id, issueId))
    .returning();
  return row;
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
  painDuringActivity?: number | null;
  painAfterActivity?: number | null;
  morningStiffnessMinutes?: number | null;
  limp?: boolean;
  warmupResponse?: "better" | "same" | "worse" | null;
  mechanicsChanged?: boolean;
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
    painDuringActivity: payload.painDuringActivity ?? null,
    painAfterActivity: payload.painAfterActivity ?? null,
    morningStiffnessMinutes: payload.morningStiffnessMinutes ?? null,
    limp: payload.limp ?? false,
    warmupResponse: payload.warmupResponse ?? null,
    mechanicsChanged: payload.mechanicsChanged ?? false,
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
        painDuringActivity: values.painDuringActivity,
        painAfterActivity: values.painAfterActivity,
        morningStiffnessMinutes: values.morningStiffnessMinutes,
        limp: values.limp,
        warmupResponse: values.warmupResponse,
        mechanicsChanged: values.mechanicsChanged,
        notes: values.notes,
        updatedAt: values.updatedAt,
      },
    })
    .returning();

  return row;
}

function normalizeNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/(^-|-$)/gu, "")
    .slice(0, 48) || "issue";
}

function defaultTriggerMovements(area: string): string[] {
  switch (area) {
    case "achilles":
    case "calf":
    case "foot":
    case "knee":
      return ["running", "hills", "stairs"];
    case "hamstring":
      return ["running", "speed", "hills"];
    case "back":
      return ["lifting", "bending", "impact"];
    default:
      return [];
  }
}

function defaultAggravators(area: string): string[] {
  switch (area) {
    case "achilles":
      return ["dorsiflexion", "hills", "speed"];
    case "hamstring":
      return ["speed", "strides", "lengthened loading"];
    case "knee":
      return ["downhill", "stairs", "deep flexion"];
    case "calf":
      return ["speed", "hills", "plyometrics"];
    default:
      return [];
  }
}
