import { EmptyState } from "@/components/empty-state";

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
          Settings
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Your setup</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Timezone, units, AI provider, and maintenance actions.
        </p>
      </header>
      <EmptyState
        title="Coming in Week 4"
        description="Timezone, thresholds, AI toggle + provider (Codex default), daily regen cap, manual Sync / Regenerate insight."
      />
    </div>
  );
}
