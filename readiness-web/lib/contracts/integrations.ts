import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { syncRuns, type SyncRun } from "@/lib/db/schema";
import { getRecentJobs } from "./jobs";
import type { JobQueueRow } from "@/lib/db/schema";
import type { SourceFreshness } from "./types";

const SOURCES: SourceFreshness["source"][] = ["intervals", "coros", "strava"];

export type IntegrationStatus = {
  sources: SourceFreshness[];
  recentRuns: SyncRun[];
  recentJobs: JobQueueRow[];
};

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const db = getDb();
  const [runs, jobs] = await Promise.all([
    db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(30),
    getRecentJobs(12),
  ]);

  return {
    sources: SOURCES.map((source) => freshnessFor(source, runs)),
    recentRuns: runs,
    recentJobs: jobs,
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
