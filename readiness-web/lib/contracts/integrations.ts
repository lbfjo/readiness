import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { settings, syncRuns, type SyncRun } from "@/lib/db/schema";
import { getRecentJobs, type JobStatusRow } from "./jobs";
import type { SourceFreshness } from "./types";

const SOURCES: SourceFreshness["source"][] = ["intervals", "coros", "strava"];

export type IntegrationStatus = {
  sources: SourceFreshness[];
  recentRuns: SyncRun[];
  recentJobs: JobStatusRow[];
  workerHeartbeat: {
    status?: string;
    pid?: number;
    updated_at?: string;
  } | null;
};

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const db = getDb();
  const [runs, jobs, heartbeatRows] = await Promise.all([
    db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(30),
    getRecentJobs(12),
    db.select().from(settings).where(eq(settings.key, "worker_heartbeat")).limit(1),
  ]);

  return {
    sources: SOURCES.map((source) => freshnessFor(source, runs)),
    recentRuns: runs,
    recentJobs: jobs,
    workerHeartbeat: heartbeatRows[0]?.value && typeof heartbeatRows[0].value === "object"
      ? heartbeatRows[0].value
      : null,
  };
}

function freshnessFor(
  source: SourceFreshness["source"],
  runs: SyncRun[],
): SourceFreshness {
  const sourceRuns = runs.filter((run) => run.source === source);
  const lastRun = sourceRuns[0] ?? null;
  const lastSuccess =
    sourceRuns.find((run) => ["ok", "success", "succeeded"].includes(run.status)) ??
    null;

  return {
    source,
    lastRunAt: lastRun?.startedAt ? new Date(lastRun.startedAt).toISOString() : null,
    lastSuccessAt: lastSuccess?.finishedAt
      ? new Date(lastSuccess.finishedAt).toISOString()
      : null,
    latestImportedDate: lastSuccess?.endDay ?? null,
    lastError: lastRun && !["ok", "success", "succeeded"].includes(lastRun.status)
      ? (lastRun.error ?? null)
      : null,
  };
}
