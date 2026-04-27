import { Panel, SectionTitle } from "@/components/section";
import { getDb } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

type SettingsMap = Record<string, unknown>;

async function loadSettings(): Promise<SettingsMap> {
  if (!process.env.DATABASE_URL) return {};
  try {
    const db = getDb();
    const rows = await db.select().from(settings);
    const map: SettingsMap = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }
    return map;
  } catch {
    return {};
  }
}

async function saveSetting(key: string, value: unknown) {
  "use server";
  const db = getDb();
  const now = new Date();
  await db
    .insert(settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: now },
    });
  revalidatePath("/settings");
}

export default async function SettingsPage() {
  const cfg = await loadSettings();

  const timezone = (cfg.timezone as string) ?? process.env.APP_TIMEZONE ?? "Europe/Lisbon";
  const units = (cfg.units as string) ?? "metric";
  const aiEnabled = cfg.ai_enabled !== false;
  const aiModel = (cfg.ai_model as string) ?? "gpt-4o-mini";
  const syncLongSessionMin = (cfg.sync_long_session_min as number) ?? 120;
  const checkinCutoff = (cfg.checkin_cutoff as string) ?? "12:00";

  async function updateTimezone(formData: FormData) {
    "use server";
    await saveSetting("timezone", formData.get("timezone") as string);
  }

  async function updateUnits(formData: FormData) {
    "use server";
    await saveSetting("units", formData.get("units") as string);
  }

  async function updateAiEnabled(formData: FormData) {
    "use server";
    await saveSetting("ai_enabled", formData.get("ai_enabled") === "on");
  }

  async function updateAiModel(formData: FormData) {
    "use server";
    await saveSetting("ai_model", formData.get("ai_model") as string);
  }

  async function updateSyncLong(formData: FormData) {
    "use server";
    await saveSetting("sync_long_session_min", Number(formData.get("sync_long_session_min")));
  }

  async function updateCheckinCutoff(formData: FormData) {
    "use server";
    await saveSetting("checkin_cutoff", formData.get("checkin_cutoff") as string);
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
          Configuration
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Settings</h1>
      </header>

      {/* ── Profile ── */}
      <Panel>
        <SectionTitle title="Profile" />
        <div className="space-y-4">
          <form action={updateTimezone} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-[var(--color-muted)]">
              Timezone
              <input
                name="timezone"
                type="text"
                defaultValue={timezone}
                className="w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="rounded-full bg-[var(--color-accent)] px-4 py-2 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b1320] transition hover:brightness-110"
            >
              Save
            </button>
          </form>

          <form action={updateUnits} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-[var(--color-muted)]">
              Units
              <select
                name="units"
                defaultValue={units}
                className="w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="metric">Metric (km, kg)</option>
                <option value="imperial">Imperial (mi, lb)</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-full bg-[var(--color-accent)] px-4 py-2 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b1320] transition hover:brightness-110"
            >
              Save
            </button>
          </form>
        </div>
      </Panel>

      {/* ── AI Insights ── */}
      <Panel>
        <SectionTitle title="AI Insights" />
        <div className="space-y-4">
          <form action={updateAiEnabled} className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <input
                name="ai_enabled"
                type="checkbox"
                defaultChecked={aiEnabled}
                className="h-4 w-4 rounded border-[var(--color-border)] bg-[var(--color-surface)] accent-[var(--color-accent)]"
              />
              Enable AI insights
            </label>
            <button
              type="submit"
              className="rounded-full bg-[var(--color-accent)] px-4 py-2 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b1320] transition hover:brightness-110"
            >
              Save
            </button>
          </form>

          <form action={updateAiModel} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-[var(--color-muted)]">
              Model
              <select
                name="ai_model"
                defaultValue={aiModel}
                className="w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                <option value="gpt-4.1">GPT-4.1</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-full bg-[var(--color-accent)] px-4 py-2 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b1320] transition hover:brightness-110"
            >
              Save
            </button>
          </form>
        </div>
      </Panel>

      {/* ── Sync ── */}
      <Panel>
        <SectionTitle title="Sync" />
        <div className="space-y-4">
          <form action={updateSyncLong} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-[var(--color-muted)]">
              Long session threshold (min)
              <input
                name="sync_long_session_min"
                type="number"
                min={30}
                max={300}
                defaultValue={syncLongSessionMin}
                className="w-32 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="rounded-full bg-[var(--color-accent)] px-4 py-2 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b1320] transition hover:brightness-110"
            >
              Save
            </button>
          </form>

          <form action={updateCheckinCutoff} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-[var(--color-muted)]">
              Check-in cutoff time
              <input
                name="checkin_cutoff"
                type="time"
                defaultValue={checkinCutoff}
                className="w-40 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="rounded-full bg-[var(--color-accent)] px-4 py-2 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b1320] transition hover:brightness-110"
            >
              Save
            </button>
          </form>
        </div>
      </Panel>

      {/* ── About ── */}
      <Panel>
        <SectionTitle title="About" />
        <div className="space-y-2 text-sm text-[var(--color-muted)]">
          <p>
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
              Version
            </span>{" "}
            0.1.0-alpha
          </p>
          <p>
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
              Stack
            </span>{" "}
            Next.js · Drizzle ORM · PostgreSQL · Python worker
          </p>
          <div className="flex gap-4 pt-2">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] hover:underline"
            >
              GitHub
            </a>
            <a
              href="/integrations"
              className="text-[var(--color-accent)] hover:underline"
            >
              Integrations
            </a>
          </div>
        </div>
      </Panel>

      <footer className="pt-4 text-center text-[10px] uppercase tracking-[0.22em] text-[var(--color-subtle)]">
        Track · Understand · Recover
      </footer>
    </div>
  );
}
