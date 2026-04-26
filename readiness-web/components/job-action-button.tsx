"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import type { JobKind } from "@/lib/contracts/jobs";

export function JobActionButton({
  kind,
  label,
  payload,
  requestedBy,
}: {
  kind: JobKind;
  label: string;
  payload?: Record<string, unknown>;
  requestedBy: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "pending" | "error">("idle");

  async function enqueue() {
    setState("pending");
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, payload, requestedBy }),
      });
      const body = await res.json();
      if (!res.ok || !body.job) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <button
      type="button"
      onClick={enqueue}
      disabled={state === "pending"}
      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-4 font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {state === "pending" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      {state === "error" ? "Failed" : label}
    </button>
  );
}
