import { EmptyState } from "@/components/empty-state";

export default function IntegrationsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
          Sync
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Integrations</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Status for Coros, Strava, and Intervals, backed by sync_runs.
        </p>
      </header>
      <EmptyState
        title="Coming in Week 2"
        description="Last run, last success, latest imported date, error, Sync now action."
      />
    </div>
  );
}
