import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobQueue, type JobQueueRow } from "@/lib/db/schema";

/**
 * Job queue contract. The web side enqueues rows and the local Python poller
 * (`readiness/cli.py poll`) claims and executes them. We keep the surface
 * deliberately small: enqueue, fetch one, fetch the latest of a kind.
 */

export const JOB_KINDS = ["refresh", "sync", "score", "insight"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const TERMINAL_STATUSES = ["succeeded", "failed", "cancelled"] as const;
export type JobStatus =
  | "pending"
  | "running"
  | (typeof TERMINAL_STATUSES)[number];

export type EnqueueInput = {
  kind: JobKind;
  payload?: Record<string, unknown>;
  requestedBy?: string;
};

export async function enqueueJob(input: EnqueueInput): Promise<JobQueueRow> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .insert(jobQueue)
    .values({
      kind: input.kind,
      payload: (input.payload ?? {}) as Record<string, unknown>,
      status: "pending",
      attempts: 0,
      requestedBy: input.requestedBy ?? "web",
      requestedAt: now,
      isTerminal: false,
    })
    .returning();
  return row;
}

export async function getJob(id: number): Promise<JobQueueRow | null> {
  const db = getDb();
  const rows = await db.select().from(jobQueue).where(eq(jobQueue.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Most recent job of a given kind (or any kind). Used by the `/today`
 * Refresh button to show status when the user navigates away and comes back.
 */
export async function getLatestJob(
  kinds: JobKind[] | null = null,
): Promise<JobQueueRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(jobQueue)
    .where(kinds && kinds.length > 0 ? inArray(jobQueue.kind, kinds) : undefined)
    .orderBy(desc(jobQueue.requestedAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * List jobs still in flight. The poller's primary query; the web UI uses it
 * as a cheap "is something running?" check.
 */
export async function listActiveJobs(): Promise<JobQueueRow[]> {
  const db = getDb();
  return db
    .select()
    .from(jobQueue)
    .where(
      and(eq(jobQueue.isTerminal, false), inArray(jobQueue.status, ["pending", "running"])),
    )
    .orderBy(desc(jobQueue.requestedAt));
}

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}
