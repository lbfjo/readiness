"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Loader2, RefreshCw } from "lucide-react";
import type { JobQueueRow } from "@/lib/db/schema";
import { isTerminalStatus } from "@/lib/contracts/jobs";

type Props = {
  initialLatestJob: JobQueueRow | null;
};

type UiState =
  | { kind: "idle" }
  | { kind: "queued"; jobId: number }
  | { kind: "running"; jobId: number }
  | { kind: "succeeded"; at: Date }
  | { kind: "failed"; message: string };

/**
 * Kicks off a full "refresh" job (sync + score + insight) on the laptop
 * poller. The button polls GET /api/jobs/:id every 2s until the job leaves
 * the pending/running set, then refreshes the page so the new data shows.
 */
export function RefreshButton({ initialLatestJob }: Props) {
  const router = useRouter();
  const [state, setState] = useState<UiState>(() => initialUiState(initialLatestJob));
  const pollHandle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollHandle.current) clearTimeout(pollHandle.current);
    };
  }, []);

  async function enqueue() {
    setState({ kind: "queued", jobId: -1 });
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "refresh", requestedBy: "today-page" }),
      });
      const body = await res.json();
      if (!res.ok || !body.job) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const job: JobQueueRow = body.job;
      setState({ kind: "queued", jobId: job.id });
      schedulePoll(job.id);
    } catch (err) {
      setState({
        kind: "failed",
        message: err instanceof Error ? err.message : "refresh failed",
      });
    }
  }

  function schedulePoll(jobId: number) {
    if (pollHandle.current) clearTimeout(pollHandle.current);
    pollHandle.current = setTimeout(() => pollJob(jobId), 2000);
  }

  async function pollJob(jobId: number) {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body.job) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const job: JobQueueRow = body.job;
      if (isTerminalStatus(job.status)) {
        if (job.status === "succeeded") {
          setState({ kind: "succeeded", at: new Date() });
          router.refresh();
        } else {
          setState({
            kind: "failed",
            message: job.lastError ?? `job ${job.status}`,
          });
        }
        return;
      }
      setState({ kind: job.status === "running" ? "running" : "queued", jobId });
      schedulePoll(jobId);
    } catch (err) {
      setState({
        kind: "failed",
        message: err instanceof Error ? err.message : "status check failed",
      });
    }
  }

  const disabled = state.kind === "queued" || state.kind === "running";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={enqueue}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-4 py-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {disabled ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        Refresh
      </button>
      <StatusLine state={state} />
    </div>
  );
}

function StatusLine({ state }: { state: UiState }) {
  if (state.kind === "idle") return null;

  if (state.kind === "queued") {
    return (
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
        queued…
      </p>
    );
  }
  if (state.kind === "running") {
    return (
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-accent)]">
        syncing on laptop…
      </p>
    );
  }
  if (state.kind === "succeeded") {
    return (
      <p className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-accent)]">
        <CheckCircle2 className="h-3 w-3" />
        updated {formatRelative(state.at)}
      </p>
    );
  }
  return (
    <p className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-rose-300">
      <CircleAlert className="h-3 w-3" />
      {state.message}
    </p>
  );
}

function initialUiState(job: JobQueueRow | null): UiState {
  if (!job) return { kind: "idle" };
  if (job.status === "pending") return { kind: "queued", jobId: job.id };
  if (job.status === "running") return { kind: "running", jobId: job.id };
  if (job.status === "succeeded") {
    return {
      kind: "succeeded",
      at: job.finishedAt ? new Date(job.finishedAt) : new Date(),
    };
  }
  if (job.status === "failed") {
    return { kind: "failed", message: job.lastError ?? "last refresh failed" };
  }
  return { kind: "idle" };
}

function formatRelative(d: Date): string {
  const diffMin = Math.round((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}
