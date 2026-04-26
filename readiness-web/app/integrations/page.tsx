import { Activity, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { JobActionButton } from "@/components/job-action-button";
import { Panel, SectionTitle } from "@/components/section";
import { getIntegrationStatus } from "@/lib/contracts/integrations";
import type { SourceFreshness } from "@/lib/contracts/types";
import { formatRelative } from "@/lib/time";

export const dynamic = "force-dynamic";

async function loadStatus() {
  if (!process.env.DATABASE_URL) {
    return { ok: false as const, error: "DATABASE_URL not configured" };
  }
  try {
    return { ok: true as const, status: await getIntegrationStatus() };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "unknown error",
    };
  }
}

export default async function IntegrationsPage() {
  const loaded = await loadStatus();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
            Sync
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            Integrations
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Intervals is the hosted data source. Coros and Strava remain optional enrichments.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <JobActionButton
            kind="intervals_refresh"
            label="Intervals refresh"
            requestedBy="integrations-page"
          />
          <JobActionButton kind="score" label="Score now" requestedBy="integrations-page" />
        </div>
      </header>

      {!loaded.ok ? (
        <EmptyState
          title="Not connected yet"
          description={`Sync status can't load: ${loaded.error}. Set DATABASE_URL in .env.local and run a sync.`}
        />
      ) : (
        <>
          <section>
            <SectionTitle title="Sources" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {loaded.status.sources.map((source) => (
                <SourceCard key={source.source} source={source} />
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <Panel>
              <SectionTitle title="Recent Sync Runs" />
              <div className="divide-y divide-[var(--color-border)]">
                {loaded.status.recentRuns.length ? (
                  loaded.status.recentRuns.slice(0, 10).map((run) => (
                    <div key={run.id} className="grid grid-cols-[1fr_auto] gap-3 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-white">
                          {run.source}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-muted)]">
                          {run.startDay ?? "?"} to {run.endDay ?? "?"} · daily {run.dailyCount ?? 0} · sleep {run.sleepCount ?? 0} · activity {run.activityCount ?? 0}
                        </p>
                        {run.error ? (
                          <p className="mt-1 line-clamp-2 text-xs text-rose-300">{run.error}</p>
                        ) : null}
                      </div>
                      <div className="text-right text-xs text-[var(--color-muted)]">
                        <StatusPill status={run.status} />
                        <p className="mt-1">{formatRelative(asIso(run.finishedAt ?? run.startedAt))}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-6 text-sm text-[var(--color-muted)]">No sync runs yet.</p>
                )}
              </div>
            </Panel>

            <Panel>
              <SectionTitle title="Recent Jobs" />
              <div className="space-y-3">
                {loaded.status.recentJobs.length ? (
                  loaded.status.recentJobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-white">
                            {job.kind}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-muted)]">
                            {job.requestedBy ?? "unknown"} · attempts {job.attempts}
                          </p>
                        </div>
                        <StatusPill status={job.status} />
                      </div>
                      {job.lastError ? (
                        <p className="mt-2 line-clamp-3 text-xs text-rose-300">{job.lastError}</p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--color-muted)]">No queued jobs yet.</p>
                )}
              </div>
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}

function SourceCard({ source }: { source: SourceFreshness }) {
  const hasError = Boolean(source.lastError);
  const hasSuccess = Boolean(source.lastSuccessAt);
  const Icon = hasError ? AlertCircle : hasSuccess ? CheckCircle2 : Clock;

  return (
    <Panel className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
            {source.source}
          </p>
          <p className="mt-2 text-2xl font-semibold text-white">{sourceLabel(source)}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--color-surface-2)]">
          <Icon className={hasError ? "h-5 w-5 text-rose-300" : "h-5 w-5 text-[var(--color-accent)]"} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <Mini label="Last run" value={formatRelative(source.lastRunAt)} />
        <Mini label="Last success" value={formatRelative(source.lastSuccessAt)} />
        <Mini label="Latest date" value={formatCompactDay(source.latestImportedDate)} />
        <Mini label="State" value={hasError ? "error" : hasSuccess ? "ok" : "pending"} />
      </div>
      {source.lastError ? (
        <p className="line-clamp-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {source.lastError}
        </p>
      ) : null}
    </Panel>
  );
}

function sourceLabel(source: SourceFreshness) {
  if (source.source === "intervals") return "Primary";
  if (source.source === "coros") return "Local";
  return "Optional";
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-[10px] uppercase tracking-[0.16em] text-[var(--color-subtle)]">
        {label}
      </p>
      <p className="mt-1 truncate text-[var(--color-muted)]">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const ok = ["ok", "success", "succeeded"].includes(status);
  const bad = ["failed", "error", "cancelled"].includes(status);
  return (
    <span
      className={
        ok
          ? "inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-soft)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--color-accent)]"
          : bad
            ? "inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-rose-300"
            : "inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]"
      }
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : bad ? <AlertCircle className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
      {status}
    </span>
  );
}

function formatCompactDay(value: string | null) {
  if (!value) return "none";
  if (!/^\d{8}$/u.test(value)) return value;
  return `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`;
}

function asIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}
