import { EmptyState } from "@/components/empty-state";
import { Panel, SectionTitle } from "@/components/section";
import { getCheckin, getCheckinHistory } from "@/lib/contracts/checkin";
import { getActiveIssue, getIssueCheckin, getIssues } from "@/lib/contracts/issue";
import { addDaysIso } from "@/lib/contracts/trends";
import type { ActiveIssue } from "@/lib/db/schema";
import { appTimezone, todayIsoDate } from "@/lib/time";
import { createIssueAction, recoverIssueAction } from "./actions";
import { CheckInForm } from "./form";
import { CheckinHeatmap } from "./heatmap";

export const dynamic = "force-dynamic";

/**
 * Server-rendered shell for the check-in page. We fetch today's existing row
 * on the server so the form is pre-filled, then hand off to the client
 * component for interactivity. Any DB failure (missing DATABASE_URL, network)
 * degrades to an empty-state panel rather than crashing the page.
 */

const HISTORY_DAYS = 14;

async function loadInitial(date: string) {
  if (!process.env.DATABASE_URL) {
    return { ok: false as const, error: "DATABASE_URL not configured" };
  }
  try {
    const fromDate = addDaysIso(date, -(HISTORY_DAYS - 1));
    const [row, history, activeIssue, issues] = await Promise.all([
      getCheckin(date),
      getCheckinHistory(fromDate, date),
      safeGetActiveIssue(),
      safeGetIssues(),
    ]);
    const issueCheckin = activeIssue ? await safeGetIssueCheckin(activeIssue.id, date) : null;
    return { ok: true as const, row, history, activeIssue, issues, issueCheckin };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "unknown error",
    };
  }
}

export default async function CheckInPage() {
  const tz = appTimezone();
  const date = todayIsoDate(tz);
  const loaded = await loadInitial(date);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10">
      <header>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
          Check-In · {date}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          How do you feel?
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Rate energy, mood, soreness and stress on a 1–5 scale. The next score
          refresh will fold this in.
        </p>
      </header>

      {loaded.ok ? (
        <>
          <IssueManager activeIssue={loaded.activeIssue} issues={loaded.issues} />
          <CheckInForm
            date={date}
            initial={loaded.row}
            activeIssue={loaded.activeIssue}
            initialIssueCheckin={loaded.issueCheckin}
          />
          <CheckinHeatmap history={loaded.history} today={date} days={HISTORY_DAYS} />
        </>
      ) : (
        <EmptyState
          title="Not connected yet"
          description={`Can't load today's check-in: ${loaded.error}. Set DATABASE_URL in .env.local and run "npm run db:push".`}
        />
      )}
    </div>
  );
}

async function safeGetActiveIssue() {
  try {
    return await getActiveIssue();
  } catch {
    return null;
  }
}

async function safeGetIssues() {
  try {
    return await getIssues();
  } catch {
    return [];
  }
}

async function safeGetIssueCheckin(issueId: number, date: string) {
  try {
    return await getIssueCheckin(issueId, date);
  } catch {
    return null;
  }
}

function IssueManager({
  activeIssue,
  issues,
}: {
  activeIssue: ActiveIssue | null;
  issues: ActiveIssue[];
}) {
  const recent = issues.filter((issue) => issue.status !== "active").slice(0, 4);

  return (
    <Panel className="space-y-5">
      <SectionTitle
        title="Active Issue"
        action={
          activeIssue ? (
            <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-accent)]">
              {activeIssue.status}
            </span>
          ) : (
            <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
              none
            </span>
          )
        }
      />

      {activeIssue ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-lg font-semibold text-white">
                {activeIssue.label}
              </p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                {[activeIssue.side, activeIssue.area, activeIssue.subtype]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <form action={recoverIssueAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="issueId" value={activeIssue.id} />
              <input
                name="notes"
                type="text"
                placeholder="Recovery note"
                className="min-w-0 rounded-full border border-[var(--color-border)] bg-transparent px-3 py-2 text-xs text-white placeholder:text-[var(--color-subtle)] focus:border-[var(--color-accent)] focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-full border border-[var(--color-accent)]/50 px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)] transition hover:bg-[var(--color-accent-soft)]"
              >
                Mark recovered
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <form action={createIssueAction} className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm text-[var(--color-muted)]">
          <span className="font-display text-[10px] uppercase tracking-[0.18em]">
            Area
          </span>
          <select
            name="area"
            defaultValue="other"
            required
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="achilles">Achilles</option>
            <option value="calf">Calf</option>
            <option value="knee">Knee</option>
            <option value="hamstring">Hamstring</option>
            <option value="hip">Hip</option>
            <option value="foot">Foot</option>
            <option value="back">Back</option>
            <option value="shoulder">Shoulder</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="space-y-1 text-sm text-[var(--color-muted)]">
          <span className="font-display text-[10px] uppercase tracking-[0.18em]">
            Side
          </span>
          <select
            name="side"
            defaultValue={activeIssue?.side ?? "left"}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="both">Both</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label className="space-y-1 text-sm text-[var(--color-muted)] md:col-span-2">
          <span className="font-display text-[10px] uppercase tracking-[0.18em]">
            Label
          </span>
          <input
            name="label"
            required
            placeholder="Right knee niggle"
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white placeholder:text-[var(--color-subtle)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </label>
        <label className="space-y-1 text-sm text-[var(--color-muted)]">
          <span className="font-display text-[10px] uppercase tracking-[0.18em]">
            Type
          </span>
          <input
            name="subtype"
            placeholder="tendon, muscle, joint"
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white placeholder:text-[var(--color-subtle)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </label>
        <label className="space-y-1 text-sm text-[var(--color-muted)]">
          <span className="font-display text-[10px] uppercase tracking-[0.18em]">
            Suspected issue
          </span>
          <input
            name="suspectedIssue"
            placeholder="Patellar tendon irritation"
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white placeholder:text-[var(--color-subtle)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </label>
        <label className="space-y-1 text-sm text-[var(--color-muted)] md:col-span-2">
          <span className="font-display text-[10px] uppercase tracking-[0.18em]">
            Notes
          </span>
          <input
            name="notes"
            placeholder="Started after hills, worse on stairs"
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white placeholder:text-[var(--color-subtle)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            className="rounded-full bg-[var(--color-accent)] px-4 py-2 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b1320] transition hover:brightness-110"
          >
            Add issue
          </button>
        </div>
      </form>

      {recent.length > 0 ? (
        <div className="space-y-2">
          <p className="font-display text-[10px] uppercase tracking-[0.18em] text-[var(--color-subtle)]">
            Recent
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {recent.map((issue) => (
              <div
                key={issue.id}
                className="rounded-2xl border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-muted)]"
              >
                <span className="text-white">{issue.label}</span>
                <span className="ml-2 text-[var(--color-subtle)]">
                  {issue.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
