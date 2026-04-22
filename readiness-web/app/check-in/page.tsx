import { EmptyState } from "@/components/empty-state";
import { getCheckin, getCheckinHistory } from "@/lib/contracts/checkin";
import { getActiveIssue, getIssueCheckin } from "@/lib/contracts/issue";
import { addDaysIso } from "@/lib/contracts/trends";
import { appTimezone, todayIsoDate } from "@/lib/time";
import { CheckInForm } from "./form";
import { CheckinHeatmap } from "./heatmap";

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
    const [row, history, activeIssue] = await Promise.all([
      getCheckin(date),
      getCheckinHistory(fromDate, date),
      safeGetActiveIssue(),
    ]);
    const issueCheckin = activeIssue ? await safeGetIssueCheckin(activeIssue.id, date) : null;
    return { ok: true as const, row, history, activeIssue, issueCheckin };
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

async function safeGetIssueCheckin(issueId: number, date: string) {
  try {
    return await getIssueCheckin(issueId, date);
  } catch {
    return null;
  }
}
